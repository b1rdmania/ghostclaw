/**
 * Process-level locks for GhostClaw.
 *
 * Two concerns, one module:
 *
 * 1. Singleton PID lock — prevents two GhostClaw orchestrators binding the
 *    same Telegram bot and racing on message delivery. Holds a lock file
 *    open for the process lifetime; kills any previous PID recorded in
 *    ghostclaw.pid and re-checks after 500ms to catch startup races.
 *
 * 2. Agent process tracking — persists the PIDs of spawned agent child
 *    processes to `agent-pids.json` so that after a crash/kill of the
 *    orchestrator we can SIGKILL the orphaned agents on next boot.
 *
 * Both are file-backed rather than in-memory because they need to survive
 * the orchestrator's own death.
 */
import fs from 'fs';
import path from 'path';

import { DATA_DIR } from './config.js';
import { logger } from './logger.js';

let lockFd: number | null = null;

export function acquirePidLock(): void {
  const pidFile = path.join(DATA_DIR, 'ghostclaw.pid');
  const lockFile = path.join(DATA_DIR, 'ghostclaw.lock');
  fs.mkdirSync(DATA_DIR, { recursive: true });

  try {
    lockFd = fs.openSync(
      lockFile,
      fs.constants.O_WRONLY | fs.constants.O_CREAT,
      0o644,
    );
    fs.writeSync(lockFd, String(process.pid));
    fs.fsyncSync(lockFd);
    // Intentionally not closing — held for process lifetime, released by the OS on exit.
  } catch {
    logger.error('Failed to acquire lock file');
    process.exit(1);
  }

  // Kill any existing process recorded in the PID file
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

  // Re-check after 500ms so we notice a simultaneous starter that won the race.
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

export function releasePidLock(): void {
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

export function trackAgentPid(pid: number): void {
  const pids = readAgentPids();
  if (!pids.includes(pid)) {
    pids.push(pid);
    writeAgentPids(pids);
  }
}

export function untrackAgentPid(pid: number): void {
  const pids = readAgentPids().filter((p) => p !== pid);
  writeAgentPids(pids);
}

export function cleanupOrphanedAgents(): void {
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
