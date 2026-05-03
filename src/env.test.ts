import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { persistEnvKey, readEnvFile } from './env.js';

describe('persistEnvKey', () => {
  let tmpDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostclaw-env-'));
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('writes a new key to a missing .env', () => {
    persistEnvKey('FOO', 'bar');
    expect(fs.readFileSync('.env', 'utf-8')).toMatch(/^FOO=bar$/m);
    expect(process.env.FOO).toBe('bar');
  });

  it('appends when the key is not yet in .env', () => {
    fs.writeFileSync('.env', 'EXISTING=value\n');
    persistEnvKey('NEW', '42');
    const content = fs.readFileSync('.env', 'utf-8');
    expect(content).toMatch(/^EXISTING=value$/m);
    expect(content).toMatch(/^NEW=42$/m);
  });

  it('replaces an existing key in place', () => {
    fs.writeFileSync('.env', 'KEY=old\nOTHER=kept\n');
    persistEnvKey('KEY', 'new');
    const content = fs.readFileSync('.env', 'utf-8');
    expect(content).toMatch(/^KEY=new$/m);
    expect(content).not.toMatch(/^KEY=old$/m);
    expect(content).toMatch(/^OTHER=kept$/m);
  });

  it('updates process.env even if .env write fails', () => {
    const spy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('disk full');
    });
    persistEnvKey('RUNTIME_ONLY', 'yes');
    expect(process.env.RUNTIME_ONLY).toBe('yes');
    spy.mockRestore();
  });

  it('round-trips cleanly with readEnvFile', () => {
    persistEnvKey('ROUND_TRIP', 'abc123');
    // readEnvFile reads from disk, not process.env — exercises the full cycle.
    const read = readEnvFile(['ROUND_TRIP']);
    expect(read.ROUND_TRIP).toBe('abc123');
  });
});
