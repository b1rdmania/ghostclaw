/**
 * Agent Runner for GhostClaw
 * Spawns agent execution as direct Node.js processes (no containers)
 */
import { ChildProcess, spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import {
  AGENT_ABSOLUTE_TIMEOUT,
  AGENT_IDLE_TIMEOUT,
  CONTAINER_MAX_OUTPUT_SIZE,
  CONTAINER_TIMEOUT,
  DATA_DIR,
  GROUPS_DIR,
} from './config.js';
import { readEnvFile } from './env.js';
import { resolveGroupFolderPath, resolveGroupIpcPath } from './group-folder.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

// Sentinel markers for robust output parsing (must match agent-runner)
const OUTPUT_START_MARKER = '---GHOSTCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---GHOSTCLAW_OUTPUT_END---';

export interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
  secrets?: Record<string, string>;
}

export interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

/**
 * Read allowed secrets from .env for passing to the agent via stdin.
 * Secrets are never written to disk.
 */
function readSecrets(): Record<string, string> {
  return readEnvFile([
    'CLAUDE_CODE_OAUTH_TOKEN',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_AUTH_TOKEN',
    'ELEVENLABS_API_KEY',
    'ELEVENLABS_VOICE_ID',
  ]);
}

/**
 * Build the mcpServers object from global config (env vars).
 * Each MCP server added here becomes available to all agent instances.
 * Standard Claude Code settings.json format — agents/skills can also
 * add servers by editing the per-group settings.json directly.
 */
function buildGlobalMcpServers(): Record<
  string,
  { command: string; args?: string[]; env?: Record<string, string> }
> {
  const servers: Record<
    string,
    { command: string; args?: string[]; env?: Record<string, string> }
  > = {};

  if (process.env.GMAIL_MCP_ENABLED === '1') {
    servers.gmail = {
      command: 'npx',
      args: ['@gongrzhe/server-gmail-autoauth-mcp'],
    };
  }

  return servers;
}

/**
 * Ensure per-group directories and settings exist.
 */
function ensureGroupDirs(
  group: RegisteredGroup,
  isMain: boolean,
): {
  groupDir: string;
  groupIpcDir: string;
  groupSessionsDir: string;
  agentRunnerDir: string;
} {
  const projectRoot = process.cwd();
  const groupDir = resolveGroupFolderPath(group.folder);
  const groupIpcDir = resolveGroupIpcPath(group.folder);

  fs.mkdirSync(path.join(groupIpcDir, 'messages'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'input'), { recursive: true });

  // Per-group Claude sessions directory
  const groupSessionsDir = path.join(
    DATA_DIR,
    'sessions',
    group.folder,
    '.claude',
  );
  fs.mkdirSync(groupSessionsDir, { recursive: true });
  const settingsFile = path.join(groupSessionsDir, 'settings.json');

  // Build settings with globally-configured MCP servers
  const globalMcpServers = buildGlobalMcpServers();

  if (!fs.existsSync(settingsFile)) {
    const settings: Record<string, unknown> = {
      env: {
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
        CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: '0',
      },
    };
    if (Object.keys(globalMcpServers).length > 0) {
      settings.mcpServers = globalMcpServers;
    }
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
  } else {
    // Sync global MCP servers into existing settings.
    // Global definitions are source-of-truth — always overwrite so config
    // updates (package renames, flag changes) propagate to all groups.
    // Manually-added servers (not in globalMcpServers) are preserved.
    try {
      const existing = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
      const existingServers = existing.mcpServers || {};
      let changed = false;
      for (const [name, config] of Object.entries(globalMcpServers)) {
        if (JSON.stringify(existingServers[name]) !== JSON.stringify(config)) {
          existingServers[name] = config;
          changed = true;
        }
      }
      if (changed) {
        existing.mcpServers = existingServers;
        fs.writeFileSync(
          settingsFile,
          JSON.stringify(existing, null, 2) + '\n',
        );
      }
    } catch {
      // If settings.json is corrupt, leave it alone
    }
  }

  // Sync skills from container/skills/ into each group's .claude/skills/
  const skillsSrc = path.join(projectRoot, 'container', 'skills');
  const skillsDst = path.join(groupSessionsDir, 'skills');
  if (fs.existsSync(skillsSrc)) {
    for (const skillDir of fs.readdirSync(skillsSrc)) {
      const srcDir = path.join(skillsSrc, skillDir);
      if (!fs.statSync(srcDir).isDirectory()) continue;
      const dstDir = path.join(skillsDst, skillDir);
      fs.cpSync(srcDir, dstDir, { recursive: true });
    }
  }

  // Copy agent-runner source into a per-group writable location
  const agentRunnerSrc = path.join(
    projectRoot,
    'container',
    'agent-runner',
    'src',
  );
  const agentRunnerDir = path.join(
    DATA_DIR,
    'sessions',
    group.folder,
    'agent-runner-src',
  );
  if (!fs.existsSync(agentRunnerDir) && fs.existsSync(agentRunnerSrc)) {
    fs.cpSync(agentRunnerSrc, agentRunnerDir, { recursive: true });
  }

  return { groupDir, groupIpcDir, groupSessionsDir, agentRunnerDir };
}

/**
 * Build the compiled agent-runner path.
 * Compiles TypeScript on-the-fly if dist doesn't exist.
 */
function getAgentRunnerEntrypoint(): string {
  const agentRunnerRoot = path.join(process.cwd(), 'container', 'agent-runner');
  const distEntry = path.join(agentRunnerRoot, 'dist', 'index.js');

  if (!fs.existsSync(distEntry)) {
    logger.info('Agent runner not compiled, compiling now...');
    execSync('npx tsc', { cwd: agentRunnerRoot, stdio: 'pipe' });
  }

  return distEntry;
}

export async function runContainerAgent(
  group: RegisteredGroup,
  input: ContainerInput,
  onProcess: (proc: ChildProcess, containerName: string) => void,
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<ContainerOutput> {
  const startTime = Date.now();

  const groupDir = resolveGroupFolderPath(group.folder);
  fs.mkdirSync(groupDir, { recursive: true });

  const { groupIpcDir, groupSessionsDir } = ensureGroupDirs(
    group,
    input.isMain,
  );
  const agentEntrypoint = getAgentRunnerEntrypoint();

  const safeName = group.folder.replace(/[^a-zA-Z0-9-]/g, '-');
  const processName = `ghostclaw-${safeName}-${Date.now()}`;

  // Global memory directory
  const globalDir = path.join(GROUPS_DIR, 'global');

  // Additional mount directories (for extra CLAUDE.md files)
  const extraDirs: string[] = [];
  if (group.containerConfig?.additionalMounts) {
    for (const mount of group.containerConfig.additionalMounts) {
      const expandedPath = mount.hostPath.startsWith('~/')
        ? path.join(process.env.HOME || '', mount.hostPath.slice(2))
        : path.resolve(mount.hostPath);
      if (fs.existsSync(expandedPath)) {
        extraDirs.push(expandedPath);
      }
    }
  }

  logger.info(
    {
      group: group.name,
      processName,
      isMain: input.isMain,
    },
    'Spawning agent process',
  );

  const logsDir = path.join(groupDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  return new Promise((resolve) => {
    // Build environment for the agent process
    const agentEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      // GhostClaw paths
      GHOSTCLAW_GROUP_DIR: groupDir,
      GHOSTCLAW_IPC_DIR: groupIpcDir,
      GHOSTCLAW_GLOBAL_DIR: fs.existsSync(globalDir) ? globalDir : '',
      GHOSTCLAW_EXTRA_DIR: extraDirs.length > 0 ? extraDirs[0] : '',
      // Claude Agent SDK respects CLAUDE_CONFIG_DIR for session isolation.
      // We do NOT override HOME — tools like gh, Gmail MCP, and any future
      // MCP servers need the real HOME to find their credentials.
      CLAUDE_CONFIG_DIR: groupSessionsDir,
      TZ: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    const agentProcess = spawn(process.execPath, [agentEntrypoint], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: agentEnv,
      cwd: groupDir,
    });

    onProcess(agentProcess, processName);

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    // Pass secrets via stdin (never written to disk)
    input.secrets = readSecrets();
    agentProcess.stdin.write(JSON.stringify(input));
    agentProcess.stdin.end();
    // Remove secrets from input so they don't appear in logs
    delete input.secrets;

    // Streaming output: parse OUTPUT_START/END marker pairs as they arrive
    let parseBuffer = '';
    let newSessionId: string | undefined;
    let outputChain = Promise.resolve();

    agentProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      resetIdleTimer();

      if (!stdoutTruncated) {
        const remaining = CONTAINER_MAX_OUTPUT_SIZE - stdout.length;
        if (chunk.length > remaining) {
          stdout += chunk.slice(0, remaining);
          stdoutTruncated = true;
          logger.warn(
            { group: group.name, size: stdout.length },
            'Agent stdout truncated due to size limit',
          );
        } else {
          stdout += chunk;
        }
      }

      if (onOutput) {
        parseBuffer += chunk;
        let startIdx: number;
        while ((startIdx = parseBuffer.indexOf(OUTPUT_START_MARKER)) !== -1) {
          const endIdx = parseBuffer.indexOf(OUTPUT_END_MARKER, startIdx);
          if (endIdx === -1) break;

          const jsonStr = parseBuffer
            .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
            .trim();
          parseBuffer = parseBuffer.slice(endIdx + OUTPUT_END_MARKER.length);

          try {
            const parsed: ContainerOutput = JSON.parse(jsonStr);
            if (parsed.newSessionId) {
              newSessionId = parsed.newSessionId;
            }
            hadStreamingOutput = true;
            outputChain = outputChain.then(() => onOutput(parsed));
          } catch (err) {
            logger.warn(
              { group: group.name, error: err },
              'Failed to parse streamed output chunk',
            );
          }
        }
      }
    });

    agentProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      const lines = chunk.trim().split('\n');
      for (const line of lines) {
        if (line) logger.debug({ agent: group.folder }, line);
      }
      if (stderrTruncated) return;
      const remaining = CONTAINER_MAX_OUTPUT_SIZE - stderr.length;
      if (chunk.length > remaining) {
        stderr += chunk.slice(0, remaining);
        stderrTruncated = true;
        logger.warn(
          { group: group.name, size: stderr.length },
          'Agent stderr truncated due to size limit',
        );
      } else {
        stderr += chunk;
      }
    });

    let timedOut = false;
    let timeoutReason: 'idle' | 'absolute' | null = null;
    let hadStreamingOutput = false;
    const absoluteTimeoutMs = AGENT_ABSOLUTE_TIMEOUT;
    const idleTimeoutMs = Math.min(AGENT_IDLE_TIMEOUT, absoluteTimeoutMs);

    let timeoutHandled = false;
    const killOnTimeout = (reason: 'idle' | 'absolute') => {
      if (timeoutHandled) return;
      timeoutHandled = true;
      timedOut = true;
      timeoutReason = reason;
      logger.error(
        { group: group.name, processName, reason },
        reason === 'idle'
          ? 'Agent idle timeout — no stdout for too long, killing process'
          : 'Agent absolute timeout — hard ceiling reached, killing process',
      );
      agentProcess.kill('SIGTERM');
      agentProcess.once('close', () => {
        // Process already dead, nothing more to do
      });
      setTimeout(() => {
        try {
          agentProcess.kill('SIGKILL');
        } catch {
          // already dead
        }
      }, 15000);
    };

    // Idle timer — reset on any stdout activity
    let idleTimer = setTimeout(() => killOnTimeout('idle'), idleTimeoutMs);
    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => killOnTimeout('idle'), idleTimeoutMs);
    };

    // Absolute ceiling — never resets
    const absoluteTimer = setTimeout(
      () => killOnTimeout('absolute'),
      absoluteTimeoutMs,
    );

    agentProcess.on('close', (code) => {
      clearTimeout(idleTimer);
      clearTimeout(absoluteTimer);
      const duration = Date.now() - startTime;

      if (timedOut) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const timeoutLog = path.join(logsDir, `agent-${ts}.log`);
        fs.writeFileSync(
          timeoutLog,
          [
            `=== Agent Run Log (TIMEOUT) ===`,
            `Timestamp: ${new Date().toISOString()}`,
            `Group: ${group.name}`,
            `Process: ${processName}`,
            `Duration: ${duration}ms`,
            `Exit Code: ${code}`,
            `Had Streaming Output: ${hadStreamingOutput}`,
          ].join('\n'),
        );

        const timeoutMs =
          timeoutReason === 'idle' ? idleTimeoutMs : absoluteTimeoutMs;
        const timeoutLabel =
          timeoutReason === 'idle'
            ? `idle timeout (${idleTimeoutMs}ms no stdout)`
            : `absolute timeout (${absoluteTimeoutMs}ms ceiling)`;

        logger.error(
          {
            group: group.name,
            processName,
            duration,
            code,
            timeoutReason,
            hadStreamingOutput,
          },
          `Agent timed out (${timeoutLabel})`,
        );

        outputChain.then(() => {
          resolve({
            status: 'error',
            result: null,
            error: `Agent timed out after ${timeoutMs}ms (${timeoutLabel})`,
            newSessionId,
          });
        });
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = path.join(logsDir, `agent-${timestamp}.log`);
      const isVerbose =
        process.env.LOG_LEVEL === 'debug' || process.env.LOG_LEVEL === 'trace';

      const logLines = [
        `=== Agent Run Log ===`,
        `Timestamp: ${new Date().toISOString()}`,
        `Group: ${group.name}`,
        `IsMain: ${input.isMain}`,
        `Duration: ${duration}ms`,
        `Exit Code: ${code}`,
        `Stdout Truncated: ${stdoutTruncated}`,
        `Stderr Truncated: ${stderrTruncated}`,
        ``,
      ];

      const isError = code !== 0;

      if (isVerbose || isError) {
        logLines.push(
          `=== Input ===`,
          JSON.stringify(input, null, 2),
          ``,
          `=== Stderr${stderrTruncated ? ' (TRUNCATED)' : ''} ===`,
          stderr,
          ``,
          `=== Stdout${stdoutTruncated ? ' (TRUNCATED)' : ''} ===`,
          stdout,
        );
      } else {
        logLines.push(
          `=== Input Summary ===`,
          `Prompt length: ${input.prompt.length} chars`,
          `Session ID: ${input.sessionId || 'new'}`,
          ``,
        );
      }

      fs.writeFileSync(logFile, logLines.join('\n'));
      logger.debug({ logFile, verbose: isVerbose }, 'Agent log written');

      if (code !== 0) {
        logger.error(
          {
            group: group.name,
            code,
            duration,
            stderr,
            stdout,
            logFile,
          },
          'Agent exited with error',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Agent exited with code ${code}: ${stderr.slice(-200)}`,
        });
        return;
      }

      // Streaming mode: wait for output chain to settle
      if (onOutput) {
        outputChain.then(() => {
          logger.info(
            { group: group.name, duration, newSessionId },
            'Agent completed (streaming mode)',
          );
          resolve({
            status: 'success',
            result: null,
            newSessionId,
          });
        });
        return;
      }

      // Legacy mode: parse the last output marker pair
      try {
        const startIdx = stdout.indexOf(OUTPUT_START_MARKER);
        const endIdx = stdout.indexOf(OUTPUT_END_MARKER);

        let jsonLine: string;
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          jsonLine = stdout
            .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
            .trim();
        } else {
          const lines = stdout.trim().split('\n');
          jsonLine = lines[lines.length - 1];
        }

        const output: ContainerOutput = JSON.parse(jsonLine);

        logger.info(
          {
            group: group.name,
            duration,
            status: output.status,
            hasResult: !!output.result,
          },
          'Agent completed',
        );

        resolve(output);
      } catch (err) {
        logger.error(
          {
            group: group.name,
            stdout,
            stderr,
            error: err,
          },
          'Failed to parse agent output',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Failed to parse agent output: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });

    agentProcess.on('error', (err) => {
      clearTimeout(idleTimer);
      clearTimeout(absoluteTimer);
      logger.error(
        { group: group.name, processName, error: err },
        'Agent spawn error',
      );
      resolve({
        status: 'error',
        result: null,
        error: `Agent spawn error: ${err.message}`,
      });
    });
  });
}

export function writeTasksSnapshot(
  groupFolder: string,
  isMain: boolean,
  tasks: Array<{
    id: string;
    groupFolder: string;
    prompt: string;
    schedule_type: string;
    schedule_value: string;
    status: string;
    next_run: string | null;
  }>,
): void {
  const groupIpcDir = resolveGroupIpcPath(groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  const filteredTasks = (
    isMain ? tasks : tasks.filter((t) => t.groupFolder === groupFolder)
  ).filter((t) => t.status !== 'completed');

  const tasksFile = path.join(groupIpcDir, 'current_tasks.json');
  fs.writeFileSync(tasksFile, JSON.stringify(filteredTasks, null, 2));
}

export interface AvailableGroup {
  jid: string;
  name: string;
  lastActivity: string;
  isRegistered: boolean;
}

export function writeGroupsSnapshot(
  groupFolder: string,
  isMain: boolean,
  groups: AvailableGroup[],
  registeredJids: Set<string>,
): void {
  const groupIpcDir = resolveGroupIpcPath(groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  const visibleGroups = isMain ? groups : [];

  const groupsFile = path.join(groupIpcDir, 'available_groups.json');
  fs.writeFileSync(
    groupsFile,
    JSON.stringify(
      {
        groups: visibleGroups,
        lastSync: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}
