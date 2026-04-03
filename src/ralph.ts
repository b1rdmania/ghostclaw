/**
 * Ralph Loop — pure functions for task parsing, progress tracking, and prompt building.
 * Zero side effects. Every function is a pure transformation.
 */

export interface RalphTask {
  index: number;
  title: string;
  description: string;
  completed: boolean;
}

export interface RalphConfig {
  runId: string;
  taskFilePath: string;
  workDir: string;
  targetJid: string;
  groupFolder: string;
  maxIterations: number;
  maxFailuresPerTask: number;
  currentIteration: number;
  consecutiveFailures: Record<number, number>;
  status: 'running' | 'paused' | 'completed' | 'failed';
  startedAt: string;
  notifyProgress: boolean;
}

const CHECKBOX_RE = /^\s*- \[([ xX])\] (.+)$/;
const PREFIX_RE = /^\[RALPH:([^:]+):(\d+)\]/;

/**
 * Parse a markdown task file into structured tasks.
 * Recognises `- [ ] Title` and `- [x] Title` checkboxes.
 * Lines between checkboxes (that aren't headings) become the description.
 */
export function parseTaskFile(content: string): RalphTask[] {
  const lines = content.split('\n');
  const tasks: RalphTask[] = [];
  let current: RalphTask | null = null;

  for (const line of lines) {
    const match = line.match(CHECKBOX_RE);
    if (match) {
      if (current) tasks.push(current);
      current = {
        index: current ? current.index + 1 : 0,
        title: match[2].trim(),
        description: '',
        completed: match[1].toLowerCase() === 'x',
      };
    } else if (current) {
      // Headings break the description
      if (/^#{1,6}\s/.test(line.trim())) {
        // Don't append headings to description
      } else {
        const trimmed = line.trim();
        if (trimmed) {
          current.description = current.description
            ? `${current.description}\n${trimmed}`
            : trimmed;
        }
      }
    }
  }
  if (current) tasks.push(current);

  // Fix indices (they were computed incrementally above)
  tasks.forEach((t, i) => {
    t.index = i;
  });

  return tasks;
}

/** Find the next unchecked task. Returns null if all done. */
export function getNextTask(tasks: RalphTask[]): RalphTask | null {
  return tasks.find((t) => !t.completed) || null;
}

/** Build the single-task prompt for one Ralph iteration. */
export function buildIterationPrompt(
  task: RalphTask,
  config: RalphConfig,
  progressLog: string,
): string {
  const desc = task.description
    ? `\n\n## Acceptance Criteria\n${task.description}`
    : '';

  const progress = progressLog.trim()
    ? `\n\n## Previous Progress\n${progressLog.trim()}`
    : '\n\n## Previous Progress\nNo previous iterations.';

  return `## Your Task
${task.title}${desc}

## Working Directory
${config.workDir}

## Rules
1. Work ONLY on this task. Do not start other tasks.
2. Commit your work with a clear message when done.
3. Run tests to verify your changes.
4. If you cannot complete this task, explain why clearly in your response.
5. DECOMPOSE FIRST: Before executing, estimate scope. If this task could take more than 20 minutes, break it into subtasks with clear bounded outputs (e.g. "research X and write findings to Y file" not "research everything about X"). Write the subtasks as a checklist, then work through them one at a time.
6. NARRATE PROGRESS: During long operations, send a brief progress update via send_message every 2-3 minutes. Even "Checking source 3 of 6..." is enough. Never go silent for more than 3 minutes — silence triggers the idle timeout and kills your process.${progress}`;
}

/**
 * Mark a specific checkbox as complete in the raw markdown.
 * Identifies the checkbox by its 0-based index among all checkboxes.
 */
export function markTaskComplete(content: string, taskIndex: number): string {
  const lines = content.split('\n');
  let checkboxCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(CHECKBOX_RE);
    if (match) {
      if (checkboxCount === taskIndex) {
        lines[i] = lines[i].replace('- [ ]', '- [x]');
        break;
      }
      checkboxCount++;
    }
  }

  return lines.join('\n');
}

/** Format a progress log entry. */
export function formatProgressEntry(
  iteration: number,
  task: RalphTask,
  durationMs: number,
  success: boolean,
  note?: string,
): string {
  const status = success ? 'OK' : 'FAILED';
  const dur = Math.round(durationMs / 1000);
  const noteStr = note ? ` — ${note}` : '';
  return `[${iteration}] ${status} (${dur}s): ${task.title}${noteStr}`;
}

/**
 * Extract runId and iteration from a prompt that starts with [RALPH:runId:iteration].
 * Returns null if the prompt doesn't have a ralph prefix.
 */
export function parseRalphPrefix(
  prompt: string,
): { runId: string; iteration: number } | null {
  const match = prompt.match(PREFIX_RE);
  if (!match) return null;
  return { runId: match[1], iteration: parseInt(match[2], 10) };
}

/** Prepend the ralph prefix to a prompt. */
export function wrapWithPrefix(
  runId: string,
  iteration: number,
  prompt: string,
): string {
  return `[RALPH:${runId}:${iteration}]\n\n${prompt}`;
}
