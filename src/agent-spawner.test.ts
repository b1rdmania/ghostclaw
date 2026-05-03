import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

// Sentinel markers must match agent-spawner.ts
const OUTPUT_START_MARKER = '---GHOSTCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---GHOSTCLAW_OUTPUT_END---';

// Mock config
vi.mock('./config.js', () => ({
  MAX_AGENT_OUTPUT_SIZE: 10485760,
  DATA_DIR: '/tmp/ghostclaw-test-data',
  GROUPS_DIR: '/tmp/ghostclaw-test-groups',
  IDLE_TIMEOUT: 1800000, // 30min
  AGENT_IDLE_TIMEOUT: 5000, // 5s in tests
  AGENT_ABSOLUTE_TIMEOUT: 10000, // 10s in tests
  TIMEZONE: 'America/Los_Angeles',
}));

// Mock logger
vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(() => false),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn(() => ''),
      readdirSync: vi.fn(() => []),
      statSync: vi.fn(() => ({ isDirectory: () => false })),
      copyFileSync: vi.fn(),
    },
  };
});

// Create a controllable fake ChildProcess
function createFakeProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
    pid: number;
  };
  proc.stdin = new PassThrough();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.kill = vi.fn();
  proc.pid = 12345;
  return proc;
}

let fakeProc: ReturnType<typeof createFakeProcess>;

// Mock child_process.spawn
vi.mock('child_process', async () => {
  const actual =
    await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    spawn: vi.fn(() => fakeProc),
    execSync: vi.fn(() => ''),
    exec: vi.fn(
      (_cmd: string, _opts: unknown, cb?: (err: Error | null) => void) => {
        if (cb) cb(null);
        return new EventEmitter();
      },
    ),
  };
});

import { spawnAgentProcess, AgentOutput } from './agent-spawner.js';
import type { RegisteredGroup } from './types.js';

const testGroup: RegisteredGroup = {
  name: 'Test Group',
  folder: 'test-group',
  trigger: '@Andy',
  added_at: new Date().toISOString(),
};

const testInput = {
  prompt: 'Hello',
  groupFolder: 'test-group',
  chatJid: 'test@g.us',
  isMain: false,
};

function emitOutputMarker(
  proc: ReturnType<typeof createFakeProcess>,
  output: AgentOutput,
) {
  const json = JSON.stringify(output);
  proc.stdout.push(`${OUTPUT_START_MARKER}\n${json}\n${OUTPUT_END_MARKER}\n`);
}

describe('agent-spawner timeout behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeProc = createFakeProcess();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('absolute timeout after output resolves as error', async () => {
    const onOutput = vi.fn(async () => {});
    const resultPromise = spawnAgentProcess(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    // Emit output with a result (also resets idle timer via stdout data)
    emitOutputMarker(fakeProc, {
      status: 'success',
      result: 'Here is my response',
      newSessionId: 'session-123',
    });

    // Let output processing settle
    await vi.advanceTimersByTimeAsync(10);

    // Fire the absolute ceiling (AGENT_ABSOLUTE_TIMEOUT = 10000ms in tests)
    await vi.advanceTimersByTimeAsync(10000);

    // Emit close event (as if process was stopped by the timeout)
    fakeProc.emit('close', 137);

    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    // Timeout always resolves as error — index.ts outputSentToUser guard prevents cursor rollback
    expect(result.status).toBe('error');
    expect(result.error).toContain('timed out');
    expect(onOutput).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'Here is my response' }),
    );
  });

  it('idle timeout with no stdout resolves as error', async () => {
    const onOutput = vi.fn(async () => {});
    const resultPromise = spawnAgentProcess(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    // No stdout at all — fire the idle timeout (AGENT_IDLE_TIMEOUT = 5000ms in tests)
    await vi.advanceTimersByTimeAsync(5000);

    fakeProc.emit('close', 137);
    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('error');
    expect(result.error).toContain('timed out');
    expect(onOutput).not.toHaveBeenCalled();
  });

  it('stdout activity resets idle timer', async () => {
    const onOutput = vi.fn(async () => {});
    const resultPromise = spawnAgentProcess(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    // Emit raw stdout at 4s — just before idle timeout (5s in tests)
    await vi.advanceTimersByTimeAsync(4000);
    fakeProc.stdout.push('thinking...\n');

    // Idle timer should have reset — advance another 4s (total 8s, but idle only 4s since last stdout)
    await vi.advanceTimersByTimeAsync(4000);

    // Agent hasn't timed out yet — now emit proper output and close normally
    emitOutputMarker(fakeProc, { status: 'success', result: 'Done' });
    await vi.advanceTimersByTimeAsync(10);
    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('success');
  });

  it('normal exit after output resolves as success', async () => {
    const onOutput = vi.fn(async () => {});
    const resultPromise = spawnAgentProcess(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    // Emit output
    emitOutputMarker(fakeProc, {
      status: 'success',
      result: 'Done',
      newSessionId: 'session-456',
    });

    await vi.advanceTimersByTimeAsync(10);

    // Normal exit (no timeout)
    fakeProc.emit('close', 0);

    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('success');
    expect(result.newSessionId).toBe('session-456');
  });
});
