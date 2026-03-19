import fs from 'fs';
import path from 'path';

import {
  ASSISTANT_NAME,
  DATA_DIR,
  IDLE_TIMEOUT,
  MAIN_GROUP_FOLDER,
  POLL_INTERVAL,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_ONLY,
  TRIGGER_PATTERN,
} from './config.js';
import { waitForMessage } from './message-signal.js';
import { TelegramChannel } from './channels/telegram.js';
import { WhatsAppChannel } from './channels/whatsapp.js';
import { initErrorAlerts, sendErrorAlert } from './error-alerts.js';
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
let messageLoopRunning = false;
const startTime = Date.now();

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

  const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
  const missedMessages = getMessagesSince(
    chatJid,
    sinceTimestamp,
    ASSISTANT_NAME,
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

  if (output === 'error' || hadError) {
    if (outputSentToUser) {
      logger.warn(
        { group: group.name },
        'Agent error after output was sent, skipping cursor rollback to prevent duplicates',
      );
      return true;
    }
    lastAgentTimestamp[chatJid] = previousCursor;
    saveState();
    logger.warn(
      { group: group.name },
      'Agent error, rolled back message cursor for retry',
    );
    return false;
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

  try {
    const output = await runContainerAgent(
      group,
      {
        prompt,
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
            lastAgentTimestamp[chatJid] || '',
            ASSISTANT_NAME,
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
    const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
    const pending = getMessagesSince(chatJid, sinceTimestamp, ASSISTANT_NAME);
    if (pending.length > 0) {
      logger.info(
        { group: group.name, pendingCount: pending.length },
        'Recovery: found unprocessed messages',
      );
      queue.enqueueMessageCheck(chatJid);
    }
  }
}

function acquirePidLock(): void {
  const pidFile = path.join(DATA_DIR, 'ghostclaw.pid');
  fs.mkdirSync(DATA_DIR, { recursive: true });

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

async function main(): Promise<void> {
  acquirePidLock();
  cleanupOrphanedAgents();

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
    onReset: (chatJid: string) => {
      queue.clearQueue(chatJid);
      const group = registeredGroups[chatJid];
      if (group) {
        delete sessions[group.folder];
        deleteSession(group.folder);
      }
      return queue.killAgent(chatJid);
    },
    onGetStatus: () => {
      const status = queue.getStatus();
      const uptimeMs = Date.now() - startTime;
      const uptimeMin = Math.floor(uptimeMs / 60000);
      const uptimeHr = Math.floor(uptimeMin / 60);
      const uptime =
        uptimeHr > 0 ? `${uptimeHr}h ${uptimeMin % 60}m` : `${uptimeMin}m`;

      const lines = [
        `<b>GhostClaw status</b>`,
        `Uptime: ${uptime}`,
        `Active agents: ${status.active}`,
        `Waiting groups: ${status.waiting}`,
      ];

      if (status.groups.length > 0) {
        lines.push('');
        for (const g of status.groups) {
          const group = registeredGroups[g.jid];
          const name = escapeXml(group?.name || g.jid);
          const parts: string[] = [];
          if (g.active) parts.push('running');
          if (g.queuedTasks > 0) parts.push(`${g.queuedTasks} task(s) queued`);
          if (g.queuedMessages) parts.push('messages queued');
          lines.push(`• ${name}: ${parts.join(', ')}`);
        }
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
    channel
      .sendMessage(groupJid, 'Got it, finishing a task first...')
      .catch(() => {});
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
