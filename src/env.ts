import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

/**
 * Parse the .env file and return values for the requested keys.
 * Does NOT load anything into process.env — callers decide what to
 * do with the values. This keeps secrets out of the process environment
 * so they don't leak to child processes.
 */
export function readEnvFile(keys: string[]): Record<string, string> {
  const envFile = path.join(process.cwd(), '.env');
  let content: string;
  try {
    content = fs.readFileSync(envFile, 'utf-8');
  } catch (err) {
    logger.debug({ err }, '.env file not found, using defaults');
    return {};
  }

  const result: Record<string, string> = {};
  const wanted = new Set(keys);

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (!wanted.has(key)) continue;
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) result[key] = value;
  }

  return result;
}

/**
 * Set or replace a key=value line in the `.env` file and mirror the change
 * into `process.env` so running code picks it up without a restart.
 *
 * Silently no-ops on I/O failure — persisting a preference shouldn't bring
 * down the caller. Callers that care should read `.env` back to verify.
 */
export function persistEnvKey(key: string, value: string): void {
  process.env[key] = value;
  const envPath = path.join(process.cwd(), '.env');
  try {
    const existing = fs.existsSync(envPath)
      ? fs.readFileSync(envPath, 'utf-8')
      : '';
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    const updated = pattern.test(existing)
      ? existing.replace(pattern, line)
      : existing.trimEnd() + `\n${line}\n`;
    fs.writeFileSync(envPath, updated);
  } catch (err) {
    logger.warn({ err, key }, 'Failed to persist env key');
  }
}
