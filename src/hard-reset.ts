/**
 * `/reset` via Telegram — nuke running agents, scheduled tasks, sessions,
 * and orphan processes for this installation, then report what happened.
 *
 * Caller is responsible for restarting the service after the report is
 * returned; we don't `process.exit` here so the Telegram reply can land first.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { DATA_DIR } from './config.js';
import { deleteSession, deleteTask, getAllTasks } from './db.js';
import { GroupQueue } from './group-queue.js';
import { RegisteredGroup } from './types.js';

export interface HardResetDeps {
  queue: GroupQueue;
  registeredGroups: Record<string, RegisteredGroup>;
  /** Mutable session map — cleared in place. */
  sessions: Record<string, string>;
  /** Mutable cursor map — advanced to now for every registered group. */
  lastAgentTimestamp: Record<string, string>;
  saveState: () => void;
}

export async function runHardReset(deps: HardResetDeps): Promise<string> {
  const report: string[] = [];

  // 1. Kill all active agents + drain queues.
  const status = deps.queue.getStatus();
  for (const jid of Object.keys(deps.registeredGroups)) {
    deps.queue.clearQueue(jid);
    deps.queue.killAgent(jid);
  }
  report.push(
    `Killed ${status.active} agent(s), cleared ${status.waiting} queued`,
  );

  // 2. Clear every scheduled task (including Ralph).
  const tasks = getAllTasks();
  for (const task of tasks) deleteTask(task.id);
  report.push(`Cleared ${tasks.length} scheduled task(s)`);

  // 3. Wipe session data on disk and in-memory.
  const sessionsDir = path.join(DATA_DIR, 'sessions');
  if (fs.existsSync(sessionsDir)) {
    fs.rmSync(sessionsDir, { recursive: true, force: true });
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
  for (const group of Object.values(deps.registeredGroups)) {
    delete deps.sessions[group.folder];
    deleteSession(group.folder);
  }
  report.push('Wiped all session data');

  // 4. Kill any orphaned agent processes the PID-lock cleanup might have missed.
  try {
    const out = execSync("pgrep -f 'agent-runner|claude' || true", {
      encoding: 'utf-8',
    }).trim();
    const pids = out
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

  // 5. System memory snapshot (best-effort, macOS-specific).
  try {
    const totalBytes = parseInt(
      execSync('sysctl -n hw.memsize', { encoding: 'utf-8' }).trim(),
      10,
    );
    const totalGB = Math.round(totalBytes / 1024 / 1024 / 1024);
    report.push(`System memory: ${totalGB}GB total`);
  } catch {
    /* non-macOS — skip */
  }

  // 6. Advance every cursor so missed messages don't spam the agent on restart.
  const now = new Date().toISOString();
  for (const jid of Object.keys(deps.registeredGroups)) {
    deps.lastAgentTimestamp[jid] = now;
  }
  deps.saveState();
  report.push('Advanced message cursor to now');

  return `Hard reset complete:\n${report.map((r) => `• ${r}`).join('\n')}`;
}
