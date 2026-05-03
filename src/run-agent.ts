/**
 * Orchestrator-side wrapper around `spawnAgentProcess`.
 *
 * Responsibilities that don't belong inside the agent spawner itself:
 *   - Writing the per-turn tasks/groups snapshots the agent reads
 *   - Enriching the prompt with a recent-files listing (dedup hint)
 *   - Tracking the agent's PID so orphaned children can be cleaned up
 *   - Translating SDK errors back into session-invalidation decisions
 *
 * Everything that mutates module-level state (sessions map, registered
 * groups, queue) is explicitly passed in via `opts` so this file has no
 * closure dependencies on index.ts.
 */
import fs from 'fs';
import path from 'path';

import {
  AgentOutput,
  AvailableGroup,
  spawnAgentProcess,
  writeGroupsSnapshot,
  writeTasksSnapshot,
} from './agent-spawner.js';
import { trackAgentPid, untrackAgentPid } from './agent-pid-lock.js';
import { ASSISTANT_NAME, GROUPS_DIR, MAIN_GROUP_FOLDER } from './config.js';
import { deleteSession, getAllTasks, recordUsage, setSession } from './db.js';
import { GroupQueue } from './group-queue.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

export interface RunAgentOpts {
  group: RegisteredGroup;
  prompt: string;
  chatJid: string;
  /** Mutable map of group folder → current session id. Updated on new session. */
  sessions: Record<string, string>;
  /** All registered groups; used to stamp the groups snapshot. */
  registeredGroups: Record<string, RegisteredGroup>;
  queue: GroupQueue;
  getAvailableGroups: () => AvailableGroup[];
  onOutput?: (output: AgentOutput) => Promise<void>;
}

/** Append a listing of recently-modified files to the prompt so the agent
 *  doesn't duplicate research that another turn just did. Silently no-ops on
 *  I/O errors — missing context is strictly better than a crash here. */
function enrichWithRecentFiles(prompt: string, groupFolder: string): string {
  try {
    const groupDir = path.join(GROUPS_DIR, groupFolder);
    const cutoff = Date.now() - 20 * 60 * 1000; // 20 minutes
    const recentFiles = fs
      .readdirSync(groupDir, { withFileTypes: true })
      .filter((e) => e.isFile() && !e.name.startsWith('.'))
      .map((e) => ({
        name: e.name,
        mtime: fs.statSync(path.join(groupDir, e.name)).mtimeMs,
      }))
      .filter((f) => f.mtime > cutoff)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 10);

    if (recentFiles.length === 0) return prompt;

    const listing = recentFiles
      .map(
        (f) =>
          `  ${f.name} (${Math.round((Date.now() - f.mtime) / 60000)}m ago)`,
      )
      .join('\n');
    return `${prompt}\n\n<recent_files>\nFiles recently created/modified in your workspace:\n${listing}\nCheck these before creating new files on the same topic.\n</recent_files>`;
  } catch {
    return prompt;
  }
}

/** When the agent reports specific "session is wedged" signals, clear the
 *  stored session id so the next turn starts fresh rather than hanging on
 *  the same broken resume. */
function clearBrokenSession(
  group: RegisteredGroup,
  sessions: Record<string, string>,
  priorSessionId: string | undefined,
  output: AgentOutput,
): void {
  const err = output.error ?? '';

  // Idle timeout with no streaming output: the Task sub-agent likely died
  // mid-flight, leaving an unmatched tool_use in the session transcript.
  // Re-resuming that session hangs the SDK silently.
  if (
    err.includes('idle timeout') &&
    !output.newSessionId &&
    sessions[group.folder]
  ) {
    logger.warn(
      { group: group.name, clearedSession: sessions[group.folder] },
      'Idle timeout with no output — clearing session to prevent resume hang',
    );
    delete sessions[group.folder];
    deleteSession(group.folder);
    return;
  }

  // Execution error on resume: the transcript is missing or corrupt.
  const isExecError =
    err.includes('error_during_execution') ||
    err.includes('exited with code 1');
  if (
    isExecError &&
    priorSessionId &&
    sessions[group.folder] === priorSessionId
  ) {
    logger.warn(
      { group: group.name, clearedSession: priorSessionId },
      'Execution error on session resume — clearing broken session',
    );
    delete sessions[group.folder];
    deleteSession(group.folder);
  }
}

export async function runAgent(
  opts: RunAgentOpts,
): Promise<'success' | 'error'> {
  const {
    group,
    prompt,
    chatJid,
    sessions,
    registeredGroups,
    queue,
    getAvailableGroups,
    onOutput,
  } = opts;

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

  writeGroupsSnapshot(
    group.folder,
    isMain,
    getAvailableGroups(),
    new Set(Object.keys(registeredGroups)),
  );

  const wrappedOnOutput = onOutput
    ? async (output: AgentOutput) => {
        if (output.newSessionId) {
          sessions[group.folder] = output.newSessionId;
          setSession(group.folder, output.newSessionId);
        }
        if (output.usage) {
          recordUsage('agent', output.usage, group.folder, chatJid);
        }
        await onOutput(output);
      }
    : undefined;

  const enrichedPrompt = enrichWithRecentFiles(prompt, group.folder);

  try {
    const output = await spawnAgentProcess(
      group,
      {
        prompt: enrichedPrompt,
        sessionId,
        groupFolder: group.folder,
        chatJid,
        isMain,
        assistantName: ASSISTANT_NAME,
      },
      (proc, processName) => {
        queue.registerProcess(chatJid, proc, processName, group.folder);
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
      clearBrokenSession(group, sessions, sessionId, output);
      logger.error(
        { group: group.name, error: output.error },
        'Agent process error',
      );
      return 'error';
    }

    return 'success';
  } catch (err) {
    logger.error({ group: group.name, err }, 'Agent error');
    return 'error';
  }
}
