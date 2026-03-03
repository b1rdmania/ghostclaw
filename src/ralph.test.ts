import { describe, it, expect } from 'vitest';

import {
  parseTaskFile,
  getNextTask,
  buildIterationPrompt,
  markTaskComplete,
  formatProgressEntry,
  parseRalphPrefix,
  wrapWithPrefix,
  RalphConfig,
} from './ralph.js';

// --- parseTaskFile ---

describe('parseTaskFile', () => {
  it('parses basic unchecked tasks', () => {
    const content = '- [ ] Task one\n- [ ] Task two';
    const tasks = parseTaskFile(content);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({
      index: 0,
      title: 'Task one',
      completed: false,
    });
    expect(tasks[1]).toMatchObject({
      index: 1,
      title: 'Task two',
      completed: false,
    });
  });

  it('parses mixed checked and unchecked', () => {
    const content = '- [x] Done task\n- [ ] Todo task\n- [X] Also done';
    const tasks = parseTaskFile(content);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].completed).toBe(true);
    expect(tasks[1].completed).toBe(false);
    expect(tasks[2].completed).toBe(true);
  });

  it('captures description lines between tasks', () => {
    const content = [
      '- [ ] Add login endpoint',
      '  POST /api/login accepts email and password',
      '  Returns JWT on success',
      '- [ ] Add registration',
    ].join('\n');
    const tasks = parseTaskFile(content);
    expect(tasks[0].description).toBe(
      'POST /api/login accepts email and password\nReturns JWT on success',
    );
    expect(tasks[1].description).toBe('');
  });

  it('ignores headings and prose before first checkbox', () => {
    const content = '# My Project\n\nSome intro text\n\n- [ ] First task';
    const tasks = parseTaskFile(content);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('First task');
  });

  it('returns empty array for empty content', () => {
    expect(parseTaskFile('')).toEqual([]);
  });

  it('returns empty array when no checkboxes', () => {
    const content = '# Just a heading\n\nSome text\n- bullet without checkbox';
    expect(parseTaskFile(content)).toEqual([]);
  });

  it('ignores malformed checkboxes (missing space)', () => {
    const content = '- [] Not valid\n- [ ] Valid task';
    const tasks = parseTaskFile(content);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Valid task');
  });

  it('assigns correct 0-based indices', () => {
    const content = '- [x] A\n- [ ] B\n- [x] C\n- [ ] D';
    const tasks = parseTaskFile(content);
    expect(tasks.map((t) => t.index)).toEqual([0, 1, 2, 3]);
  });

  it('preserves inline formatting in titles', () => {
    const content = '- [ ] **Bold** task with `code`';
    const tasks = parseTaskFile(content);
    expect(tasks[0].title).toBe('**Bold** task with `code`');
  });

  it('captures nested bullets as description', () => {
    const content = [
      '- [ ] Main task',
      '  - Sub-item one',
      '  - Sub-item two',
      '- [ ] Next task',
    ].join('\n');
    const tasks = parseTaskFile(content);
    expect(tasks[0].description).toContain('Sub-item one');
    expect(tasks[0].description).toContain('Sub-item two');
  });
});

// --- getNextTask ---

describe('getNextTask', () => {
  it('returns first unchecked task from mixed list', () => {
    const tasks = parseTaskFile('- [x] Done\n- [ ] Todo\n- [ ] Also todo');
    const next = getNextTask(tasks);
    expect(next).not.toBeNull();
    expect(next!.title).toBe('Todo');
    expect(next!.index).toBe(1);
  });

  it('returns null when all tasks completed', () => {
    const tasks = parseTaskFile('- [x] Done\n- [x] Also done');
    expect(getNextTask(tasks)).toBeNull();
  });

  it('skips completed tasks at the beginning', () => {
    const tasks = parseTaskFile('- [x] A\n- [x] B\n- [ ] C');
    expect(getNextTask(tasks)!.title).toBe('C');
  });

  it('returns null for empty array', () => {
    expect(getNextTask([])).toBeNull();
  });
});

// --- buildIterationPrompt ---

const baseConfig: RalphConfig = {
  runId: 'ralph-test-123',
  taskFilePath: '/tmp/tasks.md',
  workDir: '/home/user/project',
  targetJid: 'tg:123',
  groupFolder: 'main',
  maxIterations: 50,
  maxFailuresPerTask: 3,
  currentIteration: 5,
  consecutiveFailures: {},
  status: 'running',
  startedAt: '2026-03-03T00:00:00.000Z',
  notifyProgress: true,
};

describe('buildIterationPrompt', () => {
  it('includes task title and description', () => {
    const task = {
      index: 0,
      title: 'Add login',
      description: 'POST /api/login',
      completed: false,
    };
    const prompt = buildIterationPrompt(task, baseConfig, '');
    expect(prompt).toContain('Add login');
    expect(prompt).toContain('POST /api/login');
  });

  it('includes working directory', () => {
    const task = { index: 0, title: 'Task', description: '', completed: false };
    const prompt = buildIterationPrompt(task, baseConfig, '');
    expect(prompt).toContain('/home/user/project');
  });

  it('includes progress log when provided', () => {
    const task = { index: 0, title: 'Task', description: '', completed: false };
    const prompt = buildIterationPrompt(
      task,
      baseConfig,
      '[1] OK (10s): Setup DB',
    );
    expect(prompt).toContain('[1] OK (10s): Setup DB');
  });

  it('shows no previous iterations message when progress empty', () => {
    const task = { index: 0, title: 'Task', description: '', completed: false };
    const prompt = buildIterationPrompt(task, baseConfig, '');
    expect(prompt).toContain('No previous iterations.');
  });

  it('includes rules section', () => {
    const task = { index: 0, title: 'Task', description: '', completed: false };
    const prompt = buildIterationPrompt(task, baseConfig, '');
    expect(prompt).toContain('Work ONLY on this task');
    expect(prompt).toContain('Commit your work');
  });
});

// --- markTaskComplete ---

describe('markTaskComplete', () => {
  it('toggles the correct checkbox by index', () => {
    const content = '- [ ] First\n- [ ] Second\n- [ ] Third';
    const result = markTaskComplete(content, 1);
    expect(result).toBe('- [ ] First\n- [x] Second\n- [ ] Third');
  });

  it('preserves other checkboxes unchanged', () => {
    const content = '- [x] Done\n- [ ] Todo\n- [x] Also done';
    const result = markTaskComplete(content, 1);
    expect(result).toContain('- [x] Done');
    expect(result).toContain('- [x] Todo');
    expect(result).toContain('- [x] Also done');
  });

  it('handles last task in list', () => {
    const content = '- [ ] A\n- [ ] B\n- [ ] C';
    const result = markTaskComplete(content, 2);
    expect(result).toBe('- [ ] A\n- [ ] B\n- [x] C');
  });
});

// --- parseRalphPrefix + wrapWithPrefix ---

describe('parseRalphPrefix', () => {
  it('extracts runId and iteration from valid prefix', () => {
    const prompt = '[RALPH:ralph-abc-123:5]\n\nSome prompt';
    const result = parseRalphPrefix(prompt);
    expect(result).toEqual({ runId: 'ralph-abc-123', iteration: 5 });
  });

  it('returns null for non-ralph prompts', () => {
    expect(parseRalphPrefix('Just a normal prompt')).toBeNull();
  });

  it('returns null for malformed prefix', () => {
    expect(parseRalphPrefix('[RALPH:missing-iteration]')).toBeNull();
  });
});

describe('wrapWithPrefix', () => {
  it('round-trips with parseRalphPrefix', () => {
    const wrapped = wrapWithPrefix('ralph-xyz-789', 3, 'Do the thing');
    const parsed = parseRalphPrefix(wrapped);
    expect(parsed).toEqual({ runId: 'ralph-xyz-789', iteration: 3 });
    expect(wrapped).toContain('Do the thing');
  });
});

// --- formatProgressEntry ---

describe('formatProgressEntry', () => {
  it('formats a success entry with all fields', () => {
    const task = {
      index: 0,
      title: 'Add login',
      description: '',
      completed: false,
    };
    const entry = formatProgressEntry(3, task, 15000, true);
    expect(entry).toBe('[3] OK (15s): Add login');
  });

  it('formats a failure entry', () => {
    const task = {
      index: 1,
      title: 'Fix bug',
      description: '',
      completed: false,
    };
    const entry = formatProgressEntry(7, task, 8500, false, 'Tests failed');
    expect(entry).toBe('[7] FAILED (9s): Fix bug — Tests failed');
  });
});
