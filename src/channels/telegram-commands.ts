/**
 * Slash-command handlers for the Telegram channel.
 *
 * Each command is a small function; `registerCommands` wires them all into
 * a Grammy `Bot` instance. Commands live here (not in telegram.ts) so the
 * channel class stays focused on connection management and the message loop.
 */
import { Bot, CommandContext, Context } from 'grammy';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { ASSISTANT_NAME, getDailyBudgetUsd } from '../config.js';
import { getTodaySpendBySource, getTodayUsageSummary } from '../db.js';
import { persistEnvKey } from '../env.js';
import { logger } from '../logger.js';
import { escapeXml } from '../router.js';
import { RegisteredGroup } from '../types.js';

export interface CommandDeps {
  registeredGroups: () => Record<string, RegisteredGroup>;
  onSessionReset?: (chatJid: string) => boolean;
  onReset?: (chatJid: string) => Promise<string>;
  onGetStatus?: () => string;
}

const AVAILABLE_MODELS = [
  {
    alias: 'sonnet',
    id: 'claude-sonnet-4-6',
    desc: 'Fast + capable (default)',
  },
  { alias: 'opus', id: 'claude-opus-4-7', desc: 'Most capable, slower' },
  { alias: 'haiku', id: 'claude-haiku-4-5', desc: 'Fastest, cheapest' },
];

/** Require the chat to be registered before running a handler. Replies with
 *  a standard "not registered" message otherwise. */
function requireRegistered(
  ctx: CommandContext<Context>,
  deps: CommandDeps,
): RegisteredGroup | null {
  const chatJid = `tg:${ctx.chat.id}`;
  const group = deps.registeredGroups()[chatJid];
  if (!group) {
    ctx.reply('Not a registered chat.');
    return null;
  }
  return group;
}

export function registerCommands(bot: Bot, deps: CommandDeps): void {
  bot.command('chatid', (ctx) => {
    const chatType = ctx.chat.type;
    const chatName =
      chatType === 'private'
        ? ctx.from?.first_name || 'Private'
        : (ctx.chat as { title?: string }).title || 'Unknown';
    ctx.reply(
      `Chat ID: \`tg:${ctx.chat.id}\`\nName: ${chatName}\nType: ${chatType}`,
      { parse_mode: 'Markdown' },
    );
  });

  bot.command('ping', (ctx) => {
    ctx.reply(`${ASSISTANT_NAME} is online.`);
  });

  // Full reset: kill agents, clear tasks, wipe sessions, restart.
  bot.command('reset', async (ctx) => {
    if (!requireRegistered(ctx, deps)) return;
    const chatJid = `tg:${ctx.chat.id}`;
    await ctx.reply('Reset in progress...');
    try {
      const report = await deps.onReset?.(chatJid);
      await ctx.reply(report || 'Reset complete.');
      await ctx.reply('Restarting — back in a moment.');
      setTimeout(() => process.exit(0), 500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.reply(`Reset failed: ${msg.slice(0, 500)}`);
    }
  });

  // Pull latest code, rebuild, restart.
  bot.command('update', async (ctx) => {
    if (!requireRegistered(ctx, deps)) return;
    await ctx.reply('Pulling latest code...');
    const cwd = process.cwd();
    try {
      execSync('git fetch origin', { cwd, encoding: 'utf-8' });
      const rebaseOut = execSync('git rebase origin/main', {
        cwd,
        encoding: 'utf-8',
      });
      await ctx.reply(`Updated: ${rebaseOut.trim()}`);

      await ctx.reply('Building...');
      execSync('npm run build', { cwd, encoding: 'utf-8', timeout: 120_000 });

      await ctx.reply('Done. Restarting — back in a moment.');
      setTimeout(() => process.exit(0), 500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.reply(`Update failed:\n${msg.slice(0, 500)}`);
      logger.error({ err }, '/update command failed');
    }
  });

  bot.command('model', async (ctx) => {
    if (!requireRegistered(ctx, deps)) return;
    const chatJid = `tg:${ctx.chat.id}`;
    const arg = ctx.match?.trim().toLowerCase();
    const currentId = process.env.GHOSTCLAW_MODEL || AVAILABLE_MODELS[0].id;
    const currentModel = AVAILABLE_MODELS.find(
      (m) => m.id === currentId || m.alias === currentId,
    );
    const currentLabel = currentModel?.alias || currentId;

    if (!arg) {
      const lines = AVAILABLE_MODELS.map((m) => {
        const active =
          m.id === currentId || m.alias === currentId ? ' ← current' : '';
        return `• <code>/model ${m.alias}</code> — ${m.desc}${active}`;
      });
      await ctx.reply(
        `<b>Model: ${escapeXml(currentLabel)}</b>\n\n${lines.join('\n')}`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    const match = AVAILABLE_MODELS.find((m) => m.alias === arg);
    if (!match) {
      await ctx.reply(
        `Unknown model "${escapeXml(arg)}". Use: ${AVAILABLE_MODELS.map((m) => m.alias).join(', ')}`,
      );
      return;
    }

    persistEnvKey('GHOSTCLAW_MODEL', match.id);
    // Reset the session so the new model takes effect immediately
    deps.onSessionReset?.(chatJid);
    await ctx.reply(
      `Model switched to <b>${escapeXml(match.alias)}</b>. Session reset — next message uses the new model.`,
      { parse_mode: 'HTML' },
    );
  });

  bot.command('budget', async (ctx) => {
    if (!requireRegistered(ctx, deps)) return;
    const arg = ctx.match?.trim();

    if (arg) {
      const parts = arg.split(/\s+/);
      const sub = parts[0].toLowerCase();

      if (sub === 'off') {
        persistEnvKey('GHOSTCLAW_DAILY_BUDGET_USD', '0');
        await ctx.reply('Budget cap disabled. No limit on daily spend.');
        return;
      }

      if (sub === 'set' && parts[1]) {
        const val = parseFloat(parts[1]);
        if (!Number.isFinite(val) || val <= 0) {
          await ctx.reply(
            `Invalid amount "${escapeXml(parts[1])}". Example: <code>/budget set 10</code>`,
            { parse_mode: 'HTML' },
          );
          return;
        }
        persistEnvKey('GHOSTCLAW_DAILY_BUDGET_USD', String(val));
        await ctx.reply(
          `Budget cap set to <b>$${val.toFixed(2)}</b>/day. Resets at UTC midnight.`,
          { parse_mode: 'HTML' },
        );
        return;
      }

      await ctx.reply(
        [
          'Usage:',
          "<code>/budget</code> — show today's spend",
          '<code>/budget set 10</code> — cap at $10/day',
          '<code>/budget off</code> — disable cap',
        ].join('\n'),
        { parse_mode: 'HTML' },
      );
      return;
    }

    const cap = getDailyBudgetUsd();
    const summary = getTodayUsageSummary();
    const sources = getTodaySpendBySource();

    const lines: string[] = ['<b>Budget today</b>'];
    if (cap > 0) {
      const pct = (summary.today_usd / cap) * 100;
      const remaining = Math.max(0, cap - summary.today_usd);
      lines.push(
        `$${summary.today_usd.toFixed(2)} of $${cap.toFixed(2)} (${pct.toFixed(0)}%)`,
      );
      lines.push(`$${remaining.toFixed(2)} remaining`);
    } else {
      lines.push(
        `$${summary.today_usd.toFixed(2)} spent (no cap — <code>/budget set N</code> to set one)`,
      );
    }

    if (sources.length > 0) {
      lines.push('', '<b>Activity</b>');
      for (const s of sources) {
        const label =
          s.source === 'agent'
            ? 'Full agent'
            : s.source === 'fast-path'
              ? 'Fast-path'
              : s.source;
        const turns = `${s.events} turn${s.events === 1 ? '' : 's'}`;
        lines.push(`• ${label}: ${turns}, $${s.cost_usd.toFixed(3)}`);
      }
    }

    lines.push('', '<b>Tokens today</b>');
    lines.push(
      `• Input: ${summary.today_input_tokens.toLocaleString()}`,
      `• Output: ${summary.today_output_tokens.toLocaleString()}`,
    );
    if (summary.today_cache_read_tokens > 0) {
      lines.push(
        `• Cache read: ${summary.today_cache_read_tokens.toLocaleString()}`,
      );
    }

    if (cap > 0) {
      lines.push(
        '',
        '<code>/budget set N</code> to change, <code>/budget off</code> to disable',
      );
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('status', (ctx) => {
    if (!requireRegistered(ctx, deps)) return;
    const text = deps.onGetStatus?.() ?? 'Status unavailable.';
    ctx.reply(text, { parse_mode: 'HTML' });
  });

  bot.command('skills', async (ctx) => {
    if (!requireRegistered(ctx, deps)) return;
    const skillsDir = path.join(process.cwd(), '.claude', 'skills');
    if (!fs.existsSync(skillsDir)) {
      await ctx.reply('No skills directory found.');
      return;
    }
    const lines: string[] = ['<b>Installed skills:</b>'];
    const dirs = fs.readdirSync(skillsDir).sort();
    for (const dir of dirs) {
      const stat = fs.statSync(path.join(skillsDir, dir));
      if (!stat.isDirectory()) continue;
      const skillMd = path.join(skillsDir, dir, 'SKILL.md');
      if (!fs.existsSync(skillMd)) continue;
      const content = fs.readFileSync(skillMd, 'utf-8');
      const descMatch = content.match(/^description:\s*(.+)$/m);
      const desc = descMatch ? descMatch[1].trim() : '';
      const safeName = escapeXml(dir);
      const safeDesc = desc ? escapeXml(desc.slice(0, 80)) : '';
      lines.push(
        `• <code>/${safeName}</code>${safeDesc ? ` — ${safeDesc}` : ''}`,
      );
    }
    const text = lines.length > 1 ? lines.join('\n') : 'No skills installed.';
    const MAX = 4096;
    if (text.length <= MAX) {
      await ctx.reply(text, { parse_mode: 'HTML' });
      return;
    }
    let chunk = '';
    for (const line of lines) {
      if (chunk.length + line.length + 1 > MAX) {
        await ctx.reply(chunk, { parse_mode: 'HTML' });
        chunk = line;
      } else {
        chunk = chunk ? `${chunk}\n${line}` : line;
      }
    }
    if (chunk) await ctx.reply(chunk, { parse_mode: 'HTML' });
  });
}
