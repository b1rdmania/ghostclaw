# GhostClaw

Your own AI assistant with its own phone. Runs on a dedicated machine, talks to you on Telegram and WhatsApp, transcribes voice notes, schedules tasks, and learns how you communicate.

No cloud hosting. No Docker. No monthly platform fees. Just Node.js, SQLite, and a Claude subscription.

## What can it do?

- **Its own Telegram identity** — your bot gets a real Telegram account. Message it like a person, no slash commands.
- **WhatsApp group chats** — add it to group chats. It only responds when mentioned.
- **Voice notes** — send voice messages, it transcribes and responds as text.
- **Scheduled tasks** — "remind me every Friday at 3pm" or "check my email every morning at 8am".
- **Per-group personality** — each chat gets its own tone, memory, and rules. Casual in the group chat, direct in your DM.
- **Email access** — optionally reads and sends email (Gmail, Outlook, or any IMAP provider).
- **Health monitoring** — periodic checks on your services, disk space, logs. Silent unless something's wrong.

## Quick start

```bash
git clone https://github.com/ziggythebot/ghostclaw.git
cd ghostclaw
npm install
```

Then open [Claude Code](https://claude.ai/download) and run:

```
/setup-ghostclaw
```

It walks you through everything: authentication, Telegram bot creation, personality setup, and getting the service running. Takes about 10 minutes.

## How it works

```
You (Telegram/WhatsApp) --> GhostClaw --> Claude --> Response
```

One Node.js process. Messages stored in SQLite. Claude runs as a child process via the Agent SDK. No containers, no orchestration, no external services beyond Claude and (optionally) OpenAI for voice.

## The soul system

Each chat group has a `CLAUDE.md` file that defines how the bot behaves. Your main channel might say "be direct, no emoji, have opinions." A group chat with friends might say "be casual and funny, only chime in when mentioned."

The setup wizard builds your soul automatically, or you can write it by hand. The bot reads it fresh every time — edit the file, personality changes instantly.

## Add-ons

After setup, you can add optional features by running these in Claude Code:

| Command | What it adds |
|---------|-------------|
| `/add-heartbeat` | Periodic health checks (disk, logs, services) |
| `/add-morning-briefing` | Daily or weekly briefings |
| `/add-gmail-agent` | Email read/send (Gmail, Outlook, or IMAP) |
| `/add-update-check` | Weekly check for GhostClaw updates |
| `/add-voice` | Voice note transcription (needs OpenAI key) |
| `/add-slack` | Slack as an additional channel |
| `/add-telegram-swarm` | Multi-bot agent teams |

## Requirements

- A dedicated machine (Mac or Linux — a Mac Mini works great)
- Node.js 20+
- [Claude Code](https://claude.ai/download) with a Claude Max subscription or API key
- A Telegram bot token (free, from @BotFather)

## Configuration

All config lives in `.env`. The setup wizard creates this for you.

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Yes* | Claude Max subscription token |
| `ANTHROPIC_API_KEY` | Yes* | Or use an API key instead |
| `ASSISTANT_NAME` | Yes | Bot name (trigger word in groups) |
| `TELEGRAM_BOT_TOKEN` | Yes | From @BotFather |
| `GHOSTCLAW_MODEL` | No | Default: `claude-sonnet-4-6`. Options: `claude-opus-4-6`, `claude-haiku-4-5-20251001` |
| `OPENAI_API_KEY` | No | For voice transcription |
| `TELEGRAM_ONLY` | No | Set `true` to skip WhatsApp |
| `GMAIL_MCP_ENABLED` | No | Set `1` for email integration |

*One of `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` is required.

## Running as a service

The setup wizard configures this automatically. For manual control:

**macOS:**
```bash
launchctl load ~/Library/LaunchAgents/com.ghostclaw.plist
launchctl unload ~/Library/LaunchAgents/com.ghostclaw.plist
launchctl kickstart -k gui/$(id -u)/com.ghostclaw  # restart
```

**Linux:**
```bash
systemctl --user start ghostclaw
systemctl --user restart ghostclaw
```

## Updating

```bash
git pull
npm run build
launchctl kickstart -k gui/$(id -u)/com.ghostclaw  # macOS
# systemctl --user restart ghostclaw                # Linux
```

## FAQ

**What does it cost to run?**

Just your Claude subscription (Max or API). Voice transcription uses OpenAI's Whisper API (~$0.006/minute). Email integration is free. No platform fees.

**Is this secure?**

The bot has full access to whatever machine it runs on. That's by design — run it on a dedicated machine, not your daily driver. Skills are security-scanned before installation.

**Can I use models other than Claude?**

Set `GHOSTCLAW_MODEL` in `.env`. Sonnet is the default (fast and cheap). Opus for maximum capability. Haiku for speed.

**What's the relationship to NanoClaw?**

GhostClaw is a fork of [NanoClaw](https://github.com/qwibitai/nanoclaw) with containers removed. NanoClaw skills work without modification. You'll see some `NANOCLAW_*` references in the code — that's intentional for compatibility.

## Credits

Fork of [NanoClaw](https://github.com/qwibitai/nanoclaw) by [qwibitai](https://github.com/qwibitai).

## Licence

MIT
