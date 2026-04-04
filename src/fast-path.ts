/**
 * Fast path — single Claude API call for simple queries.
 *
 * Reads CLAUDE.md + memory files, sends them as system prompt with the user's
 * message. Claude decides whether it can answer directly or needs the full
 * agent stack. No tools, no MCP, no session state.
 *
 * Returns { answer: string } if handled, or { handoff: true } if the full
 * agent should take over.
 */
import fs from 'fs';
import path from 'path';

import Anthropic from '@anthropic-ai/sdk';

import { GROUPS_DIR } from './config.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';

export interface FastPathResult {
  handled: boolean;
  answer?: string;
}

// Patterns that should always go to full agent (memory writes needed)
const MEMORY_TRIGGERS =
  /\b(remember|log this|save this|don't forget|note this|bank this)\b/i;

export function shouldBypassFastPath(message: string): boolean {
  return MEMORY_TRIGGERS.test(message);
}

const FAST_PATH_HANDOFF = '[HANDOFF]';

const ROUTING_SUFFIX = `

---
IMPORTANT ROUTING INSTRUCTION:
You are the fast-path responder. You can answer simple questions, have casual conversation, give opinions, recall information from your memory, and respond to greetings.

If the user's message requires ANY of the following, respond with EXACTLY "${FAST_PATH_HANDOFF}" and nothing else:
- Running commands or scripts
- Reading, writing, or editing files
- Searching the web or fetching URLs
- Sending emails or messages to other services
- Creating, modifying, or checking GitHub repos/PRs
- Scheduled tasks, Ralph loops, or any autonomous work
- Installing skills or packages
- Anything requiring tools, MCP servers, or system access

For everything else — chat, questions, opinions, memory recall, status updates from what you know — answer directly and concisely.`;

function readFileIfExists(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function buildSystemPrompt(groupFolder: string): string {
  const groupDir = path.join(GROUPS_DIR, groupFolder);
  const memoryDir = path.join(groupDir, 'memory');

  const claudeMd = readFileIfExists(path.join(groupDir, 'CLAUDE.md'));
  const identity = readFileIfExists(path.join(memoryDir, 'identity.md'));
  const state = readFileIfExists(path.join(memoryDir, 'state.md'));

  const parts: string[] = [];
  if (claudeMd) parts.push(claudeMd);
  if (identity) parts.push(`# Memory: Identity\n${identity}`);
  if (state) parts.push(`# Memory: State\n${state}`);
  parts.push(ROUTING_SUFFIX);

  return parts.join('\n\n');
}

let client: Anthropic | null = null;

/** Fast path requires a direct API key — OAuth tokens don't work with the raw Anthropic SDK. */
export function isFastPathAvailable(): boolean {
  const secrets = readEnvFile(['ANTHROPIC_API_KEY']);
  return !!secrets.ANTHROPIC_API_KEY;
}

function getClient(): Anthropic {
  if (!client) {
    const secrets = readEnvFile(['ANTHROPIC_API_KEY']);
    if (!secrets.ANTHROPIC_API_KEY) {
      throw new Error(
        'Fast path requires ANTHROPIC_API_KEY — OAuth tokens are not supported',
      );
    }
    client = new Anthropic({ apiKey: secrets.ANTHROPIC_API_KEY });
  }
  return client;
}

export async function tryFastPath(
  message: string,
  groupFolder: string,
): Promise<FastPathResult> {
  const model =
    readEnvFile(['GHOSTCLAW_MODEL']).GHOSTCLAW_MODEL ||
    'claude-sonnet-4-5-20250929';

  const systemPrompt = buildSystemPrompt(groupFolder);

  try {
    const response = await getClient().messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    });

    const text =
      response.content[0]?.type === 'text' ? response.content[0].text : '';

    if (text.trim().startsWith(FAST_PATH_HANDOFF)) {
      logger.info({ groupFolder }, 'Fast path → handoff to full agent');
      return { handled: false };
    }

    logger.info(
      { groupFolder, tokens: response.usage?.output_tokens },
      'Fast path handled message directly',
    );
    return { handled: true, answer: text };
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    logger.warn(
      { err, groupFolder, status },
      'Fast path failed, falling back to full agent',
    );
    return { handled: false };
  }
}
