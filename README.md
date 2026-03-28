<p align="center">
  <img src=".github/ghostclaw-mark-512.png" width="120" alt="GhostClaw">
</p>

<h1 align="center"><strong>Ghost</strong>Claw</h1>
<p align="center"><em>give it a machine. let it roam.</em></p>

<p align="center">
  <img src="https://img.shields.io/github/stars/b1rdmania/ghostclaw?style=flat-square&logo=github" alt="Stars">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/node-%3E%3D20-green?style=flat-square" alt="Node">
  <img src="https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <a href="https://t.me/+8qJbqxzBQAZkYTNk"><img src="https://img.shields.io/badge/Telegram-Community-26A5E4?style=flat-square&logo=telegram&logoColor=white" alt="Community"></a>
</p>

<p align="center">
  <a href="https://ghostclaw.io">Website</a> &nbsp;·&nbsp;
  <a href="#why-ghostclaw">Why GhostClaw</a> &nbsp;·&nbsp;
  <a href="#get-started">Install</a> &nbsp;·&nbsp;
  <a href="https://ghostclaw.io/skills.html">Skills</a> &nbsp;·&nbsp;
  <a href="https://github.com/b1rdmania/ghostclaw-skills">Skill Repo</a>
</p>

---

The OpenClaw alternative that actually works. A bare-metal fork of [NanoClaw](https://github.com/qwibitai/nanoclaw) — containers stripped, full system access, Telegram-first. Give your spare computer its own accounts and let an AI agent run wild. 10 minutes to set up.

## Why GhostClaw?

| | GhostClaw | OpenClaw | NanoClaw |
|---|---|---|---|
| **Setup** | 10 min | 30+ min | 15 min |
| **Codebase** | ~4K LOC | ~500K LOC | ~700 LOC |
| **System access** | Full (bare metal) | Full | Sandboxed (Docker) |
| **Messaging** | Telegram-first | 50+ channels | Telegram, WhatsApp, Slack |
| **Containers** | None | Required | Required |
| **Best for** | Solo devs, tinkerers, personal agents | Teams, enterprises | Security-first setups |

**NanoClaw's simplicity. OpenClaw's freedom. None of the mess.**

GhostClaw started as a NanoClaw fork with one question: what if you ripped out everything that makes self-hosting painful? No Docker, no container orchestration, no config maze. Agents run as direct Node.js child processes with full machine access — bash, files, web, email. That's the point.

## Get started

You need a [Claude](https://claude.ai) account (Max or API keys) and a computer to run it on. Best on a dedicated machine — a Mac Mini, an old laptop, a VPS.

```bash
npm install -g @anthropic-ai/claude-code
git clone https://github.com/b1rdmania/ghostclaw.git
cd ghostclaw && npm install
claude
# then type: /setup-ghostclaw
```

The setup skill walks you through everything — Telegram bot, API keys, personality, service management. About 10 minutes.

**Requirements:** Node.js 20+, macOS or Linux, Claude Max or API keys.

## What's included

Everything below ships with every install.

### Channels

- **Telegram** — DM it like a person. In groups, responds when mentioned. Voice notes supported. This is the primary interface.

### Core capabilities

- **Full machine access** — bash, files, web search, email. No sandbox, no permission prompts.
- **Web research** — Perplexity-powered search and deep research. Ask anything current, it searches and cites sources.
- **Ralph loops** — autonomous multi-task engine. Hand it a checklist, it works through tasks one by one overnight.
- **Scheduled tasks** — "check Hacker News every morning" or cron syntax. Natural language or precise.
- **Per-group personality** — each chat gets its own `CLAUDE.md` defining tone, memory, and rules.
- **Model selection** — switch between Sonnet, Opus, Haiku from Telegram. Just type `/model`.

### Mission Control

Built-in dashboard at `localhost:3333`. Real-time activity feed, task scheduling, soul editing, research runs.

<p align="center">
  <img src=".github/dashboard-preview.png" width="700" alt="Mission Control dashboard">
</p>

### Architecture

```
You (Telegram) → GhostClaw → Claude (Agent SDK) → Response
```

One process. SQLite state. Claude runs as a direct child process. No containers, no Docker, no Kubernetes. Full system access — that's the point.

## Optional skills

Add capabilities with a command. Each skill is a markdown file — security-scanned before install.

| Command | What it adds |
|---------|-------------|
| `/add-gmail-agent` | Gmail read/send — verification codes, urgent flags, summaries |
| `/add-voice-transcription` | Voice note transcription (ElevenLabs Scribe) |
| `/add-voice-reply` | Bot replies with voice notes (ElevenLabs TTS) |
| `/add-heartbeat` | Periodic health checks — disk, logs, services |
| `/add-morning-briefing` | Daily or weekly briefings |
| `/add-slack` | Slack as an additional channel |
| `/add-telegram-swarm` | Multi-bot agent teams in Telegram |
| `/pr-babysitter` | Automated PR monitoring — CI fixes, review resolution |
| `/run-ralph` | Autonomous overnight task loop |
| `/update-ghostclaw` | Safe update: backup, pull, migrate, rebuild, restart |

**[Browse all 46 skills →](https://github.com/b1rdmania/ghostclaw-skills)** including marketing, SEO, design, and community-built skills.

Build your own — skills are markdown files. Ask Claude to write one or create it yourself.

## Telegram commands

| Command | What it does |
|---------|-------------|
| `/reset` | Kill stalled agent, wipe session. Next message starts fresh. |
| `/status` | Active agents, queue depth, uptime. |
| `/model` | View or switch AI model (sonnet, opus, haiku). |
| `/skills` | List installed skills. |
| `/update` | Pull latest code, rebuild, restart — no SSH needed. |
| `/ping` | Check if the bot is online. |

## Updating

Send `/update` in Telegram. No SSH required.

For a full safe update with backup and rollback tag:

```
/update-ghostclaw
```

**On a version before v0.6.0?** Update manually:

```bash
cd ghostclaw
git pull origin main
npm install
npm run build
# macOS: launchctl kickstart -k gui/$(id -u)/com.ghostclaw
# Linux: systemctl --user restart ghostclaw
```

## Configuration

All config lives in `.env`. The setup wizard creates this.

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Yes* | Claude Max subscription token |
| `ANTHROPIC_API_KEY` | Yes* | Or use an API key instead |
| `ASSISTANT_NAME` | Yes | Bot name (trigger word in groups) |
| `TELEGRAM_BOT_TOKEN` | Yes | From @BotFather |
| `GHOSTCLAW_MODEL` | No | Default: sonnet. Also: opus, haiku |
| `ELEVENLABS_API_KEY` | No | For voice transcription and replies |
| `TELEGRAM_ONLY` | No | Set `true` to skip WhatsApp |
| `GMAIL_MCP_ENABLED` | No | Set `1` for email integration |

*One of `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` is required.

## FAQ

**What does it cost?**
Your Claude subscription (Max or API) and optionally ElevenLabs for voice. No platform fees.

**Is this secure?**
The bot has full access to its machine. That's the design — run it on dedicated hardware with fresh accounts, not your daily driver. Skills are security-scanned before install.

**Can I run it on a Raspberry Pi?**
Untested but should work on any Linux ARM/x64 box with Node.js 20+.

## Community

Join the [GhostClaw community on Telegram](https://t.me/+8qJbqxzBQAZkYTNk) to share problems, suggestions, or see what others are building.

## Credits

GhostClaw wouldn't exist without the work of others.

**[NanoClaw](https://github.com/qwibitai/nanoclaw)** by [qwibitai](https://github.com/qwibitai) — the foundation. GhostClaw is a fork of NanoClaw. The core architecture, agent runner, skills engine (three-way merge, manifest system, replay/rebase), and the skill-based extensibility model are all their work. We stripped out containers and built on top, but the bones are theirs.

**[OpenClaw](https://github.com/OpenInterpreter/open-interpreter)** — the inspiration. Heartbeat monitoring, daily briefings, autonomous task loops, the idea of an agent with its own identity and accounts — these came from watching what OpenClaw pioneered.

**NanoClaw contributors** — [Alakazam03](https://github.com/Alakazam03), [tydev-new](https://github.com/tydev-new), [pottertech](https://github.com/pottertech), [rgarcia](https://github.com/rgarcia), [AmaxGuan](https://github.com/AmaxGuan), [happydog-intj](https://github.com/happydog-intj), [bindoon](https://github.com/bindoon) — whose contributions to NanoClaw's codebase carry forward into GhostClaw.

## Licence

MIT
