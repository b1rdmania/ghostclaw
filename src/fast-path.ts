/**
 * Fast path — single Claude API call for simple queries.
 *
 * Reads CLAUDE.md + memory files, sends them as system prompt with the user's
 * message. Claude decides whether it can answer directly or needs the full
 * agent stack. No tools, no MCP, no session state.
 */
import fs from 'fs';
import path from 'path';

import Anthropic from '@anthropic-ai/sdk';

import { GROUPS_DIR } from './config.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';

export interface FastPathUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cost_usd?: number;
  model?: string;
}

export interface FastPathResult {
  handled: boolean;
  answer?: string;
  usage?: FastPathUsage;
}

/** Claude 4.x list prices — used to estimate fast-path cost for budget tracking. */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-opus-4-5': { input: 15.0, output: 75.0 },
  'claude-opus-4-7': { input: 15.0, output: 75.0 },
};

function estimateCostUsd(
  model: string,
  usage: { input_tokens: number; output_tokens: number },
): number | undefined {
  const key = Object.keys(MODEL_PRICING).find((k) => model.startsWith(k));
  if (!key) return undefined;
  const p = MODEL_PRICING[key];
  return (usage.input_tokens * p.input + usage.output_tokens * p.output) / 1e6;
}

// Patterns that should always go to full agent (memory writes needed)
const MEMORY_TRIGGERS =
  /\b(remember|log (this|that)|save (this|that)|don'?t forget|note (this|that)|bank this|file this|write (this )?down|store (this|that)|keep in mind|for future reference|make a note|take a note)\b/i;

export function shouldBypassFastPath(message: string): boolean {
  return MEMORY_TRIGGERS.test(message);
}

const FAST_PATH_HANDOFF = '[HANDOFF]';

/**
 * Leading system directive — placed BEFORE memory context so its rules
 * dominate. CLAUDE.md is intentionally excluded from the context (it's
 * written for the tool-using agent); the prompt below is the full contract
 * the fast-path model sees.
 */
const ROUTING_PREFIX = `You are the fast-path triage responder for a personal AI assistant. You have no tools. You cannot read files, run commands, search the web, send messages, or modify anything.

Your contract with the user:

1. Reply with ONLY your final answer. No preamble. No "Let me check...". No narration. The user sees every word you emit.

2. The context below includes the assistant's current identity and state. If the user's question can be answered from what's visible there, answer it directly in one or two sentences.

3. If the message requires ANY of these, reply with exactly "${FAST_PATH_HANDOFF}" and nothing else:
   - Setting up or configuring anything (MCP servers, integrations, API keys, env vars, etc.)
   - Storing, saving, or persisting anything (including API keys the user just shared)
   - Running commands, reading/writing/editing files
   - Searching the web, fetching URLs, running research
   - Sending emails/messages to other services
   - GitHub, PRs, commits, any version control
   - Scheduled tasks, Ralph, autonomous work
   - Installing or applying skills

4. When in doubt, reply "${FAST_PATH_HANDOFF}". A handoff is cheap; a wrong direct answer is not.

--- CONTEXT BELOW (read-only, for reference only) ---`;

const ROUTING_SUFFIX = `
--- END OF CONTEXT ---

Reply now. Either a short direct answer from the context above, or "${FAST_PATH_HANDOFF}" if any tool or action is needed.`;

function readFileIfExists(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function buildSystemPrompt(groupFolder: string): string {
  const memoryDir = path.join(GROUPS_DIR, groupFolder, 'memory');
  const identity = readFileIfExists(path.join(memoryDir, 'identity.md'));
  const state = readFileIfExists(path.join(memoryDir, 'state.md'));

  // CLAUDE.md is intentionally NOT included: it's written for the full
  // tool-using agent and tells the reader to "use the Read tool before
  // responding". Haiku has no tools — injecting that directive makes it
  // hallucinate tool calls and leak reasoning preamble.
  const parts: string[] = [ROUTING_PREFIX];
  if (identity) parts.push(`# Identity\n${identity}`);
  if (state) parts.push(`# State\n${state}`);
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
  // Fast-path uses its own model env var so that /model switching
  // (GHOSTCLAW_MODEL) on the main agent doesn't bleed Opus calls through the
  // cheap triage path. Default is Sonnet — Haiku struggled with the [HANDOFF]
  // contract and leaked preamble. Sonnet costs ~3x but is still ~25–100x
  // cheaper than spawning the full agent (no tools, no MCP, no CLAUDE.md).
  const model =
    readEnvFile(['GHOSTCLAW_FAST_PATH_MODEL']).GHOSTCLAW_FAST_PATH_MODEL ||
    'claude-sonnet-4-6';

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

    const usage: FastPathUsage = {
      input_tokens: response.usage?.input_tokens || 0,
      output_tokens: response.usage?.output_tokens || 0,
      cache_creation_input_tokens:
        response.usage?.cache_creation_input_tokens ?? undefined,
      cache_read_input_tokens:
        response.usage?.cache_read_input_tokens ?? undefined,
      model,
    };
    usage.cost_usd = estimateCostUsd(model, usage);

    // Handoff if the marker appears ANYWHERE in the response — not just at
    // the start. Haiku sometimes writes preamble like "The user is asking X
    // [HANDOFF]"; treating that as a direct answer sends the preamble to the
    // user. Safer to hand off on any sighting of the marker.
    if (text.includes(FAST_PATH_HANDOFF)) {
      logger.info(
        { groupFolder, cost: usage.cost_usd },
        'Fast path → handoff to full agent',
      );
      return { handled: false, usage };
    }

    logger.info(
      {
        groupFolder,
        tokens: response.usage?.output_tokens,
        cost: usage.cost_usd,
      },
      'Fast path handled message directly',
    );
    return { handled: true, answer: text, usage };
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    logger.warn(
      { err, groupFolder, status },
      'Fast path failed, falling back to full agent',
    );
    return { handled: false };
  }
}
