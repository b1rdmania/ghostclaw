<p align="center">
  <img src=".github/ghostclaw-mark-512.png" width="120" alt="GhostClaw">
</p>

<h1 align="center"><strong>Ghost</strong>Claw</h1>
<p align="center"><em>your silent co-worker</em></p>

<p align="center">
  <a href="https://ghostclaw.io">Website</a> &nbsp;·&nbsp;
  <a href="#install">Install</a> &nbsp;·&nbsp;
  <a href="#what-it-does">Features</a>
</p>

---

An AI agent that lives on its own computer, has its own accounts, and works as your always-on co-worker.

You interact with it like a person — voice notes on Telegram, mentions in WhatsApp groups, or just texting. It knows how you like to communicate, reads your email, monitors your services, and runs tasks on a schedule. And you customise everything through Claude Code, exactly the way you already work.

## Why this exists

**OpenClaw** is beautiful. Watching your agent talk to other agents, self-iterate, install things, and work stuff out for itself is genuinely mind-bending. But it's 500,000 lines of code, the setup is an approximation of the Claude Code terminal that doesn't quite work, and making changes that don't break everything is non-trivial. It's like driving a classic car — charming when it works, but you're fixing it more than driving it.

**NanoClaw** is elegant. 400 lines of core code, completely customisable, works out of the box. But it runs in containers, which is great for security on a shared machine — less great if you want your agent to actually *do things* across your system.

**GhostClaw** is the middle ground. NanoClaw's simplicity and skill system, with the freedom and functionality of OpenClaw. No containers — your agent runs bare metal on a dedicated machine with full access to everything. Add skills the same way you add capabilities in Claude Code. Compatible with both NanoClaw and OpenClaw skill ecosystems.

If you're already an advanced Claude Code user and want an agent that runs wild on its own hardware, this is for you.

## What it does

- **Its own Telegram identity** — message it like a person. No slash commands, no trigger needed in DMs.
- **WhatsApp group chats** — add it to any group. Responds when mentioned, stays quiet otherwise.
- **Voice notes** — send voice messages, it transcribes and responds. Both channels.
- **Scheduled tasks** — "check Hacker News every morning" or "remind me to review PRs every Friday at 3pm". Natural language, cron, or intervals.
- **Per-group personality** — each chat gets its own tone, memory, and rules. Direct in your DM, casual in the group chat.
- **Email** — reads and sends email. Picks up verification codes, flags urgent messages, sends summaries. Gmail, Outlook, or any IMAP.
- **Health monitoring** — heartbeat checks on disk space, services, logs. Daily briefings. Silent unless something needs attention.
- **Layer any Claude Code skill onto your bot** — anything you can do in Claude Code, you can add to your agent. NanoClaw skills, OpenClaw skills, or your own. Every install is automatically security-scanned.
- **Fully modifiable from Claude Code** — every behaviour, every personality file, every integration. Customise exactly the way you already work.

## Install

On the machine you want your agent to live on, open a terminal and install [Claude Code](https://claude.ai/download) if you haven't already:

```bash
npm install -g @anthropic-ai/claude-code
```

Then:

```bash
git clone https://github.com/b1rdmania/ghostclaw.git
cd ghostclaw
npm install
claude
```

Inside Claude Code, type:

```
/setup-ghostclaw
```

That's it. The wizard handles everything — API keys, Telegram bot, personality, background service. About 10 minutes.

## Adding skills

Once running, add capabilities by typing commands in Claude Code:

| Command | What it adds |
|---------|-------------|
| `/add-heartbeat` | Periodic health checks (disk, logs, services) |
| `/add-morning-briefing` | Daily or weekly briefings |
| `/add-gmail-agent` | Email read/send (Gmail, Outlook, or IMAP) |
| `/add-update-check` | Weekly check for GhostClaw updates |
| `/add-voice` | Voice note transcription |
| `/add-voice-reply` | Bot replies with voice notes (ElevenLabs) |
| `/add-slack` | Slack as an additional channel |
| `/add-telegram-swarm` | Multi-bot agent teams |
| `/update-ghostclaw` | Safe update: backup, pull, migrate, rebuild, restart |

Skills are security-scanned before installation. Build your own or pull from the NanoClaw/OpenClaw ecosystem — they're compatible.

## The soul system

Each chat has a `CLAUDE.md` that defines the bot's personality for that context. Your main channel might say:

> Be direct. No emoji. Have opinions. Don't say "there are several approaches" — say "this is the move, here's why."

A group chat with friends might say:

> Be casual and funny. Only respond when mentioned. Keep it short.

Edit the file, the personality changes instantly. The setup wizard builds your initial soul automatically.

## How it works

```
You (Telegram/WhatsApp) --> GhostClaw --> Claude (Agent SDK) --> Response
```

One Node.js process. SQLite for state. Claude runs as a child process. No containers, no orchestration, no cloud infrastructure. Your bot runs directly on the host with full system access — that's the point.

## Configuration

All config lives in `.env`. The setup wizard creates this for you.

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Yes* | Claude Max subscription token |
| `ANTHROPIC_API_KEY` | Yes* | Or use an API key instead |
| `ASSISTANT_NAME` | Yes | Bot name (trigger word in groups) |
| `TELEGRAM_BOT_TOKEN` | Yes | From @BotFather |
| `GHOSTCLAW_MODEL` | No | Default: `claude-sonnet-4-6`. Also: `claude-opus-4-6`, `claude-haiku-4-5-20251001` |
| `OPENAI_API_KEY` | No | For voice transcription |
| `TELEGRAM_ONLY` | No | Set `true` to skip WhatsApp |
| `GMAIL_MCP_ENABLED` | No | Set `1` for email integration |

*One of `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` is required.

## Service management

The setup wizard configures this automatically. For manual control:

**macOS:**
```bash
launchctl load ~/Library/LaunchAgents/com.ghostclaw.plist     # start
launchctl unload ~/Library/LaunchAgents/com.ghostclaw.plist   # stop
launchctl kickstart -k gui/$(id -u)/com.ghostclaw             # restart
```

**Linux:**
```bash
systemctl --user start ghostclaw
systemctl --user restart ghostclaw
```

## Updating

Inside Claude Code:

```
/update-ghostclaw
```

That's it. It backs up your current state, pulls the latest, runs migrations, rebuilds, and restarts the service. If anything goes wrong, it gives you a rollback tag.

Manual alternative:
```bash
git pull && npm install && npm run build
launchctl kickstart -k gui/$(id -u)/com.ghostclaw  # macOS
# systemctl --user restart ghostclaw                # Linux
```

## FAQ

**What does it cost?**

Your Claude subscription (Max or API) and optionally OpenAI for voice (~$0.006/minute). No platform fees.

**Is this secure?**

The bot has full access to its machine. That's the point — run it on dedicated hardware with fresh accounts, not your daily driver. Skills are security-scanned before installation.

**What's the relationship to NanoClaw and OpenClaw?**

GhostClaw is a fork of [NanoClaw](https://github.com/qwibitai/nanoclaw) with containers removed and OpenClaw-inspired features added (heartbeat, briefings, email, monitoring). NanoClaw skills work without modification. Think of it as NanoClaw's simplicity with OpenClaw's ambition.

## Credits

Fork of [NanoClaw](https://github.com/qwibitai/nanoclaw) by [qwibitai](https://github.com/qwibitai). Core architecture, skills engine, and agent runner are their work.

## Licence

MIT
