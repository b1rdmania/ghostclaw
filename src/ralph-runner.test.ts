import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  startRalphRun,
  onIterationComplete,
  stopRalphRun,
  getRalphRunStatus,
  RalphRunnerDeps,
} from './ralph-runner.js';

// In-memory filesystem + mock deps
function createMockDeps(
  files: Record<string, string> = {},
): RalphRunnerDeps & { files: Record<string, string> } {
  const store = { ...files };
  return {
    files: store,
    createTask: vi.fn(),
    sendMessage: vi.fn(async () => {}),
    readFile: vi.fn((p: string) => {
      if (!(p in store)) throw new Error(`File not found: ${p}`);
      return store[p];
    }),
    writeFile: vi.fn((p: string, c: string) => {
      store[p] = c;
    }),
    mkdirSync: vi.fn(),
    existsSync: vi.fn((p: string) => p in store),
    now: vi.fn(() => '2026-03-03T12:00:00.000Z'),
  };
}

const TASK_FILE = '/tmp/tasks.md';
const SIMPLE_TASKS = '- [ ] Task one\n- [ ] Task two\n- [ ] Task three';

// --- startRalphRun ---

describe('startRalphRun', () => {
  it('creates config dir and writes config.json', async () => {
    const deps = createMockDeps({ [TASK_FILE]: SIMPLE_TASKS });
    const runId = await startRalphRun(
      {
        taskFilePath: TASK_FILE,
        workDir: '/tmp',
        targetJid: 'tg:123',
        groupFolder: 'main',
      },
      deps,
    );

    expect(runId).toMatch(/^ralph-/);
    expect(deps.mkdirSync).toHaveBeenCalled();

    // Config was written
    const configKey = Object.keys(deps.files).find((k) =>
      k.endsWith('config.json'),
    );
    expect(configKey).toBeDefined();
    const config = JSON.parse(deps.files[configKey!]);
    expect(config.status).toBe('running');
    expect(config.currentIteration).toBe(0);
    expect(config.taskFilePath).toBe(TASK_FILE);
  });

  it('schedules first iteration with correct prefix', async () => {
    const deps = createMockDeps({ [TASK_FILE]: SIMPLE_TASKS });
    const runId = await startRalphRun(
      {
        taskFilePath: TASK_FILE,
        workDir: '/tmp',
        targetJid: 'tg:123',
        groupFolder: 'main',
      },
      deps,
    );

    expect(deps.createTask).toHaveBeenCalledOnce();
    const taskArg = (deps.createTask as any).mock.calls[0][0];
    expect(taskArg.prompt).toContain(`[RALPH:${runId}:1]`);
    expect(taskArg.prompt).toContain('Task one');
    expect(taskArg.schedule_type).toBe('once');
    expect(taskArg.context_mode).toBe('isolated');
  });

  it('throws if task file has no unchecked tasks', async () => {
    const deps = createMockDeps({ [TASK_FILE]: '- [x] Done\n- [x] Also done' });
    await expect(
      startRalphRun(
        {
          taskFilePath: TASK_FILE,
          workDir: '/tmp',
          targetJid: 'tg:123',
          groupFolder: 'main',
        },
        deps,
      ),
    ).rejects.toThrow('No unchecked tasks');
  });

  it('throws if task file is empty', async () => {
    const deps = createMockDeps({ [TASK_FILE]: '' });
    await expect(
      startRalphRun(
        {
          taskFilePath: TASK_FILE,
          workDir: '/tmp',
          targetJid: 'tg:123',
          groupFolder: 'main',
        },
        deps,
      ),
    ).rejects.toThrow('No unchecked tasks');
  });

  it('uses correct defaults for maxIterations and maxFailuresPerTask', async () => {
    const deps = createMockDeps({ [TASK_FILE]: SIMPLE_TASKS });
    const runId = await startRalphRun(
      {
        taskFilePath: TASK_FILE,
        workDir: '/tmp',
        targetJid: 'tg:123',
        groupFolder: 'main',
      },
      deps,
    );
    const configKey = Object.keys(deps.files).find((k) =>
      k.endsWith('config.json'),
    )!;
    const config = JSON.parse(deps.files[configKey]);
    expect(config.maxIterations).toBe(10);
    expect(config.maxFailuresPerTask).toBe(3);
  });
});

// --- onIterationComplete (success) ---

describe('onIterationComplete — success', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let runId: string;

  beforeEach(async () => {
    deps = createMockDeps({ [TASK_FILE]: SIMPLE_TASKS });
    runId = await startRalphRun(
      {
        taskFilePath: TASK_FILE,
        workDir: '/tmp',
        targetJid: 'tg:123',
        groupFolder: 'main',
      },
      deps,
    );
    // Reset mocks after startRalphRun
    (deps.createTask as any).mockClear();
    (deps.sendMessage as any).mockClear();
  });

  it('marks the current task as complete in the file', async () => {
    await onIterationComplete(runId, 1, 'Done!', true, 5000, deps);
    expect(deps.files[TASK_FILE]).toContain('- [x] Task one');
    expect(deps.files[TASK_FILE]).toContain('- [ ] Task two');
  });

  it('schedules next iteration', async () => {
    await onIterationComplete(runId, 1, 'Done!', true, 5000, deps);
    expect(deps.createTask).toHaveBeenCalledOnce();
    const taskArg = (deps.createTask as any).mock.calls[0][0];
    expect(taskArg.prompt).toContain('Task two');
  });

  it('sends progress notification', async () => {
    await onIterationComplete(runId, 1, 'Done!', true, 5000, deps);
    expect(deps.sendMessage).toHaveBeenCalledWith(
      'tg:123',
      expect.stringContaining('Completed "Task one"'),
    );
  });

  it('increments currentIteration in config', async () => {
    await onIterationComplete(runId, 1, 'Done!', true, 5000, deps);
    const configKey = Object.keys(deps.files).find((k) =>
      k.endsWith('config.json'),
    )!;
    const config = JSON.parse(deps.files[configKey]);
    expect(config.currentIteration).toBe(1);
  });
});

// --- onIterationComplete (failure) ---

describe('onIterationComplete — failure', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let runId: string;

  beforeEach(async () => {
    deps = createMockDeps({ [TASK_FILE]: SIMPLE_TASKS });
    runId = await startRalphRun(
      {
        taskFilePath: TASK_FILE,
        workDir: '/tmp',
        targetJid: 'tg:123',
        groupFolder: 'main',
        maxFailuresPerTask: 2,
      },
      deps,
    );
    (deps.createTask as any).mockClear();
    (deps.sendMessage as any).mockClear();
  });

  it('increments consecutiveFailures and retries', async () => {
    await onIterationComplete(runId, 1, 'Error', false, 3000, deps);
    // Task NOT marked complete — still unchecked
    expect(deps.files[TASK_FILE]).toContain('- [ ] Task one');
    // But next iteration is scheduled (retry)
    expect(deps.createTask).toHaveBeenCalledOnce();
    const taskArg = (deps.createTask as any).mock.calls[0][0];
    expect(taskArg.prompt).toContain('Task one'); // same task, retrying
  });

  it('skips task after maxFailuresPerTask consecutive failures', async () => {
    // Fail twice (maxFailuresPerTask = 2)
    await onIterationComplete(runId, 1, 'Error', false, 3000, deps);
    (deps.createTask as any).mockClear();
    (deps.sendMessage as any).mockClear();

    await onIterationComplete(runId, 2, 'Error again', false, 3000, deps);

    // Task one marked as complete (skipped)
    expect(deps.files[TASK_FILE]).toContain('- [x] Task one');
    // Skip message sent
    expect(deps.sendMessage).toHaveBeenCalledWith(
      'tg:123',
      expect.stringContaining('Skipping "Task one"'),
    );
    // Next iteration scheduled for Task two
    expect(deps.createTask).toHaveBeenCalledOnce();
    const taskArg = (deps.createTask as any).mock.calls[0][0];
    expect(taskArg.prompt).toContain('Task two');
  });
});

// --- onIterationComplete (termination) ---

describe('onIterationComplete — termination', () => {
  it('completes when all tasks done', async () => {
    const taskContent = '- [ ] Only task';
    const deps = createMockDeps({ [TASK_FILE]: taskContent });
    const runId = await startRalphRun(
      {
        taskFilePath: TASK_FILE,
        workDir: '/tmp',
        targetJid: 'tg:123',
        groupFolder: 'main',
      },
      deps,
    );
    (deps.createTask as any).mockClear();
    (deps.sendMessage as any).mockClear();

    await onIterationComplete(runId, 1, 'Done!', true, 5000, deps);

    // No more iterations scheduled
    expect(deps.createTask).not.toHaveBeenCalled();
    // Completion message sent
    expect(deps.sendMessage).toHaveBeenCalledWith(
      'tg:123',
      expect.stringContaining('completed'),
    );
    // Config status updated
    const configKey = Object.keys(deps.files).find((k) =>
      k.endsWith('config.json'),
    )!;
    const config = JSON.parse(deps.files[configKey]);
    expect(config.status).toBe('completed');
  });

  it('fails when max iterations reached', async () => {
    const deps = createMockDeps({ [TASK_FILE]: SIMPLE_TASKS });
    const runId = await startRalphRun(
      {
        taskFilePath: TASK_FILE,
        workDir: '/tmp',
        targetJid: 'tg:123',
        groupFolder: 'main',
        maxIterations: 1,
      },
      deps,
    );
    (deps.createTask as any).mockClear();
    (deps.sendMessage as any).mockClear();

    // Complete first task at iteration 1 (which equals maxIterations)
    await onIterationComplete(runId, 1, 'Done!', true, 5000, deps);

    // No more iterations (hit limit)
    expect(deps.createTask).not.toHaveBeenCalled();
    // Status is 'failed' due to max iterations
    const configKey = Object.keys(deps.files).find((k) =>
      k.endsWith('config.json'),
    )!;
    const config = JSON.parse(deps.files[configKey]);
    expect(config.status).toBe('failed');
  });
});

// --- stopRalphRun ---

describe('stopRalphRun', () => {
  it('sets config status to paused', async () => {
    const deps = createMockDeps({ [TASK_FILE]: SIMPLE_TASKS });
    const runId = await startRalphRun(
      {
        taskFilePath: TASK_FILE,
        workDir: '/tmp',
        targetJid: 'tg:123',
        groupFolder: 'main',
      },
      deps,
    );

    stopRalphRun(runId, deps);

    const configKey = Object.keys(deps.files).find((k) =>
      k.endsWith('config.json'),
    )!;
    const config = JSON.parse(deps.files[configKey]);
    expect(config.status).toBe('paused');
  });

  it('stops further iterations after pause', async () => {
    const deps = createMockDeps({ [TASK_FILE]: SIMPLE_TASKS });
    const runId = await startRalphRun(
      {
        taskFilePath: TASK_FILE,
        workDir: '/tmp',
        targetJid: 'tg:123',
        groupFolder: 'main',
      },
      deps,
    );
    (deps.createTask as any).mockClear();

    stopRalphRun(runId, deps);

    // Iteration completes after pause — should not schedule next
    await onIterationComplete(runId, 1, 'Done!', true, 5000, deps);
    expect(deps.createTask).not.toHaveBeenCalled();
  });
});

// --- getRalphRunStatus ---

describe('getRalphRunStatus', () => {
  it('returns config for existing run', async () => {
    const deps = createMockDeps({ [TASK_FILE]: SIMPLE_TASKS });
    const runId = await startRalphRun(
      {
        taskFilePath: TASK_FILE,
        workDir: '/tmp',
        targetJid: 'tg:123',
        groupFolder: 'main',
      },
      deps,
    );

    const status = getRalphRunStatus(runId, deps);
    expect(status).not.toBeNull();
    expect(status!.runId).toBe(runId);
    expect(status!.status).toBe('running');
  });

  it('returns null for nonexistent run', () => {
    const deps = createMockDeps({});
    expect(getRalphRunStatus('ralph-nonexistent', deps)).toBeNull();
  });
});
