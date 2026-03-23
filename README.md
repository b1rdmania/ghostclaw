<p align="center">
  <img src=".github/ghostclaw-mark-512.png" width="120" alt="GhostClaw">
</p>

<h1 align="center"><strong>Ghost</strong>Claw</h1>
<p align="center"><em>your silent co-worker</em></p>

<p align="center">
  <a href="https://ghostclaw.io">Website</a> &nbsp;·&nbsp;
  <a href="https://ghostclaw.io/why.html">Why GhostClaw</a> &nbsp;·&nbsp;
  <a href="#get-started">Install</a> &nbsp;·&nbsp;
  <a href="#whats-included">Features</a> &nbsp;·&nbsp;
  <a href="https://t.me/+8qJbqxzBQAZkYTNk"><img src="https://img.shields.io/badge/Telegram-Community-26A5E4?logo=telegram&logoColor=white" alt="Telegram Community"></a>
</p>

---

An AI agent that lives on your computer and works for you. Message it on Telegram like a co-worker. It reads email, does research, runs scheduled tasks, and has full access to its machine. No containers, no cloud, no orchestration. 10 minutes to set up.

## Get started

You need two things: a [Claude](https://claude.ai) account (Max or API keys) and a computer to run it on. Best on a dedicated machine — a Mac Mini, an old laptop, a VPS. You _can_ run it on your daily driver, but GhostClaw runs autonomously, so give it a machine it can own.

### 1. Open Terminal

On Mac: press `Cmd + Space`, type "Terminal", hit enter. That's your command line.

### 2. Install Claude Code

Paste this and hit enter:

```bash
npm install -g @anthropic-ai/claude-code
```

(If you get a "npm not found" error, you need [Node.js](https://nodejs.org) first — download the LTS version, install it, then try again.)

### 3. Clone GhostClaw and let Claude do the rest

```bash
git clone https://github.com/b1rdmania/ghostclaw.git
cd ghostclaw
npm install
claude
```

Once Claude starts, run the setup skill:

```
/setup-ghostclaw
```

This walks you through everything — connecting Telegram, adding your API keys, setting up personality. You just answer questions. About 10 minutes.

**Requirements:** Node.js 20+, macOS or Linux, Claude Max or API keys.

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
| `/pr-babysitter` | Automated PR monitoring — watches CI, review comments, stale PRs; auto-fixes high-confidence issues |
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
| `AGENT_IDLE_TIMEOUT` | No | Minutes before a silent agent is killed (default: 10) |
| `AGENT_ABSOLUTE_TIMEOUT` | No | Hard ceiling in minutes regardless of activity (default: 45) |

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

## Telegram commands

These work in any registered Telegram chat:

| Command | What it does |
|---------|-------------|
| `/reset` | Force-kills a stalled agent and wipes the session. Next message starts with a blank slate. |
| `/status` | Shows active agents, queue depth per group, and uptime. |
| `/skills` | Lists all installed skills with descriptions. |
| `/update` | Pulls latest code, rebuilds, and restarts — no SSH needed. |
| `/ping` | Check if the bot is online. |
| `/chatid` | Show the chat's registration ID. |

`/reset` is the one you'll use most — if the bot seems stuck or unresponsive, type `/reset` and send another message.

## Updating

Send `/update` in Telegram to pull and rebuild automatically. No SSH required.

For a full safe update with backup and rollback tag:

```
/update-ghostclaw
```

**Don't have `/update` yet?** If you're on a version before v0.6.0, update manually:

```bash
cd ghostclaw
git pull origin main
npm install
npm run build
# Then restart your service:
# macOS: launchctl kickstart -k gui/$(id -u)/com.ghostclaw
# Linux: systemctl --user restart ghostclaw
```

After this, `/update` will be available in Telegram for future updates.

## FAQ

**What does it cost?**
Your Claude subscription (Max or API) and optionally ElevenLabs for voice. No platform fees.

**Is this secure?**
The bot has full access to its machine. That's the design — run it on dedicated hardware with fresh accounts, not your daily driver. Skills are security-scanned before install.

## Community

Join the [OpenClawOS Telegram group](https://t.me/+8qJbqxzBQAZkYTNk) to share problems, suggestions, or see what others are building.

## Credits

GhostClaw wouldn't exist without the work of others.

**[NanoClaw](https://github.com/qwibitai/nanoclaw)** by [qwibitai](https://github.com/qwibitai) — the foundation. GhostClaw is a fork of NanoClaw. The core architecture, agent runner, skills engine (three-way merge, manifest system, replay/rebase), and the skill-based extensibility model are all their work. We stripped out containers and built on top, but the bones are theirs.

**[OpenClaw](https://github.com/OpenInterpreter/open-interpreter)** — the inspiration. Heartbeat monitoring, daily briefings, autonomous task loops, the idea of an agent with its own identity and accounts — these came from watching what OpenClaw pioneered. The vision of a personal AI agent that runs wild on its own hardware started there.

**NanoClaw contributors** — [Alakazam03](https://github.com/Alakazam03), [tydev-new](https://github.com/tydev-new), [pottertech](https://github.com/pottertech), [rgarcia](https://github.com/rgarcia), [AmaxGuan](https://github.com/AmaxGuan), [happydog-intj](https://github.com/happydog-intj), [bindoon](https://github.com/bindoon) — whose contributions to NanoClaw's codebase carry forward into GhostClaw.

## Licence

MIT
