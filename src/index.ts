import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version: APP_VERSION } = require('../package.json');

import {
  ASSISTANT_NAME,
  getDailyBudgetUsd,
  DATA_DIR,
  IDLE_TIMEOUT,
  MAIN_GROUP_FOLDER,
  MAX_MESSAGES_PER_PROMPT,
  POLL_INTERVAL,
  TELEGRAM_BOT_TOKEN,
  TRIGGER_PATTERN,
} from './config.js';
import { waitForMessage } from './message-signal.js';
import { TelegramChannel } from './channels/telegram.js';
import { initErrorAlerts, sendErrorAlert } from './error-alerts.js';
import {
  isFastPathAvailable,
  shouldBypassFastPath,
  tryFastPath,
} from './fast-path.js';
import { writeGroupsSnapshot } from './agent-spawner.js';
import { runAgent } from './run-agent.js';
import { buildStatusReport } from './status-report.js';
import { runHardReset } from './hard-reset.js';
import {
  getAllChats,
  getAllRegisteredGroups,
  getAllSessions,
  getAllTasks,
  getLastBotMessageTimestamp,
  getMessagesSince,
  getNewMessages,
  getRouterState,
  getTodayCostUsd,
  initDatabase,
  recordUsage,
  setRegisteredGroup,
  deleteSession,
  setRouterState,
  setSession,
  storeChatMetadata,
  storeMessage,
} from './db.js';
import {
  acquirePidLock,
  cleanupOrphanedAgents,
  releasePidLock,
  trackAgentPid,
  untrackAgentPid,
} from './agent-pid-lock.js';
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

let lastTimestamp = '';
let sessions: Record<string, string> = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
const consecutiveFailures: Record<string, number> = {};
const MAX_CURSOR_ROLLBACKS = 3;
let messageLoopRunning = false;
const startTime = Date.now();
const currentTasks: Record<string, string> = {};

// Budget alert throttle: emit at most one Telegram alert per UTC day when
// the daily spend cap is hit. Reset by comparing the stored UTC date.
let lastBudgetAlertDay: string | null = null;
function notifyBudgetExceeded(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (lastBudgetAlertDay === today) return;
  lastBudgetAlertDay = today;
  const spend = getTodayCostUsd();
  sendErrorAlert(
    new Error(
      `Daily budget hit: $${spend.toFixed(2)} / $${getDailyBudgetUsd().toFixed(2)}. Agent in fast-path-only mode until UTC midnight.`,
    ),
    'budget-cap',
  ).catch(() => {
    /* alert failures must not cascade */
  });
}

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

export function getAvailableGroups(): import('./agent-spawner.js').AvailableGroup[] {
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

// --- processGroupMessages pipeline ---
// One batch of messages arriving from a single chat flows through these
// stages in order. Each stage reads/writes module-level state as needed and
// returns a small value the next stage can act on. The top-level function is
// a ten-line orchestrator; the stages are independently readable.

interface BatchContext {
  chatJid: string;
  group: RegisteredGroup;
  channel: Channel;
  messages: NewMessage[];
  prompt: string;
  previousCursor: string;
}

interface AgentTurnOutcome {
  hadError: boolean;
  outputSentToUser: boolean;
}

/**
 * Resolve the group + channel, fetch new messages, enforce trigger filtering,
 * and advance the message cursor. Returns null when there's nothing to do —
 * unregistered chat, no channel, no new messages, or a non-main group without
 * a trigger match in the batch.
 */
function prepareBatch(chatJid: string): BatchContext | null {
  const group = registeredGroups[chatJid];
  if (!group) return null;

  const channel = findChannel(channels, chatJid);
  if (!channel) {
    console.log(`Warning: no channel owns JID ${chatJid}, skipping messages`);
    return null;
  }

  const sinceTimestamp =
    lastAgentTimestamp[chatJid] || getLastBotMessageTimestamp(chatJid) || '';
  const messages = getMessagesSince(
    chatJid,
    sinceTimestamp,
    ASSISTANT_NAME,
    MAX_MESSAGES_PER_PROMPT,
  );
  if (messages.length === 0) return null;

  const isMainGroup = group.folder === MAIN_GROUP_FOLDER;
  if (!isMainGroup && group.requiresTrigger !== false) {
    const hasTrigger = messages.some((m) =>
      TRIGGER_PATTERN.test(m.content.trim()),
    );
    if (!hasTrigger) return null;
  }

  const previousCursor = lastAgentTimestamp[chatJid] || '';
  lastAgentTimestamp[chatJid] = messages[messages.length - 1].timestamp;
  saveState();

  return {
    chatJid,
    group,
    channel,
    messages,
    prompt: formatMessages(messages),
    previousCursor,
  };
}

/**
 * If the conversation was silent for >1h, clear the stored session so the
 * next agent run starts fresh. Under API billing, replayed session history
 * is the single biggest cost driver — don't carry yesterday's context into
 * today's chat.
 */
function maybeResetStaleSession(ctx: BatchContext): void {
  if (!ctx.previousCursor || !sessions[ctx.group.folder]) return;
  const gapMs = Date.now() - Date.parse(ctx.previousCursor);
  if (gapMs <= 60 * 60 * 1000) return;
  logger.info(
    { group: ctx.group.name, gapMinutes: Math.round(gapMs / 60000) },
    'Session idle >1h, clearing for fresh start',
  );
  delete sessions[ctx.group.folder];
  deleteSession(ctx.group.folder);
}

/**
 * Try the cheap Haiku triage path. Records usage whether it handles or
 * hands off (both cost real tokens). Returns true only when the reply
 * landed end-to-end — caller should return immediately.
 */
async function tryFastPathHandle(ctx: BatchContext): Promise<boolean> {
  if (!isFastPathAvailable() || shouldBypassFastPath(ctx.prompt)) {
    return false;
  }
  try {
    const fp = await tryFastPath(ctx.prompt, ctx.group.folder);
    if (fp.usage) {
      recordUsage('fast-path', fp.usage, ctx.group.folder, ctx.chatJid);
    }
    if (!fp.handled || !fp.answer) return false;

    await ctx.channel.sendMessage(ctx.chatJid, fp.answer, false);
    await ctx.channel.setTyping?.(ctx.chatJid, false);
    consecutiveFailures[ctx.chatJid] = 0;
    delete currentTasks[ctx.chatJid];
    logger.info(
      { group: ctx.group.name, cost: fp.usage?.cost_usd },
      'Fast-path handled message',
    );
    return true;
  } catch (err) {
    logger.warn(
      { err, group: ctx.group.name },
      'Fast-path threw, falling through',
    );
    return false;
  }
}

/**
 * When today's spend meets or exceeds `GHOSTCLAW_DAILY_BUDGET_USD`, block
 * tool-using work until UTC midnight. Fast-path already ran (and may have
 * handled the message); if we got here, Haiku either declined or isn't
 * available. Send the canned notice and call it done.
 */
async function tryBudgetGate(ctx: BatchContext): Promise<boolean> {
  const budget = getDailyBudgetUsd();
  if (budget <= 0 || getTodayCostUsd() < budget) return false;

  await ctx.channel.sendMessage(
    ctx.chatJid,
    `⚠️ Daily budget reached ($${getTodayCostUsd().toFixed(2)} of $${budget.toFixed(2)}). Tool-using work is paused until UTC midnight. Simple chat still works.`,
    false,
  );
  await ctx.channel.setTyping?.(ctx.chatJid, false);
  notifyBudgetExceeded();
  consecutiveFailures[ctx.chatJid] = 0;
  delete currentTasks[ctx.chatJid];
  return true;
}

/**
 * Run the full agent for this batch: spawn the child process, stream
 * partial output back to the channel, keep the typing indicator alive,
 * and track just enough state for the caller to decide how to react
 * to an error. Timers are always cleaned up (try/finally) so a thrown
 * runAgent never leaves the group in a stuck state.
 */
async function runFullAgentTurn(ctx: BatchContext): Promise<AgentTurnOutcome> {
  const TYPING_STALL_MS = 15_000;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      logger.debug(
        { group: ctx.group.name },
        'Idle timeout, closing agent stdin',
      );
      queue.closeStdin(ctx.chatJid);
    }, IDLE_TIMEOUT);
  };

  let typingActive = true;
  let lastOutputAt = Date.now();
  const typingInterval = setInterval(() => {
    if (typingActive && Date.now() - lastOutputAt < TYPING_STALL_MS) {
      ctx.channel.setTyping?.(ctx.chatJid, true)?.catch(() => {});
    } else if (typingActive) {
      typingActive = false;
      ctx.channel.setTyping?.(ctx.chatJid, false)?.catch(() => {});
    }
  }, 4000);
  await ctx.channel.setTyping?.(ctx.chatJid, true);

  let hadError = false;
  let outputSentToUser = false;
  currentTasks[ctx.chatJid] = ctx.messages[
    ctx.messages.length - 1
  ].content.slice(0, 120);

  try {
    const status = await runAgent({
      group: ctx.group,
      prompt: ctx.prompt,
      chatJid: ctx.chatJid,
      sessions,
      registeredGroups,
      queue,
      getAvailableGroups,
      onOutput: async (result) => {
        lastOutputAt = Date.now();
        if (!typingActive) {
          typingActive = true;
          ctx.channel.setTyping?.(ctx.chatJid, true)?.catch(() => {});
        }

        if (result.result) {
          const raw =
            typeof result.result === 'string'
              ? result.result
              : JSON.stringify(result.result);
          const text = raw
            .replace(/<internal>[\s\S]*?<\/internal>/g, '')
            .trim();
          logger.info(
            { group: ctx.group.name },
            `Agent output: ${raw.slice(0, 200)}`,
          );
          if (text) {
            clearInterval(typingInterval);
            await ctx.channel.sendMessage(ctx.chatJid, text, false);
            outputSentToUser = true;
          }
          resetIdleTimer();
        }

        if (result.status === 'success') {
          queue.notifyIdle(ctx.chatJid);
        }
        if (result.status === 'error') {
          hadError = true;
        }
      },
    });

    return {
      hadError: hadError || status === 'error',
      outputSentToUser,
    };
  } finally {
    clearInterval(typingInterval);
    await ctx.channel.setTyping?.(ctx.chatJid, false);
    if (idleTimer) clearTimeout(idleTimer);
    delete currentTasks[ctx.chatJid];
  }
}

/**
 * Recover from an agent turn that errored. If output already landed, accept
 * the partial success (rolling the cursor back would duplicate the reply the
 * user can already see). Otherwise increment the failure counter: under the
 * rollback limit → roll cursor back and return false so the queue retries on
 * the next poll; at the limit → leave the cursor advanced, warn the user,
 * and stop the retry spiral.
 */
async function handleAgentError(
  ctx: BatchContext,
  outcome: AgentTurnOutcome,
): Promise<boolean> {
  if (outcome.outputSentToUser) {
    logger.warn(
      { group: ctx.group.name },
      'Agent error after output was sent, skipping cursor rollback to prevent duplicates',
    );
    consecutiveFailures[ctx.chatJid] = 0;
    return true;
  }
  consecutiveFailures[ctx.chatJid] =
    (consecutiveFailures[ctx.chatJid] || 0) + 1;
  if (consecutiveFailures[ctx.chatJid] >= MAX_CURSOR_ROLLBACKS) {
    logger.error(
      { group: ctx.group.name, failures: consecutiveFailures[ctx.chatJid] },
      'Too many consecutive failures — advancing cursor to prevent retry spiral. Some messages may be lost.',
    );
    consecutiveFailures[ctx.chatJid] = 0;
    // Cursor was already advanced by prepareBatch — don't roll it back.
    await ctx.channel.sendMessage(
      ctx.chatJid,
      '⚠️ I had trouble processing some messages and had to skip them. Please resend anything important.',
    );
    return true;
  }
  lastAgentTimestamp[ctx.chatJid] = ctx.previousCursor;
  saveState();
  logger.warn(
    { group: ctx.group.name, failure: consecutiveFailures[ctx.chatJid] },
    'Agent error, rolled back message cursor for retry',
  );
  return false;
}

async function processGroupMessages(chatJid: string): Promise<boolean> {
  const ctx = prepareBatch(chatJid);
  if (!ctx) return true;

  maybeResetStaleSession(ctx);

  logger.info(
    { group: ctx.group.name, messageCount: ctx.messages.length },
    'Processing messages',
  );

  await ctx.channel.setTyping?.(ctx.chatJid, true);

  if (await tryFastPathHandle(ctx)) return true;
  if (await tryBudgetGate(ctx)) return true;

  const outcome = await runFullAgentTurn(ctx);
  if (outcome.hadError) return handleAgentError(ctx, outcome);

  consecutiveFailures[ctx.chatJid] = 0;
  // Memory logging is the agent's responsibility — see groups/{group}/CLAUDE.md
  // for the instruction to prepend meaningful events to memory/log.md. The
  // previous orchestrator-side auto-write produced "- [auto] Handled: <raw
  // Telegram XML preview>" entries that were noise the agent re-read on
  // every session start. Removed in v0.8.2.
  return true;
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

          // Always enqueue. The earlier "pipe into a running agent via IPC"
          // optimization raced with the agent's idle-timeout: if the agent
          // exited between the pipe-write and the IPC read, the message was
          // silently lost. Fresh-spawn on drain is a couple of seconds slower
          // for rapid follow-ups but never drops messages. The agent-runner's
          // `drainIpcInput` at startup also picks up any orphan IPC files
          // from the previous run, so prior losses self-heal on next spawn.
          queue.enqueueMessageCheck(chatJid);
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
    onReset: () =>
      runHardReset({
        queue,
        registeredGroups,
        sessions,
        lastAgentTimestamp,
        saveState,
      }),
    onGetStatus: () =>
      buildStatusReport({ queue, registeredGroups, startTime }),
  };

  if (TELEGRAM_BOT_TOKEN) {
    const telegram = new TelegramChannel(TELEGRAM_BOT_TOKEN, channelOpts);
    channels.push(telegram);
    await telegram.connect();
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
    onProcess: (groupJid, proc, processName, groupFolder) => {
      queue.registerProcess(groupJid, proc, processName, groupFolder);
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
