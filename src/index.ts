import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version: APP_VERSION } = require('../package.json');

import {
  ASSISTANT_NAME,
  DATA_DIR,
  GROUPS_DIR,
  IDLE_TIMEOUT,
  MAIN_GROUP_FOLDER,
  MAX_MESSAGES_PER_PROMPT,
  POLL_INTERVAL,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_ONLY,
  TRIGGER_PATTERN,
} from './config.js';
import { waitForMessage } from './message-signal.js';
import { TelegramChannel } from './channels/telegram.js';
import { WhatsAppChannel } from './channels/whatsapp.js';
import { initErrorAlerts, sendErrorAlert } from './error-alerts.js';
// Fast path mothballed — requires ANTHROPIC_API_KEY, OAuth tokens not supported by raw SDK.
// To enable: uncomment the import below, then gate calls with isFastPathAvailable().
// import { tryFastPath, shouldBypassFastPath, isFastPathAvailable } from './fast-path.js';
import {
  ContainerOutput,
  runContainerAgent,
  writeGroupsSnapshot,
  writeTasksSnapshot,
} from './container-runner.js';
import {
  getAllChats,
  getAllRegisteredGroups,
  getAllSessions,
  getAllTasks,
  getLastBotMessageTimestamp,
  getMessagesSince,
  getNewMessages,
  getRouterState,
  initDatabase,
  setRegisteredGroup,
  deleteSession,
  setRouterState,
  setSession,
  storeChatMetadata,
  storeMessage,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { resolveGroupFolderPath } from './group-folder.js';
import { startIpcWatcher } from './ipc.js';
import {
  findChannel,
  formatMessages,
  formatOutbound,
  escapeXml,
} from './router.js';
import { startSchedulerLoop } from './task-scheduler.js';
import { Channel, NewMessage, RegisteredGroup } from './types.js';
import { logger } from './logger.js';
import { startDashboard, setDashboardChannels } from './dashboard.js';
import { dashboardEvents } from './dashboard-events.js';

// Re-export for backwards compatibility during refactor
export { escapeXml, formatMessages } from './router.js';

let lastTimestamp = '';
let sessions: Record<string, string> = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
const consecutiveFailures: Record<string, number> = {};
const MAX_CURSOR_ROLLBACKS = 3;
let messageLoopRunning = false;
const startTime = Date.now();
const currentTasks: Record<string, string> = {};

let whatsapp: WhatsAppChannel;
const channels: Channel[] = [];
const queue = new GroupQueue();

function loadState(): void {
  lastTimestamp = getRouterState('last_timestamp') || '';
  const agentTs = getRouterState('last_agent_timestamp');
  try {
    lastAgentTimestamp = agentTs ? JSON.parse(agentTs) : {};
  } catch {
    logger.warn('Corrupted last_agent_timestamp in DB, resetting');
    lastAgentTimestamp = {};
  }
  sessions = getAllSessions();
  registeredGroups = getAllRegisteredGroups();
  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'State loaded',
  );
}

function saveState(): void {
  setRouterState('last_timestamp', lastTimestamp);
  setRouterState('last_agent_timestamp', JSON.stringify(lastAgentTimestamp));
}

function registerGroup(jid: string, group: RegisteredGroup): void {
  let groupDir: string;
  try {
    groupDir = resolveGroupFolderPath(group.folder);
  } catch (err) {
    logger.warn(
      { jid, folder: group.folder, err },
      'Rejecting group registration with invalid folder',
    );
    return;
  }

  registeredGroups[jid] = group;
  setRegisteredGroup(jid, group);

  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

export function getAvailableGroups(): import('./container-runner.js').AvailableGroup[] {
  const chats = getAllChats();
  const registeredJids = new Set(Object.keys(registeredGroups));

  return chats
    .filter((c) => c.jid !== '__group_sync__' && c.is_group)
    .map((c) => ({
      jid: c.jid,
      name: c.name,
      lastActivity: c.last_message_time,
      isRegistered: registeredJids.has(c.jid),
    }));
}

/** @internal - exported for testing */
export function _setRegisteredGroups(
  groups: Record<string, RegisteredGroup>,
): void {
  registeredGroups = groups;
}

async function processGroupMessages(chatJid: string): Promise<boolean> {
  const group = registeredGroups[chatJid];
  if (!group) return true;

  const channel = findChannel(channels, chatJid);
  if (!channel) {
    console.log(`Warning: no channel owns JID ${chatJid}, skipping messages`);
    return true;
  }

  const isMainGroup = group.folder === MAIN_GROUP_FOLDER;

  const sinceTimestamp =
    lastAgentTimestamp[chatJid] || getLastBotMessageTimestamp(chatJid) || '';
  const missedMessages = getMessagesSince(
    chatJid,
    sinceTimestamp,
    ASSISTANT_NAME,
    MAX_MESSAGES_PER_PROMPT,
  );

  if (missedMessages.length === 0) return true;

  if (!isMainGroup && group.requiresTrigger !== false) {
    const hasTrigger = missedMessages.some((m) =>
      TRIGGER_PATTERN.test(m.content.trim()),
    );
    if (!hasTrigger) return true;
  }

  const prompt = formatMessages(missedMessages);

  const hasVoiceMessage = missedMessages.some((m) =>
    m.content.startsWith('[Voice:'),
  );

  const previousCursor = lastAgentTimestamp[chatJid] || '';
  lastAgentTimestamp[chatJid] =
    missedMessages[missedMessages.length - 1].timestamp;
  saveState();

  logger.info(
    { group: group.name, messageCount: missedMessages.length },
    'Processing messages',
  );

  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      logger.debug(
        { group: group.name },
        'Idle timeout, closing container stdin',
      );
      queue.closeStdin(chatJid);
    }, IDLE_TIMEOUT);
  };

  const TYPING_STALL_MS = 15_000;
  let typingActive = true;
  let lastOutputAt = Date.now();

  const typingInterval = setInterval(() => {
    if (typingActive && Date.now() - lastOutputAt < TYPING_STALL_MS) {
      channel.setTyping?.(chatJid, true)?.catch(() => {});
    } else if (typingActive) {
      typingActive = false;
      channel.setTyping?.(chatJid, false)?.catch(() => {});
    }
  }, 4000);
  await channel.setTyping?.(chatJid, true);

  let hadError = false;
  let outputSentToUser = false;

  currentTasks[chatJid] = missedMessages[
    missedMessages.length - 1
  ].content.slice(0, 120);
  const output = await runAgent(group, prompt, chatJid, async (result) => {
    lastOutputAt = Date.now();
    if (!typingActive) {
      typingActive = true;
      channel.setTyping?.(chatJid, true)?.catch(() => {});
    }

    if (result.result) {
      const raw =
        typeof result.result === 'string'
          ? result.result
          : JSON.stringify(result.result);
      const text = raw.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
      logger.info({ group: group.name }, `Agent output: ${raw.slice(0, 200)}`);
      if (text) {
        clearInterval(typingInterval);
        await channel.sendMessage(chatJid, text, false);
        outputSentToUser = true;
      }
      resetIdleTimer();
    }

    if (result.status === 'success') {
      queue.notifyIdle(chatJid);
    }

    if (result.status === 'error') {
      hadError = true;
    }
  });

  clearInterval(typingInterval);
  await channel.setTyping?.(chatJid, false);
  if (idleTimer) clearTimeout(idleTimer);
  delete currentTasks[chatJid];

  if (output === 'error' || hadError) {
    if (outputSentToUser) {
      logger.warn(
        { group: group.name },
        'Agent error after output was sent, skipping cursor rollback to prevent duplicates',
      );
      consecutiveFailures[chatJid] = 0;
      return true;
    }
    consecutiveFailures[chatJid] = (consecutiveFailures[chatJid] || 0) + 1;
    if (consecutiveFailures[chatJid] >= MAX_CURSOR_ROLLBACKS) {
      logger.error(
        { group: group.name, failures: consecutiveFailures[chatJid] },
        'Too many consecutive failures — advancing cursor to prevent retry spiral. Some messages may be lost.',
      );
      consecutiveFailures[chatJid] = 0;
      // Cursor already advanced (line above previousCursor), don't roll back
      await channel.sendMessage(
        chatJid,
        '⚠️ I had trouble processing some messages and had to skip them. Please resend anything important.',
      );
      return true;
    }
    lastAgentTimestamp[chatJid] = previousCursor;
    saveState();
    logger.warn(
      { group: group.name, failure: consecutiveFailures[chatJid] },
      'Agent error, rolled back message cursor for retry',
    );
    return false;
  }

  consecutiveFailures[chatJid] = 0;

  // Post-agent memory write: append a summary to log.md after every successful run
  try {
    const logFile = path.join(GROUPS_DIR, group.folder, 'memory', 'log.md');
    if (fs.existsSync(logFile)) {
      const today = new Date().toISOString().slice(0, 10);
      const logContent = fs.readFileSync(logFile, 'utf-8');
      const taskSummary = currentTasks[chatJid] || prompt.slice(0, 120);
      // Only append if the agent actually sent output (not a no-op)
      if (outputSentToUser) {
        const entry = `- [auto] Handled: ${taskSummary.replace(/\n/g, ' ')}`;
        if (logContent.includes(`## ${today}`)) {
          // Append under today's header
          const updated = logContent.replace(
            `## ${today}`,
            `## ${today}\n${entry}`,
          );
          fs.writeFileSync(logFile, updated);
        } else {
          // Add new day header after the separator
          const updated = logContent.replace(
            '---\n',
            `---\n\n## ${today}\n${entry}\n`,
          );
          fs.writeFileSync(logFile, updated);
        }
      }
    }
  } catch {
    // Non-critical — don't fail the session over a log write
  }

  return true;
}

async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<'success' | 'error'> {
  const isMain = group.folder === MAIN_GROUP_FOLDER;
  const sessionId = sessions[group.folder];

  const tasks = getAllTasks();
  writeTasksSnapshot(
    group.folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  const availableGroups = getAvailableGroups();
  writeGroupsSnapshot(
    group.folder,
    isMain,
    availableGroups,
    new Set(Object.keys(registeredGroups)),
  );

  const wrappedOnOutput = onOutput
    ? async (output: ContainerOutput) => {
        if (output.newSessionId) {
          sessions[group.folder] = output.newSessionId;
          setSession(group.folder, output.newSessionId);
        }
        await onOutput(output);
      }
    : undefined;

  // Inject recent files context so agents don't duplicate work
  let enrichedPrompt = prompt;
  try {
    const groupDir = path.join(GROUPS_DIR, group.folder);
    const cutoff = Date.now() - 20 * 60 * 1000; // 20 minutes
    const entries = fs.readdirSync(groupDir, { withFileTypes: true });
    const recentFiles = entries
      .filter((e) => e.isFile() && !e.name.startsWith('.'))
      .map((e) => ({
        name: e.name,
        mtime: fs.statSync(path.join(groupDir, e.name)).mtimeMs,
      }))
      .filter((f) => f.mtime > cutoff)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 10);
    if (recentFiles.length > 0) {
      const listing = recentFiles
        .map(
          (f) =>
            `  ${f.name} (${Math.round((Date.now() - f.mtime) / 60000)}m ago)`,
        )
        .join('\n');
      enrichedPrompt += `\n\n<recent_files>\nFiles recently created/modified in your workspace:\n${listing}\nCheck these before creating new files on the same topic.\n</recent_files>`;
    }
  } catch {
    /* ignore — non-critical */
  }

  try {
    const output = await runContainerAgent(
      group,
      {
        prompt: enrichedPrompt,
        sessionId,
        groupFolder: group.folder,
        chatJid,
        isMain,
        assistantName: ASSISTANT_NAME,
      },
      (proc, containerName) => {
        queue.registerProcess(chatJid, proc, containerName, group.folder);
        if (proc.pid) {
          trackAgentPid(proc.pid);
          proc.once('exit', () => untrackAgentPid(proc.pid!));
        }
      },
      wrappedOnOutput,
    );

    if (output.newSessionId) {
      sessions[group.folder] = output.newSessionId;
      setSession(group.folder, output.newSessionId);
    }

    if (output.status === 'error') {
      // If the agent timed out without producing any output and returned no new
      // session ID, the existing session is likely broken (e.g. unmatched tool_use
      // from a sub-agent that outlived the idle timeout). Clear it so the next
      // retry starts fresh instead of hanging on the same broken state.
      const isIdleTimeout = output.error?.includes('idle timeout');
      if (isIdleTimeout && !output.newSessionId && sessions[group.folder]) {
        logger.warn(
          { group: group.name, clearedSession: sessions[group.folder] },
          'Idle timeout with no output — clearing session to prevent resume hang',
        );
        delete sessions[group.folder];
        deleteSession(group.folder);
      }
      logger.error(
        { group: group.name, error: output.error },
        'Container agent error',
      );
      return 'error';
    }

    return 'success';
  } catch (err) {
    logger.error({ group: group.name, err }, 'Agent error');
    return 'error';
  }
}

async function startMessageLoop(): Promise<void> {
  if (messageLoopRunning) {
    logger.debug('Message loop already running, skipping duplicate start');
    return;
  }
  messageLoopRunning = true;

  logger.info(`GhostClaw running (trigger: @${ASSISTANT_NAME})`);

  // Send startup notification to main group
  const mainJid = Object.entries(registeredGroups).find(
    ([, g]) => g.folder === MAIN_GROUP_FOLDER,
  )?.[0];
  if (mainJid) {
    const mainChannel = findChannel(channels, mainJid);
    mainChannel
      ?.sendMessage(mainJid, `Back online. v${APP_VERSION}`)
      .catch(() => {});
  }

  while (true) {
    try {
      const jids = Object.keys(registeredGroups);
      const { messages, newTimestamp } = getNewMessages(
        jids,
        lastTimestamp,
        ASSISTANT_NAME,
      );

      if (messages.length > 0) {
        logger.info({ count: messages.length }, 'New messages');

        lastTimestamp = newTimestamp;
        saveState();

        const messagesByGroup = new Map<string, NewMessage[]>();
        for (const msg of messages) {
          const existing = messagesByGroup.get(msg.chat_jid);
          if (existing) {
            existing.push(msg);
          } else {
            messagesByGroup.set(msg.chat_jid, [msg]);
          }
        }

        for (const [chatJid, groupMessages] of messagesByGroup) {
          const group = registeredGroups[chatJid];
          if (!group) continue;

          const channel = findChannel(channels, chatJid);
          if (!channel) {
            console.log(
              `Warning: no channel owns JID ${chatJid}, skipping messages`,
            );
            continue;
          }

          const isMainGroup = group.folder === MAIN_GROUP_FOLDER;
          const needsTrigger = !isMainGroup && group.requiresTrigger !== false;

          if (needsTrigger) {
            const hasTrigger = groupMessages.some((m) =>
              TRIGGER_PATTERN.test(m.content.trim()),
            );
            if (!hasTrigger) continue;
          }

          const allPending = getMessagesSince(
            chatJid,
            lastAgentTimestamp[chatJid] ||
              getLastBotMessageTimestamp(chatJid) ||
              '',
            ASSISTANT_NAME,
            MAX_MESSAGES_PER_PROMPT,
          );
          const messagesToSend =
            allPending.length > 0 ? allPending : groupMessages;
          const formatted = formatMessages(messagesToSend);

          if (queue.sendMessage(chatJid, formatted)) {
            logger.debug(
              { chatJid, count: messagesToSend.length },
              'Piped messages to active container',
            );
            lastAgentTimestamp[chatJid] =
              messagesToSend[messagesToSend.length - 1].timestamp;
            saveState();
            channel
              .setTyping?.(chatJid, true)
              ?.catch((err) =>
                logger.warn({ chatJid, err }, 'Failed to set typing indicator'),
              );
          } else {
            queue.enqueueMessageCheck(chatJid);
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in message loop');
    }
    await waitForMessage(POLL_INTERVAL);
  }
}

function recoverPendingMessages(): void {
  for (const [chatJid, group] of Object.entries(registeredGroups)) {
    const sinceTimestamp =
      lastAgentTimestamp[chatJid] || getLastBotMessageTimestamp(chatJid) || '';
    const pending = getMessagesSince(
      chatJid,
      sinceTimestamp,
      ASSISTANT_NAME,
      MAX_MESSAGES_PER_PROMPT,
    );
    if (pending.length > 0) {
      logger.info(
        { group: group.name, pendingCount: pending.length },
        'Recovery: found unprocessed messages',
      );
      queue.enqueueMessageCheck(chatJid);
    }
  }
}

// Hold the lock fd for process lifetime — OS releases it on exit/crash
let lockFd: number | null = null;

function acquirePidLock(): void {
  const pidFile = path.join(DATA_DIR, 'ghostclaw.pid');
  const lockFile = path.join(DATA_DIR, 'ghostclaw.lock');
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Try to get an exclusive lock via O_EXCL on a separate lock file.
  // If another process holds the lock file open, we detect it via the PID check below.
  // The lock file is held open for the process lifetime and released by the OS on exit.
  try {
    lockFd = fs.openSync(
      lockFile,
      fs.constants.O_WRONLY | fs.constants.O_CREAT,
      0o644,
    );
    fs.writeSync(lockFd, String(process.pid));
    fs.fsyncSync(lockFd);
    // Intentionally not closing — held for process lifetime
  } catch {
    logger.error('Failed to acquire lock file');
    process.exit(1);
  }

  // Kill any existing process from the PID file
  try {
    const oldPid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
    if (oldPid && oldPid !== process.pid) {
      try {
        process.kill(oldPid, 0);
        logger.warn({ oldPid }, 'Killing existing GhostClaw process');
        process.kill(oldPid, 'SIGTERM');
        const start = Date.now();
        while (Date.now() - start < 3000) {
          try {
            process.kill(oldPid, 0);
          } catch {
            break;
          }
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
        }
        try {
          process.kill(oldPid, 'SIGKILL');
        } catch {
          /* already dead */
        }
      } catch {
        /* process doesn't exist, fine */
      }
    }
  } catch {
    /* no pid file, fine */
  }

  fs.writeFileSync(pidFile, String(process.pid));

  // Double-check after a short delay to catch races
  setTimeout(() => {
    try {
      const currentPid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
      if (currentPid !== process.pid) {
        logger.error(
          { currentPid, ourPid: process.pid },
          'Another instance overwrote PID lock — exiting to prevent duplicates',
        );
        process.exit(1);
      }
    } catch {
      /* pid file gone, we're being replaced */
      process.exit(1);
    }
  }, 500);
}

function releasePidLock(): void {
  const pidFile = path.join(DATA_DIR, 'ghostclaw.pid');
  try {
    fs.unlinkSync(pidFile);
  } catch {
    /* ignore */
  }
}

const agentPidsFile = path.join(DATA_DIR, 'agent-pids.json');

function readAgentPids(): number[] {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(agentPidsFile, 'utf-8'));
    if (!Array.isArray(raw)) return [];
    // Accept only positive integers — 0/negative have process-group semantics on POSIX
    return raw.filter(
      (v): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0,
    );
  } catch {
    return [];
  }
}

function writeAgentPids(pids: number[]): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(agentPidsFile, JSON.stringify(pids));
  } catch {
    /* ignore */
  }
}

function trackAgentPid(pid: number): void {
  const pids = readAgentPids();
  if (!pids.includes(pid)) {
    pids.push(pid);
    writeAgentPids(pids);
  }
}

function untrackAgentPid(pid: number): void {
  const pids = readAgentPids().filter((p) => p !== pid);
  writeAgentPids(pids);
}

function cleanupOrphanedAgents(): void {
  const pids = readAgentPids();
  if (pids.length === 0) return;

  let killed = 0;
  for (const pid of pids) {
    try {
      process.kill(pid, 0); // throws if dead
      process.kill(pid, 'SIGKILL');
      killed++;
      logger.warn({ pid }, 'Killed orphaned agent process from previous run');
    } catch {
      /* already dead */
    }
  }
  writeAgentPids([]);
  if (killed > 0) {
    logger.info({ killed }, 'Orphan agent cleanup complete');
  }
}

function pruneSessionData(): void {
  const sessionsDir = path.join(DATA_DIR, 'sessions');
  if (!fs.existsSync(sessionsDir)) return;

  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  let pruned = 0;

  const walkAndPrune = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkAndPrune(fullPath);
        // Remove empty dirs
        try {
          const remaining = fs.readdirSync(fullPath);
          if (remaining.length === 0) fs.rmdirSync(fullPath);
        } catch {
          /* ignore */
        }
      } else if (entry.name !== 'settings.json') {
        try {
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs < oneHourAgo) {
            fs.unlinkSync(fullPath);
            pruned++;
          }
        } catch {
          /* ignore */
        }
      }
    }
  };

  walkAndPrune(sessionsDir);
  if (pruned > 0) {
    logger.info({ pruned }, 'Pruned old session files (>1hr)');
  }
}

async function main(): Promise<void> {
  acquirePidLock();
  cleanupOrphanedAgents();
  pruneSessionData();

  // Prune sessions every hour while running
  setInterval(pruneSessionData, 60 * 60 * 1000);

  const errorsLog = path.join(process.cwd(), 'logs', 'errors.log');
  try {
    fs.writeFileSync(errorsLog, '');
  } catch {
    /* ignore */
  }

  initDatabase();
  logger.info('Database initialized');
  loadState();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    releasePidLock();
    await queue.shutdown(10000);
    for (const ch of channels) await ch.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  const channelOpts = {
    onMessage: (_chatJid: string, msg: NewMessage) => {
      storeMessage(msg);
      dashboardEvents.emit('dashboard', {
        type: 'message',
        data: {
          jid: msg.chat_jid,
          sender: msg.sender,
          sender_name: msg.sender_name,
          content: msg.content,
        },
        timestamp: msg.timestamp,
      });
    },
    onChatMetadata: (
      chatJid: string,
      timestamp: string,
      name?: string,
      channel?: string,
      isGroup?: boolean,
    ) => storeChatMetadata(chatJid, timestamp, name, channel, isGroup),
    registeredGroups: () => registeredGroups,
    onSessionReset: (chatJid: string) => {
      queue.clearQueue(chatJid);
      const group = registeredGroups[chatJid];
      if (group) {
        delete sessions[group.folder];
        deleteSession(group.folder);
        const sessionDir = path.join(
          DATA_DIR,
          'sessions',
          group.folder,
          '.claude',
        );
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
      return queue.killAgent(chatJid);
    },
    onReset: async (chatJid: string) => {
      const report: string[] = [];

      // 1. Kill all active agents
      const status = queue.getStatus();
      for (const jid of Object.keys(registeredGroups)) {
        queue.clearQueue(jid);
        queue.killAgent(jid);
      }
      report.push(
        `Killed ${status.active} agent(s), cleared ${status.waiting} queued`,
      );

      // 2. Clear all scheduled/Ralph tasks
      const { getAllTasks: getTasks } = await import('./db.js');
      const tasks = getTasks();
      let taskCount = 0;
      for (const task of tasks) {
        const { deleteTask } = await import('./db.js');
        deleteTask(task.id);
        taskCount++;
      }
      report.push(`Cleared ${taskCount} scheduled task(s)`);

      // 3. Wipe all session data
      const sessionsDir = path.join(DATA_DIR, 'sessions');
      if (fs.existsSync(sessionsDir)) {
        fs.rmSync(sessionsDir, { recursive: true, force: true });
        fs.mkdirSync(sessionsDir, { recursive: true });
      }
      for (const group of Object.values(registeredGroups)) {
        delete sessions[group.folder];
        deleteSession(group.folder);
      }
      report.push('Wiped all session data');

      // 4. Kill orphaned processes
      try {
        const { execSync } = await import('child_process');
        const procs = execSync("pgrep -f 'agent-runner|claude' || true", {
          encoding: 'utf-8',
        }).trim();
        const pids = procs
          .split('\n')
          .map((p) => parseInt(p, 10))
          .filter((p) => p && p !== process.pid);
        let killed = 0;
        for (const pid of pids) {
          try {
            process.kill(pid, 'SIGKILL');
            killed++;
          } catch {
            /* already dead */
          }
        }
        if (killed > 0) report.push(`Killed ${killed} orphaned process(es)`);
      } catch {
        /* pgrep not available */
      }

      // 5. Check memory
      try {
        const { execSync } = await import('child_process');
        const memInfo = execSync(
          "ps -o rss= -p $$ | awk '{print int($1/1024)}' || echo 'unknown'",
          { encoding: 'utf-8' },
        ).trim();
        const totalMem = Math.round(
          parseInt(
            execSync('sysctl -n hw.memsize', { encoding: 'utf-8' }).trim(),
            10,
          ) /
            1024 /
            1024 /
            1024,
        );
        report.push(`System memory: ${totalMem}GB total`);
      } catch {
        /* ignore */
      }

      // 6. Advance cursor to latest for all groups
      for (const [jid] of Object.entries(registeredGroups)) {
        const now = new Date().toISOString();
        lastAgentTimestamp[jid] = now;
      }
      saveState();
      report.push('Advanced message cursor to now');

      return `Hard reset complete:\n${report.map((r) => `• ${r}`).join('\n')}`;
    },
    onGetStatus: () => {
      const { execSync } = require('child_process');
      const status = queue.getStatus();
      const uptimeMs = Date.now() - startTime;
      const uptimeMin = Math.floor(uptimeMs / 60000);
      const uptimeHr = Math.floor(uptimeMin / 60);
      const uptime =
        uptimeHr > 0 ? `${uptimeHr}h ${uptimeMin % 60}m` : `${uptimeMin}m`;

      const lines = [
        `<b>GhostClaw v${require('../package.json').version}</b>`,
        `Uptime: ${uptime}`,
        '',
        `<b>Agents</b>`,
        `Active: ${status.active} | Queued: ${status.waiting}`,
      ];

      if (status.groups.length > 0) {
        for (const g of status.groups) {
          const group = registeredGroups[g.jid];
          const name = escapeXml(group?.name || g.jid);
          const parts: string[] = [];
          if (g.active) parts.push('running');
          if (g.queuedTasks > 0) parts.push(`${g.queuedTasks} queued`);
          if (g.queuedMessages) parts.push('msgs waiting');
          lines.push(`• ${name}: ${parts.join(', ')}`);
        }
      }

      // Scheduled tasks
      try {
        const tasks = getAllTasks();
        if (tasks.length > 0) {
          lines.push('', `<b>Tasks</b>: ${tasks.length} scheduled`);
          const ralphTasks = tasks.filter(
            (t) => t.id.includes('ralph') || t.prompt.includes('RALPH'),
          );
          if (ralphTasks.length > 0) {
            lines.push(`Ralph tasks: ${ralphTasks.length}`);
          }
        }
      } catch {
        /* ignore */
      }

      // Processes
      try {
        const procs = execSync(
          "ps aux | grep -E 'claude|agent-runner' | grep -v grep | wc -l",
          { encoding: 'utf-8' },
        ).trim();
        const count = parseInt(procs, 10) || 0;
        lines.push('', `<b>Processes</b>`);
        lines.push(`Claude/agent processes: ${count}`);
      } catch {
        /* ignore */
      }

      // Memory
      try {
        const vmStat = execSync('vm_stat', { encoding: 'utf-8' });
        const pageSize = 16384;
        const freeMatch = vmStat.match(/Pages free:\s+(\d+)/);
        const activeMatch = vmStat.match(/Pages active:\s+(\d+)/);
        const inactiveMatch = vmStat.match(/Pages inactive:\s+(\d+)/);
        const wiredMatch = vmStat.match(/Pages wired down:\s+(\d+)/);
        if (freeMatch && activeMatch && wiredMatch) {
          const usedGB =
            ((parseInt(activeMatch[1], 10) + parseInt(wiredMatch[1], 10)) *
              pageSize) /
            1024 /
            1024 /
            1024;
          const totalGB = 16;
          const pct = Math.round((usedGB / totalGB) * 100);
          lines.push('', `<b>Memory</b>`);
          lines.push(
            `${usedGB.toFixed(1)}GB / ${totalGB}GB (${pct}%)${pct > 85 ? ' ⚠️' : ''}`,
          );
        }
      } catch {
        /* ignore */
      }

      // Session size
      try {
        const sessSize = execSync(
          `du -sh ${path.join(DATA_DIR, 'sessions')} 2>/dev/null | cut -f1`,
          { encoding: 'utf-8' },
        ).trim();
        lines.push('', `<b>Sessions</b>`);
        lines.push(`Size: ${sessSize}`);
      } catch {
        /* ignore */
      }

      // Today's errors — categorised
      try {
        const logFile = path.join(process.cwd(), 'logs', 'ghostclaw.log');
        if (fs.existsSync(logFile)) {
          const today = new Date().toISOString().slice(0, 10);
          const errorLines = execSync(
            `grep "ERROR" "${logFile}" 2>/dev/null || true`,
            { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 },
          )
            .split('\n')
            .filter((l: string) => l.includes(today));

          const categories: Record<string, number> = {};
          for (const line of errorLines) {
            const clean = line.replace(/\x1b\[[0-9;]*m/g, '');
            if (/idle timeout/i.test(clean)) {
              categories['Idle timeouts'] =
                (categories['Idle timeouts'] || 0) + 1;
            } else if (/absolute timeout/i.test(clean)) {
              categories['Absolute timeouts'] =
                (categories['Absolute timeouts'] || 0) + 1;
            } else if (/rate.limit|429/i.test(clean)) {
              categories['Rate limits'] = (categories['Rate limits'] || 0) + 1;
            } else if (/exit.*code|exited/i.test(clean)) {
              categories['Agent crashes'] =
                (categories['Agent crashes'] || 0) + 1;
            } else if (/cursor|retry spiral/i.test(clean)) {
              categories['Retry spirals'] =
                (categories['Retry spirals'] || 0) + 1;
            } else {
              categories['Other'] = (categories['Other'] || 0) + 1;
            }
          }

          lines.push('', `<b>Errors today</b>`);
          const total = errorLines.length;
          if (total === 0) {
            lines.push('None ✓');
          } else {
            lines.push(`Total: ${total}`);
            for (const [cat, count] of Object.entries(categories)) {
              lines.push(`• ${cat}: ${count}`);
            }
          }
        }
      } catch {
        /* ignore */
      }

      return lines.join('\n');
    },
  };

  if (TELEGRAM_BOT_TOKEN) {
    const telegram = new TelegramChannel(TELEGRAM_BOT_TOKEN, channelOpts);
    channels.push(telegram);
    await telegram.connect();
  }

  if (!TELEGRAM_ONLY) {
    whatsapp = new WhatsAppChannel(channelOpts);
    channels.push(whatsapp);
    await whatsapp.connect();
  }

  const mainGroupJid = Object.keys(registeredGroups).find(
    (jid) => registeredGroups[jid].folder === MAIN_GROUP_FOLDER,
  );
  if (mainGroupJid) {
    const sendMessageToAdmin = async (jid: string, text: string) => {
      const channel = findChannel(channels, jid);
      if (!channel) return;
      await channel.sendMessage(jid, text);
    };
    initErrorAlerts(sendMessageToAdmin, mainGroupJid);
  }

  setDashboardChannels(channels);
  startDashboard();

  startSchedulerLoop({
    registeredGroups: () => registeredGroups,
    getSessions: () => sessions,
    queue,
    onProcess: (groupJid, proc, containerName, groupFolder) => {
      queue.registerProcess(groupJid, proc, containerName, groupFolder);
      if (proc.pid) {
        trackAgentPid(proc.pid);
        proc.once('exit', () => untrackAgentPid(proc.pid!));
      }
    },
    sendMessage: async (jid, rawText) => {
      const channel = findChannel(channels, jid);
      if (!channel) {
        console.log(`Warning: no channel owns JID ${jid}, cannot send message`);
        return;
      }
      const text = formatOutbound(rawText);
      if (text) await channel.sendMessage(jid, text);
    },
    sendDocument: async (jid, buffer, filename) => {
      const channel = findChannel(channels, jid);
      if (!channel?.sendDocument) return;
      await channel.sendDocument(jid, buffer, filename);
    },
  });
  startIpcWatcher({
    sendMessage: (jid, text) => {
      const channel = findChannel(channels, jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      return channel.sendMessage(jid, text);
    },
    sendDocument: async (jid, buffer, filename) => {
      const channel = findChannel(channels, jid);
      if (!channel?.sendDocument) return;
      await channel.sendDocument(jid, buffer, filename);
    },
    registeredGroups: () => registeredGroups,
    registerGroup,
    syncGroupMetadata: (force) =>
      whatsapp?.syncGroupMetadata(force) ?? Promise.resolve(),
    getAvailableGroups,
    writeGroupsSnapshot: (gf, im, ag, rj) =>
      writeGroupsSnapshot(gf, im, ag, rj),
  });
  queue.setProcessMessagesFn(processGroupMessages);
  queue.setOnMessageQueuedFn((groupJid) => {
    const channel = findChannel(channels, groupJid);
    if (!channel) return;
    const current = currentTasks[groupJid];
    const msg = current
      ? `Got it, queued — currently: "${current.length > 100 ? current.slice(0, 100) + '…' : current}"`
      : 'Got it, finishing a task first...';
    channel.sendMessage(groupJid, msg).catch(() => {});
  });
  recoverPendingMessages();
  startMessageLoop().catch((err) => {
    logger.fatal({ err }, 'Message loop crashed unexpectedly');
    process.exit(1);
  });
}

const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname ===
    new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  main().catch((err) => {
    logger.error({ err }, 'Failed to start GhostClaw');
    process.exit(1);
  });
}
