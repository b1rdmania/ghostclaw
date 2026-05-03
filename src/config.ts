import path from 'path';

import { readEnvFile } from './env.js';

// Read config values from .env (falls back to process.env).
// Secrets are NOT read here — they stay on disk and are loaded only
// where needed (agent-spawner.ts) to avoid leaking to child processes.
const envConfig = readEnvFile([
  'ASSISTANT_NAME',
  'TELEGRAM_BOT_TOKEN',
  'AGENT_IDLE_TIMEOUT',
  'AGENT_ABSOLUTE_TIMEOUT',
  'RALPH_MAX_ITERATIONS',
  'GHOSTCLAW_DAILY_BUDGET_USD',
]);

export const ASSISTANT_NAME =
  process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || 'Andy';
export const POLL_INTERVAL = 500;
export const SCHEDULER_POLL_INTERVAL = 60000;

const PROJECT_ROOT = process.cwd();

export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');
export const MAIN_GROUP_FOLDER = 'main';

export const MAX_AGENT_OUTPUT_SIZE = parseInt(
  process.env.MAX_AGENT_OUTPUT_SIZE || '10485760',
  10,
); // 10MB default
export const IPC_POLL_INTERVAL = 1000;
export const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT || '120000', 10); // 2min default — how long to keep session alive after last result before sending _close

// Agent process timeouts (two independent timers in agent-spawner)
// Idle: reset on any stdout activity. Agent with no stdout for this long is stuck → kill.
export const AGENT_IDLE_TIMEOUT = parseInt(
  process.env.AGENT_IDLE_TIMEOUT || envConfig.AGENT_IDLE_TIMEOUT || '600000',
  10,
); // 10 min default
// Absolute: never resets. Hard ceiling regardless of any activity.
export const AGENT_ABSOLUTE_TIMEOUT = parseInt(
  process.env.AGENT_ABSOLUTE_TIMEOUT ||
    envConfig.AGENT_ABSOLUTE_TIMEOUT ||
    '2700000',
  10,
); // 45 min default
export const RALPH_MAX_ITERATIONS = parseInt(
  process.env.RALPH_MAX_ITERATIONS || envConfig.RALPH_MAX_ITERATIONS || '10',
  10,
); // 10 steps default — override in .env or per-run

export const MAX_CONCURRENT_AGENTS = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_AGENTS || '5', 10) || 5,
);

export const MAX_MESSAGES_PER_PROMPT = Math.max(
  1,
  parseInt(process.env.MAX_MESSAGES_PER_PROMPT || '50', 10) || 50,
);

export const TRIGGER_PATTERN = new RegExp(
  `^@${ASSISTANT_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
  'i',
);

// Timezone for scheduled tasks (cron expressions, etc.)
// Uses system timezone by default
export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

// Telegram configuration
export const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN || envConfig.TELEGRAM_BOT_TOKEN || '';

// Daily spend ceiling in USD. When exceeded, the orchestrator forces
// fast-path-only mode until UTC midnight. 0 or unset disables the cap.
// Read fresh on every call so /budget set at runtime applies without restart.
export function getDailyBudgetUsd(): number {
  const raw =
    process.env.GHOSTCLAW_DAILY_BUDGET_USD ||
    envConfig.GHOSTCLAW_DAILY_BUDGET_USD;
  if (!raw) return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
