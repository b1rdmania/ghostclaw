import fs from 'fs';
import path from 'path';

import { CronExpressionParser } from 'cron-parser';

import {
  DATA_DIR,
  IPC_POLL_INTERVAL,
  MAIN_GROUP_FOLDER,
  TIMEZONE,
} from './config.js';
import { AvailableGroup } from './agent-spawner.js';
import { createTask, deleteTask, getTaskById, updateTask } from './db.js';
import { isValidGroupFolder } from './group-folder.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

export interface IpcDeps {
  sendMessage: (jid: string, text: string) => Promise<void>;
  sendDocument?: (
    jid: string,
    buffer: Buffer,
    filename: string,
  ) => Promise<void>;
  registeredGroups: () => Record<string, RegisteredGroup>;
  registerGroup: (jid: string, group: RegisteredGroup) => void;
  getAvailableGroups: () => AvailableGroup[];
  writeGroupsSnapshot: (
    groupFolder: string,
    isMain: boolean,
    availableGroups: AvailableGroup[],
    registeredJids: Set<string>,
  ) => void;
}

/** Union of all IPC message shapes a group can post. The server validates
 *  authorization per-handler; this type is only a surface contract. */
export interface TaskIpcMessage {
  type: string;
  taskId?: string;
  prompt?: string;
  pre_check?: string;
  schedule_type?: string;
  schedule_value?: string;
  context_mode?: string;
  groupFolder?: string;
  chatJid?: string;
  targetJid?: string;
  // register_group fields
  jid?: string;
  name?: string;
  folder?: string;
  trigger?: string;
  requiresTrigger?: boolean;
  extraDirs?: string[];
  // ralph fields
  taskFile?: string;
  workDir?: string;
  maxIterations?: number;
  notifyProgress?: boolean;
  runId?: string;
}

let ipcWatcherRunning = false;

export function startIpcWatcher(deps: IpcDeps): void {
  if (ipcWatcherRunning) {
    logger.debug('IPC watcher already running, skipping duplicate start');
    return;
  }
  ipcWatcherRunning = true;

  const ipcBaseDir = path.join(DATA_DIR, 'ipc');
  fs.mkdirSync(ipcBaseDir, { recursive: true });

  const processIpcFiles = async () => {
    let groupFolders: string[];
    try {
      groupFolders = fs.readdirSync(ipcBaseDir).filter((f) => {
        const stat = fs.statSync(path.join(ipcBaseDir, f));
        return stat.isDirectory() && f !== 'errors';
      });
    } catch (err) {
      logger.error({ err }, 'Error reading IPC base directory');
      setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
      return;
    }

    for (const sourceGroup of groupFolders) {
      const isMain = sourceGroup === MAIN_GROUP_FOLDER;
      await processMessagesDir(ipcBaseDir, sourceGroup, isMain, deps);
      await processTasksDir(ipcBaseDir, sourceGroup, isMain, deps);
    }

    setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
  };

  processIpcFiles();
  logger.info('IPC watcher started (per-group namespaces)');
}

/** Drain the messages/ directory for one source group, forwarding each
 *  authorized payload to `deps.sendMessage`. Malformed files are quarantined
 *  to `ipc/errors/` so a single bad write doesn't wedge the watcher. */
async function processMessagesDir(
  ipcBaseDir: string,
  sourceGroup: string,
  isMain: boolean,
  deps: IpcDeps,
): Promise<void> {
  const messagesDir = path.join(ipcBaseDir, sourceGroup, 'messages');
  if (!fs.existsSync(messagesDir)) return;

  const registeredGroups = deps.registeredGroups();
  let messageFiles: string[];
  try {
    messageFiles = fs
      .readdirSync(messagesDir)
      .filter((f) => f.endsWith('.json'));
  } catch (err) {
    logger.error({ err, sourceGroup }, 'Error reading IPC messages directory');
    return;
  }

  for (const file of messageFiles) {
    const filePath = path.join(messagesDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (data.type === 'message' && data.chatJid && data.text) {
        const targetGroup = registeredGroups[data.chatJid];
        const authorized =
          isMain ||
          (targetGroup !== undefined && targetGroup.folder === sourceGroup);
        if (authorized) {
          await deps.sendMessage(data.chatJid, data.text);
          logger.info(
            { chatJid: data.chatJid, sourceGroup },
            'IPC message sent',
          );
        } else {
          logger.warn(
            { chatJid: data.chatJid, sourceGroup },
            'Unauthorized IPC message attempt blocked',
          );
        }
      }
      fs.unlinkSync(filePath);
    } catch (err) {
      logger.error({ file, sourceGroup, err }, 'Error processing IPC message');
      quarantine(ipcBaseDir, filePath, `${sourceGroup}-${file}`);
    }
  }
}

/** Drain the tasks/ directory for one source group, dispatching each
 *  payload through `processTaskIpc`. Malformed files are quarantined. */
async function processTasksDir(
  ipcBaseDir: string,
  sourceGroup: string,
  isMain: boolean,
  deps: IpcDeps,
): Promise<void> {
  const tasksDir = path.join(ipcBaseDir, sourceGroup, 'tasks');
  if (!fs.existsSync(tasksDir)) return;

  let taskFiles: string[];
  try {
    taskFiles = fs.readdirSync(tasksDir).filter((f) => f.endsWith('.json'));
  } catch (err) {
    logger.error({ err, sourceGroup }, 'Error reading IPC tasks directory');
    return;
  }

  for (const file of taskFiles) {
    const filePath = path.join(tasksDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      await processTaskIpc(data, sourceGroup, isMain, deps);
      fs.unlinkSync(filePath);
    } catch (err) {
      logger.error({ file, sourceGroup, err }, 'Error processing IPC task');
      quarantine(ipcBaseDir, filePath, `${sourceGroup}-${file}`);
    }
  }
}

function quarantine(
  ipcBaseDir: string,
  filePath: string,
  renameTo: string,
): void {
  try {
    const errorDir = path.join(ipcBaseDir, 'errors');
    fs.mkdirSync(errorDir, { recursive: true });
    fs.renameSync(filePath, path.join(errorDir, renameTo));
  } catch {
    /* last-resort: drop it */
  }
}

// --- IPC task dispatcher ---
// Top-level entry point: routes each IPC task payload to its handler.
// Handlers are separate functions below — easier to read than one 270-line switch.

export async function processTaskIpc(
  data: TaskIpcMessage,
  sourceGroup: string,
  isMain: boolean,
  deps: IpcDeps,
): Promise<void> {
  switch (data.type) {
    case 'schedule_task':
      handleScheduleTask(data, sourceGroup, isMain, deps);
      return;
    case 'pause_task':
      handlePauseTask(data, sourceGroup, isMain);
      return;
    case 'resume_task':
      handleResumeTask(data, sourceGroup, isMain);
      return;
    case 'cancel_task':
      handleCancelTask(data, sourceGroup, isMain);
      return;
    case 'register_group':
      handleRegisterGroup(data, sourceGroup, isMain, deps);
      return;
    case 'start_ralph':
      await handleStartRalph(data, sourceGroup, isMain, deps);
      return;
    case 'stop_ralph':
      await handleStopRalph(data, sourceGroup, isMain, deps);
      return;
    default:
      logger.warn({ type: data.type }, 'Unknown IPC task type');
  }
}

function handleScheduleTask(
  data: TaskIpcMessage,
  sourceGroup: string,
  isMain: boolean,
  deps: IpcDeps,
): void {
  if (
    !data.prompt ||
    !data.schedule_type ||
    !data.schedule_value ||
    !data.targetJid
  ) {
    return;
  }
  const targetJid = data.targetJid;
  const targetGroupEntry = deps.registeredGroups()[targetJid];
  if (!targetGroupEntry) {
    logger.warn(
      { targetJid },
      'Cannot schedule task: target group not registered',
    );
    return;
  }
  const targetFolder = targetGroupEntry.folder;

  // Non-main groups can only schedule tasks for themselves.
  if (!isMain && targetFolder !== sourceGroup) {
    logger.warn(
      { sourceGroup, targetFolder },
      'Unauthorized schedule_task attempt blocked',
    );
    return;
  }

  const scheduleType = data.schedule_type as 'cron' | 'interval' | 'once';
  const nextRun = computeNextRun(scheduleType, data.schedule_value);
  if (nextRun === null) return; // invalid schedule value — already logged

  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const contextMode =
    data.context_mode === 'group' || data.context_mode === 'isolated'
      ? data.context_mode
      : 'isolated';
  createTask({
    id: taskId,
    group_folder: targetFolder,
    chat_jid: targetJid,
    prompt: data.prompt,
    pre_check: data.pre_check || null,
    schedule_type: scheduleType,
    schedule_value: data.schedule_value,
    context_mode: contextMode,
    next_run: nextRun,
    status: 'active',
    created_at: new Date().toISOString(),
  });
  logger.info(
    { taskId, sourceGroup, targetFolder, contextMode },
    'Task created via IPC',
  );
}

function computeNextRun(
  scheduleType: 'cron' | 'interval' | 'once',
  scheduleValue: string,
): string | null {
  if (scheduleType === 'cron') {
    try {
      return CronExpressionParser.parse(scheduleValue, { tz: TIMEZONE })
        .next()
        .toISOString();
    } catch {
      logger.warn({ scheduleValue }, 'Invalid cron expression');
      return null;
    }
  }
  if (scheduleType === 'interval') {
    const ms = parseInt(scheduleValue, 10);
    if (isNaN(ms) || ms <= 0) {
      logger.warn({ scheduleValue }, 'Invalid interval');
      return null;
    }
    return new Date(Date.now() + ms).toISOString();
  }
  // 'once'
  const scheduled = new Date(scheduleValue);
  if (isNaN(scheduled.getTime())) {
    logger.warn({ scheduleValue }, 'Invalid timestamp');
    return null;
  }
  return scheduled.toISOString();
}

function handlePauseTask(
  data: TaskIpcMessage,
  sourceGroup: string,
  isMain: boolean,
): void {
  mutateTaskStatus(data.taskId, sourceGroup, isMain, 'paused', 'paused');
}

function handleResumeTask(
  data: TaskIpcMessage,
  sourceGroup: string,
  isMain: boolean,
): void {
  mutateTaskStatus(data.taskId, sourceGroup, isMain, 'active', 'resumed');
}

function handleCancelTask(
  data: TaskIpcMessage,
  sourceGroup: string,
  isMain: boolean,
): void {
  if (!data.taskId) return;
  const task = getTaskById(data.taskId);
  if (!task || (!isMain && task.group_folder !== sourceGroup)) {
    logger.warn(
      { taskId: data.taskId, sourceGroup },
      'Unauthorized task cancel attempt',
    );
    return;
  }
  deleteTask(data.taskId);
  logger.info({ taskId: data.taskId, sourceGroup }, 'Task cancelled via IPC');
}

function mutateTaskStatus(
  taskId: string | undefined,
  sourceGroup: string,
  isMain: boolean,
  newStatus: 'active' | 'paused',
  verb: 'paused' | 'resumed',
): void {
  if (!taskId) return;
  const task = getTaskById(taskId);
  if (!task || (!isMain && task.group_folder !== sourceGroup)) {
    logger.warn(
      { taskId, sourceGroup },
      `Unauthorized task ${verb === 'paused' ? 'pause' : 'resume'} attempt`,
    );
    return;
  }
  updateTask(taskId, { status: newStatus });
  logger.info({ taskId, sourceGroup }, `Task ${verb} via IPC`);
}

function handleRegisterGroup(
  data: TaskIpcMessage,
  sourceGroup: string,
  isMain: boolean,
  deps: IpcDeps,
): void {
  if (!isMain) {
    logger.warn({ sourceGroup }, 'Unauthorized register_group attempt blocked');
    return;
  }
  if (!data.jid || !data.name || !data.folder || !data.trigger) {
    logger.warn(
      { data },
      'Invalid register_group request - missing required fields',
    );
    return;
  }
  if (!isValidGroupFolder(data.folder)) {
    logger.warn(
      { sourceGroup, folder: data.folder },
      'Invalid register_group request - unsafe folder name',
    );
    return;
  }
  deps.registerGroup(data.jid, {
    name: data.name,
    folder: data.folder,
    trigger: data.trigger,
    added_at: new Date().toISOString(),
    extraDirs: data.extraDirs,
    requiresTrigger: data.requiresTrigger,
  });
}

async function handleStartRalph(
  data: TaskIpcMessage,
  sourceGroup: string,
  isMain: boolean,
  deps: IpcDeps,
): Promise<void> {
  if (!isMain) {
    logger.warn({ sourceGroup }, 'Unauthorized start_ralph attempt blocked');
    return;
  }
  if (!data.taskFile || !data.targetJid) {
    logger.warn({ sourceGroup }, 'start_ralph missing taskFile or targetJid');
    return;
  }
  try {
    const { startRalphRun } = await import('./ralph-runner.js');
    const { createTask: createTaskFn } = await import('./db.js');
    const ralphRunId = await startRalphRun(
      {
        taskFilePath: data.taskFile,
        workDir: data.workDir || process.cwd(),
        targetJid: data.targetJid,
        groupFolder: sourceGroup,
        maxIterations: data.maxIterations,
        notifyProgress: data.notifyProgress,
      },
      {
        createTask: createTaskFn,
        sendMessage: deps.sendMessage,
        sendDocument: deps.sendDocument,
        readFile: (p: string) => fs.readFileSync(p, 'utf-8'),
        writeFile: (p: string, c: string) => fs.writeFileSync(p, c),
        mkdirSync: (p: string, opts?) => fs.mkdirSync(p, opts),
        existsSync: (p: string) => fs.existsSync(p),
        readdirSync: (p: string) => fs.readdirSync(p),
        statSync: (p: string) => fs.statSync(p),
        now: () => new Date().toISOString(),
      },
    );
    await deps.sendMessage(data.targetJid, `Ralph run started: ${ralphRunId}`);
    logger.info(
      { runId: ralphRunId, sourceGroup },
      'Ralph run started via IPC',
    );
  } catch (err) {
    logger.error({ err, sourceGroup }, 'Failed to start ralph run');
    await deps.sendMessage(
      data.targetJid,
      `Failed to start Ralph: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function handleStopRalph(
  data: TaskIpcMessage,
  sourceGroup: string,
  isMain: boolean,
  deps: IpcDeps,
): Promise<void> {
  if (!isMain) {
    logger.warn({ sourceGroup }, 'Unauthorized stop_ralph attempt blocked');
    return;
  }
  if (!data.runId) return;
  try {
    const { stopRalphRun } = await import('./ralph-runner.js');
    stopRalphRun(data.runId, {
      createTask: () => {},
      sendMessage: deps.sendMessage,
      readFile: (p: string) => fs.readFileSync(p, 'utf-8'),
      writeFile: (p: string, c: string) => fs.writeFileSync(p, c),
      mkdirSync: (p: string, opts?) => fs.mkdirSync(p, opts),
      existsSync: (p: string) => fs.existsSync(p),
      now: () => new Date().toISOString(),
    });
    if (data.targetJid) {
      await deps.sendMessage(
        data.targetJid,
        `Ralph run stopped: ${data.runId}`,
      );
    }
    logger.info({ runId: data.runId }, 'Ralph run stopped via IPC');
  } catch (err) {
    logger.error({ runId: data.runId, err }, 'Failed to stop ralph run');
  }
}
