/**
 * Ralph Runner — orchestrates the Ralph autonomous loop.
 * Manages run lifecycle: start, iterate, stop.
 * All deps injected for testability.
 */

import path from 'path';

import { DATA_DIR, RALPH_MAX_ITERATIONS } from './config.js';
import { logger } from './logger.js';
import {
  RalphConfig,
  parseTaskFile,
  getNextTask,
  buildIterationPrompt,
  markTaskComplete,
  formatProgressEntry,
  wrapWithPrefix,
} from './ralph.js';
import { ScheduledTask } from './types.js';

export interface RalphRunnerDeps {
  createTask: (task: Omit<ScheduledTask, 'last_run' | 'last_result'>) => void;
  sendMessage: (jid: string, text: string) => Promise<void>;
  sendDocument?: (
    jid: string,
    buffer: Buffer,
    filename: string,
  ) => Promise<void>;
  readFile: (path: string) => string;
  writeFile: (path: string, content: string) => void;
  mkdirSync: (path: string, opts?: { recursive?: boolean }) => void;
  existsSync: (path: string) => boolean;
  readdirSync?: (path: string) => string[];
  statSync?: (path: string) => { mtimeMs: number };
  now: () => string;
}

export function getRalphBaseDir(): string {
  return path.join(DATA_DIR, 'ralph');
}

export function getRalphRunDir(runId: string): string {
  return path.join(getRalphBaseDir(), runId);
}

function readConfig(runId: string, deps: RalphRunnerDeps): RalphConfig {
  const configPath = path.join(getRalphRunDir(runId), 'config.json');
  return JSON.parse(deps.readFile(configPath));
}

function writeConfig(config: RalphConfig, deps: RalphRunnerDeps): void {
  const configPath = path.join(getRalphRunDir(config.runId), 'config.json');
  deps.writeFile(configPath, JSON.stringify(config, null, 2));
}

function readProgress(runId: string, deps: RalphRunnerDeps): string {
  const progressPath = path.join(getRalphRunDir(runId), 'progress.txt');
  try {
    return deps.readFile(progressPath);
  } catch {
    return '';
  }
}

function appendProgress(
  runId: string,
  entry: string,
  deps: RalphRunnerDeps,
): void {
  const progressPath = path.join(getRalphRunDir(runId), 'progress.txt');
  const existing = readProgress(runId, deps);
  const content = existing ? `${existing}\n${entry}` : entry;
  deps.writeFile(progressPath, content);
}

function scheduleIteration(
  config: RalphConfig,
  prompt: string,
  deps: RalphRunnerDeps,
): void {
  const iteration = config.currentIteration + 1;
  const wrappedPrompt = wrapWithPrefix(config.runId, iteration, prompt);
  const taskId = `ralph-iter-${config.runId}-${iteration}-${Date.now()}`;
  const now = deps.now();

  deps.createTask({
    id: taskId,
    group_folder: config.groupFolder,
    chat_jid: config.targetJid,
    prompt: wrappedPrompt,
    schedule_type: 'once',
    schedule_value: now,
    context_mode: 'isolated',
    next_run: now,
    status: 'active',
    created_at: now,
  });
}

/** Send .md files from workDir to user after completion. */
async function sendOutputFiles(
  config: RalphConfig,
  deps: RalphRunnerDeps,
): Promise<void> {
  if (!deps.sendDocument || !deps.readdirSync) return;

  try {
    const runStart = new Date(config.startedAt).getTime();
    const files = deps
      .readdirSync(config.workDir)
      .filter((f) => f.endsWith('.md'))
      .filter((f) => {
        if (!deps.statSync) return true;
        try {
          return (
            deps.statSync(path.join(config.workDir, f)).mtimeMs >= runStart
          );
        } catch {
          return false;
        }
      });

    for (const file of files) {
      try {
        const content = deps.readFile(path.join(config.workDir, file));
        await deps.sendDocument(config.targetJid, Buffer.from(content), file);
      } catch (err) {
        logger.warn({ file, err }, 'Failed to send Ralph output file');
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to list Ralph output files');
  }
}

/** Start a new Ralph run. Returns the runId. */
export async function startRalphRun(
  params: {
    taskFilePath: string;
    workDir: string;
    targetJid: string;
    groupFolder: string;
    maxIterations?: number;
    maxFailuresPerTask?: number;
    notifyProgress?: boolean;
  },
  deps: RalphRunnerDeps,
): Promise<string> {
  // Validate task file
  const content = deps.readFile(params.taskFilePath);
  const tasks = parseTaskFile(content);
  const next = getNextTask(tasks);

  if (!next) {
    throw new Error('No unchecked tasks found in task file. Nothing to run.');
  }

  const now = deps.now();
  const runId = `ralph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const config: RalphConfig = {
    runId,
    taskFilePath: params.taskFilePath,
    workDir: params.workDir,
    targetJid: params.targetJid,
    groupFolder: params.groupFolder,
    maxIterations: params.maxIterations ?? RALPH_MAX_ITERATIONS,
    maxFailuresPerTask: params.maxFailuresPerTask ?? 3,
    currentIteration: 0,
    consecutiveFailures: {},
    status: 'running',
    startedAt: now,
    notifyProgress: params.notifyProgress ?? true,
  };

  // Create run directory and write initial state
  const runDir = getRalphRunDir(runId);
  deps.mkdirSync(runDir, { recursive: true });
  writeConfig(config, deps);
  deps.writeFile(path.join(runDir, 'progress.txt'), '');

  // Build and schedule first iteration
  const progressLog = '';
  const prompt = buildIterationPrompt(next, config, progressLog);
  scheduleIteration(config, prompt, deps);

  logger.info(
    { runId, taskFile: params.taskFilePath, taskCount: tasks.length },
    'Ralph run started',
  );

  return runId;
}

/** Called by task-scheduler when a Ralph iteration completes. */
export async function onIterationComplete(
  runId: string,
  iteration: number,
  taskOutput: string,
  success: boolean,
  durationMs: number,
  deps: RalphRunnerDeps,
): Promise<void> {
  const config = readConfig(runId, deps);

  if (config.status !== 'running') {
    logger.info(
      { runId, status: config.status },
      'Ralph run not active, skipping',
    );
    return;
  }

  // Re-read task file (user may have edited it between iterations)
  const content = deps.readFile(config.taskFilePath);
  const tasks = parseTaskFile(content);
  const currentTask = getNextTask(tasks);

  if (!currentTask) {
    // All tasks were completed (possibly by user manually editing the file)
    config.status = 'completed';
    config.currentIteration = iteration;
    writeConfig(config, deps);
    await deps.sendMessage(
      config.targetJid,
      `Ralph run ${runId} completed. All ${tasks.length} tasks done.`,
    );
    return;
  }

  // Update iteration count
  config.currentIteration = iteration;

  if (success) {
    // Mark the task as complete in the file
    const updated = markTaskComplete(content, currentTask.index);
    deps.writeFile(config.taskFilePath, updated);

    // Reset failure counter for this task
    delete config.consecutiveFailures[currentTask.index];

    // Log progress
    const entry = formatProgressEntry(iteration, currentTask, durationMs, true);
    appendProgress(runId, entry, deps);

    if (config.notifyProgress) {
      await deps.sendMessage(
        config.targetJid,
        `Ralph [${iteration}/${config.maxIterations}]: Completed "${currentTask.title}"`,
      );
    }
  } else {
    // Track failure
    const failures = (config.consecutiveFailures[currentTask.index] || 0) + 1;
    config.consecutiveFailures[currentTask.index] = failures;

    const note =
      failures >= config.maxFailuresPerTask
        ? `Skipped after ${failures} failures`
        : `Attempt ${failures}/${config.maxFailuresPerTask}`;
    const entry = formatProgressEntry(
      iteration,
      currentTask,
      durationMs,
      false,
      note,
    );
    appendProgress(runId, entry, deps);

    if (failures >= config.maxFailuresPerTask) {
      // Skip this task by marking it complete (with a note)
      const updated = markTaskComplete(content, currentTask.index);
      deps.writeFile(config.taskFilePath, updated);

      await deps.sendMessage(
        config.targetJid,
        `Ralph [${iteration}]: Skipping "${currentTask.title}" after ${failures} failures`,
      );
    }
  }

  // Check termination: re-read the potentially updated task file
  const updatedContent = deps.readFile(config.taskFilePath);
  const updatedTasks = parseTaskFile(updatedContent);
  const nextTask = getNextTask(updatedTasks);

  if (!nextTask) {
    config.status = 'completed';
    writeConfig(config, deps);
    const completed = updatedTasks.filter((t) => t.completed).length;
    await deps.sendMessage(
      config.targetJid,
      `Ralph run ${runId} completed. ${completed}/${updatedTasks.length} tasks done in ${iteration} iterations.`,
    );

    // Send any .md output files to the user
    await sendOutputFiles(config, deps);

    logger.info({ runId, iterations: iteration }, 'Ralph run completed');
    return;
  }

  if (iteration >= config.maxIterations) {
    config.status = 'failed';
    writeConfig(config, deps);
    const completed = updatedTasks.filter((t) => t.completed).length;
    await deps.sendMessage(
      config.targetJid,
      `Ralph run ${runId} hit max iterations (${config.maxIterations}). ${completed}/${updatedTasks.length} tasks done. Run /run-ralph to resume.`,
    );
    logger.warn(
      { runId, maxIterations: config.maxIterations },
      'Ralph run hit max iterations',
    );
    return;
  }

  // Schedule next iteration
  const progressLog = readProgress(runId, deps);
  const prompt = buildIterationPrompt(nextTask, config, progressLog);
  scheduleIteration(config, prompt, deps);
  writeConfig(config, deps);

  logger.info(
    { runId, iteration, nextTask: nextTask.title },
    'Ralph scheduling next iteration',
  );
}

/** Stop a running Ralph loop. */
export function stopRalphRun(runId: string, deps: RalphRunnerDeps): void {
  const config = readConfig(runId, deps);
  config.status = 'paused';
  writeConfig(config, deps);
  logger.info({ runId }, 'Ralph run stopped');
}

/** Get status of a specific run. Returns null if not found. */
export function getRalphRunStatus(
  runId: string,
  deps: RalphRunnerDeps,
): RalphConfig | null {
  const configPath = path.join(getRalphRunDir(runId), 'config.json');
  if (!deps.existsSync(configPath)) return null;
  try {
    return JSON.parse(deps.readFile(configPath));
  } catch {
    return null;
  }
}
