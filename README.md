<p align="center">
  <img src=".github/ghostclaw-mark-512.png" width="120" alt="GhostClaw">
</p>

<h1 align="center"><strong>Ghost</strong>Claw</h1>
<p align="center"><em>your silent co-worker</em></p>

<p align="center">
  <a href="https://ghostclaw.io">Website</a> &nbsp;·&nbsp;
  <a href="#install">Install</a> &nbsp;·&nbsp;
  <a href="#whats-included">Features</a> &nbsp;·&nbsp;
  <a href="https://t.me/+8qJbqxzBQAZkYTNk"><img src="https://img.shields.io/badge/Telegram-Community-26A5E4?logo=telegram&logoColor=white" alt="Telegram Community"></a>
</p>

---

A bare-metal AI agent that runs on your hardware, under your control. Single Node.js process, SQLite for state, Claude as a child process. No containers, no cloud, no orchestration. Telegram, WhatsApp, email, cron. 10 minutes to set up.

## Install

```bash
npm install -g @anthropic-ai/claude-code   # if you haven't already
git clone https://github.com/b1rdmania/ghostclaw.git
cd ghostclaw
npm install
claude
```

Inside Claude Code:

```
/setup-ghostclaw
```

The wizard handles API keys, Telegram bot, personality, background service. About 10 minutes.

**Requirements:** Node.js 20+, Claude Code, macOS or Linux, Claude Max or API key.

## What's included

Everything below ships with every install. No extras to configure.

### Channels

- **Telegram** — DM it like a person. In groups, responds when mentioned. Voice notes supported. This is the primary interface.
- **WhatsApp** — group chat support. Scan QR to connect. Stays quiet until mentioned.

### Core capabilities

- **Web research** — Perplexity-powered search and deep research built in. Ask anything current, it searches and cites sources.
- **Ralph loops** — autonomous multi-task engine. Hand it a checklist, it works through tasks one by one. Leave it overnight, come back to finished work. Outputs editable reports.
- **Scheduled tasks** — "check Hacker News every morning" or cron syntax. Natural language or precise, your call.
- **Per-group personality** — each chat gets its own `CLAUDE.md` defining tone, memory, and rules. Edit the file, personality changes instantly.

### Mission Control

Built-in dashboard at `localhost:3333`. Real-time activity feed, task scheduling, soul editing, research runs with editable output. Send messages as the bot. SSE live updates, zero extra dependencies.

<p align="center">
  <img src=".github/dashboard-preview.png" width="700" alt="Mission Control dashboard">
</p>

### Architecture

```
You (Telegram/WhatsApp) → GhostClaw → Claude (Agent SDK) → Response
```

One process. SQLite state. Claude runs as a direct child process. No containers, no Docker, no Kubernetes. Your bot runs on the host with full system access — that's the point.

## Optional skills

Layer on more capabilities from Claude Code. One command each, security-scanned before install.

| Command | What it adds |
|---------|-------------|
| `/add-gmail-agent` | Gmail read/send — verification codes, urgent flags, summaries |
| `/add-voice-transcription` | Voice note transcription (ElevenLabs Scribe) |
| `/add-voice-reply` | Bot replies with voice notes (ElevenLabs TTS) |
| `/add-heartbeat` | Periodic health checks — disk, logs, services |
| `/add-morning-briefing` | Daily or weekly briefings |
| `/add-slack` | Slack as an additional channel |
| `/add-telegram-swarm` | Multi-bot agent teams in Telegram |
| `/add-update-check` | Weekly check for GhostClaw updates |
| `/debug` | Troubleshooting guide |
| `/update-ghostclaw` | Safe update: backup, pull, migrate, rebuild, restart |

Build your own skills or use compatible ones from the NanoClaw/OpenClaw ecosystem. The skills engine (originally NanoClaw's, forked and extended) handles three-way merging, dependency tracking, and rollback. Every skill is security-scanned before installation.

## Configuration

All config lives in `.env`. The setup wizard creates this.

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Yes* | Claude Max subscription token |
| `ANTHROPIC_API_KEY` | Yes* | Or use an API key instead |
| `ASSISTANT_NAME` | Yes | Bot name (trigger word in groups) |
| `TELEGRAM_BOT_TOKEN` | Yes | From @BotFather |
| `GHOSTCLAW_MODEL` | No | Default: `claude-sonnet-4-6`. Also: `claude-opus-4-6`, `claude-haiku-4-5-20251001` |
| `ELEVENLABS_API_KEY` | No | For voice transcription and replies |
| `ELEVENLABS_VOICE_ID` | No | Voice ID for TTS (elevenlabs.io/voice-library) |
| `TELEGRAM_ONLY` | No | Set `true` to skip WhatsApp |
| `GMAIL_MCP_ENABLED` | No | Set `1` for email integration |

*One of `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` is required.

## Service management

The setup wizard configures this automatically.

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

```
/update-ghostclaw
```

Backs up current state, pulls latest, runs migrations, rebuilds, restarts. Gives you a rollback tag if anything goes wrong.

## FAQ

**What does it cost?**
Your Claude subscription (Max or API) and optionally ElevenLabs for voice. No platform fees.

**Is this secure?**
The bot has full access to its machine. That's the design — run it on dedicated hardware with fresh accounts, not your daily driver. Skills are security-scanned before install.

## Community

Join the [OpenClawOS Telegram group](https://t.me/+8qJbqxzBQAZkYTNk) to share problems, suggestions, or see what others are building.

## Credits

Originally forked from [NanoClaw](https://github.com/qwibitai/nanoclaw) by [qwibitai](https://github.com/qwibitai). Skills engine built on NanoClaw's three-way merge system.

## Licence

MIT
