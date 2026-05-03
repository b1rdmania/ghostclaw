/**
 * Build the HTML status report rendered by the Telegram `/status` command.
 *
 * Aggregates runtime state from the GroupQueue, SQLite (scheduled tasks,
 * error log), and the OS (process count, memory, session dir size) into a
 * single string the channel can reply with.
 *
 * Every read is best-effort — a broken `vm_stat` or missing log file must
 * not break `/status`, it just omits the corresponding section.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

import { DATA_DIR } from './config.js';
import { getAllTasks } from './db.js';
import { GroupQueue } from './group-queue.js';
import { escapeXml } from './router.js';
import { RegisteredGroup } from './types.js';

const require = createRequire(import.meta.url);
const APP_VERSION = require('../package.json').version as string;

export interface StatusReportDeps {
  queue: GroupQueue;
  registeredGroups: Record<string, RegisteredGroup>;
  startTime: number;
}

export function buildStatusReport({
  queue,
  registeredGroups,
  startTime,
}: StatusReportDeps): string {
  const lines: string[] = [
    `<b>GhostClaw v${APP_VERSION}</b>`,
    `Uptime: ${formatUptime(Date.now() - startTime)}`,
  ];

  const status = queue.getStatus();
  lines.push(
    '',
    `<b>Agents</b>`,
    `Active: ${status.active} | Queued: ${status.waiting}`,
  );
  for (const g of status.groups) {
    const group = registeredGroups[g.jid];
    const name = escapeXml(group?.name || g.jid);
    const parts: string[] = [];
    if (g.active) parts.push('running');
    if (g.queuedTasks > 0) parts.push(`${g.queuedTasks} queued`);
    if (g.queuedMessages) parts.push('msgs waiting');
    if (parts.length > 0) lines.push(`• ${name}: ${parts.join(', ')}`);
  }

  appendTasksSection(lines);
  appendProcessCountSection(lines);
  appendMemorySection(lines);
  appendSessionsSection(lines);
  appendErrorsSection(lines);

  return lines.join('\n');
}

function formatUptime(uptimeMs: number): string {
  const mins = Math.floor(uptimeMs / 60000);
  const hrs = Math.floor(mins / 60);
  return hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
}

function appendTasksSection(lines: string[]): void {
  try {
    const tasks = getAllTasks();
    if (tasks.length === 0) return;
    lines.push('', `<b>Tasks</b>: ${tasks.length} scheduled`);
    const ralphTasks = tasks.filter(
      (t) => t.id.includes('ralph') || t.prompt.includes('RALPH'),
    );
    if (ralphTasks.length > 0) {
      lines.push(`Ralph tasks: ${ralphTasks.length}`);
    }
  } catch {
    /* ignore — status report must not throw */
  }
}

function appendProcessCountSection(lines: string[]): void {
  try {
    const raw = execSync(
      "ps aux | grep -E 'claude|agent-runner' | grep -v grep | wc -l",
      { encoding: 'utf-8' },
    ).trim();
    const count = parseInt(raw, 10) || 0;
    lines.push('', `<b>Processes</b>`, `Claude/agent processes: ${count}`);
  } catch {
    /* ignore */
  }
}

function appendMemorySection(lines: string[]): void {
  try {
    const vmStat = execSync('vm_stat', { encoding: 'utf-8' });
    const pageSize = 16384;
    const active = vmStat.match(/Pages active:\s+(\d+)/);
    const wired = vmStat.match(/Pages wired down:\s+(\d+)/);
    if (!active || !wired) return;
    const usedGB =
      ((parseInt(active[1], 10) + parseInt(wired[1], 10)) * pageSize) /
      1024 /
      1024 /
      1024;
    const totalGB = 16;
    const pct = Math.round((usedGB / totalGB) * 100);
    lines.push(
      '',
      `<b>Memory</b>`,
      `${usedGB.toFixed(1)}GB / ${totalGB}GB (${pct}%)${pct > 85 ? ' ⚠️' : ''}`,
    );
  } catch {
    /* ignore — non-macOS or no vm_stat */
  }
}

function appendSessionsSection(lines: string[]): void {
  try {
    const size = execSync(
      `du -sh ${path.join(DATA_DIR, 'sessions')} 2>/dev/null | cut -f1`,
      { encoding: 'utf-8' },
    ).trim();
    lines.push('', `<b>Sessions</b>`, `Size: ${size}`);
  } catch {
    /* ignore */
  }
}

const ERROR_CATEGORIES: Array<[string, RegExp]> = [
  ['Idle timeouts', /idle timeout/i],
  ['Absolute timeouts', /absolute timeout/i],
  ['Rate limits', /rate.limit|429/i],
  ['Agent crashes', /exit.*code|exited/i],
  ['Retry spirals', /cursor|retry spiral/i],
];

function appendErrorsSection(lines: string[]): void {
  try {
    const logFile = path.join(process.cwd(), 'logs', 'ghostclaw.log');
    if (!fs.existsSync(logFile)) return;

    const today = new Date().toISOString().slice(0, 10);
    const errorLines = execSync(
      `grep "ERROR" "${logFile}" 2>/dev/null || true`,
      { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 },
    )
      .split('\n')
      .filter((l) => l.includes(today));

    lines.push('', `<b>Errors today</b>`);
    if (errorLines.length === 0) {
      lines.push('None ✓');
      return;
    }

    const counts: Record<string, number> = {};
    for (const line of errorLines) {
      const clean = line.replace(/\x1b\[[0-9;]*m/g, '');
      const matched = ERROR_CATEGORIES.find(([, pat]) => pat.test(clean));
      const key = matched ? matched[0] : 'Other';
      counts[key] = (counts[key] || 0) + 1;
    }

    lines.push(`Total: ${errorLines.length}`);
    for (const [cat, count] of Object.entries(counts)) {
      lines.push(`• ${cat}: ${count}`);
    }
  } catch {
    /* ignore */
  }
}
