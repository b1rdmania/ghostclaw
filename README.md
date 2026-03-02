# GhostClaw

Personal AI assistant that runs bare metal on a dedicated machine. Fork of [NanoClaw](https://github.com/qwibitai/nanoclaw) with containers removed.

Your bot gets its own Telegram identity, transcribes voice notes, runs scheduled tasks, and learns how you like to communicate. No Docker, no microservices — just a Node.js process and SQLite.

## Quick start

```bash
git clone https://github.com/ziggythebot/ghostclaw.git
cd ghostclaw
npm install
```

Then open Claude Code and run `/setup-ghostclaw`. It handles authentication, channels, service setup, and personality building.

Or manually:

```bash
# 1. Configure .env (copy from .env.example)
cp .env.example .env
# Edit .env — add your Claude token, bot name, and Telegram token

# 2. Build and run
npm run build
npm run dev
```

## What it does

- **Telegram + WhatsApp** — bot gets its own Telegram identity (no trigger needed in DMs). WhatsApp for group chats. Run both or just one.
- **Voice transcription** — voice notes transcribed via OpenAI Whisper and delivered as text.
- **Scheduled tasks** — "remind me every Friday at 3pm" or "check my email every morning at 8am". Cron, interval, or one-shot.
- **Soul system** — `groups/main/CLAUDE.md` defines personality, communication style, banned patterns. Read fresh every invocation.
- **Group isolation** — each chat group gets its own folder, memory, and personality. Main channel has admin privileges.
- **Security scanning** — skills are automatically scanned for suspicious patterns before installation.
- **Heartbeat monitoring** — periodic health checks that stay silent unless something needs attention.

## Architecture

```
Telegram / WhatsApp --> SQLite --> Polling loop --> Node.js child process (Claude Agent SDK) --> Response
```

Single process. Agents run directly on the host. IPC via filesystem. No containers, no orchestration.

### Key files

| File | What it does |
|------|-------------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/telegram.ts` | Telegram bot via Grammy |
| `src/channels/whatsapp.ts` | WhatsApp via Baileys |
| `src/container-runner.ts` | Spawns agent as Node.js child process |
| `src/transcription.ts` | Voice transcription via Whisper |
| `src/task-scheduler.ts` | Cron and one-shot scheduled tasks |
| `src/db.ts` | SQLite (messages, groups, sessions, state) |
| `groups/*/CLAUDE.md` | Per-group memory and personality |
| `skills-engine/` | Skill apply, merge, and security scanning |

## Soul

The soul lives in `groups/main/CLAUDE.md`. It tells the agent how to think, talk, and work with you specifically.

**Generate yours automatically:** paste the prompt from [soul-prompt.md](.claude/skills/setup-ghostclaw/soul-prompt.md) into Claude or ChatGPT on your main computer. It already knows you — it'll write the soul file from what it knows.

Or write it manually. Define:
- Communication style (direct, verbose, technical, casual)
- Banned patterns (no emoji, no filler, no marketing speak)
- User context (businesses, preferences, key people)
- Decision style (act vs ask, opinions vs options)

Keep it under 80 lines. Put facts in separate memory files.

## Channels

| Channel | Status | Trigger needed? |
|---------|--------|----------------|
| Telegram DM | Built in | No |
| Telegram group | Built in | Yes — `@BotName` |
| WhatsApp group | Built in | Yes — `@AssistantName` |

Set `TELEGRAM_ONLY=true` in `.env` to skip WhatsApp entirely.

## Skills

GhostClaw uses NanoClaw's skill system. Skills are scanned for security issues before installation.

### Built in

| Feature | Description |
|---------|-------------|
| Telegram | Bot channel with own identity |
| WhatsApp | Group chat support |
| Voice transcription | Whisper-powered, both channels |

### Optional (run in Claude Code)

| Skill | What it adds |
|-------|-------------|
| `/add-heartbeat` | Periodic health checks (disk, logs, email) |
| `/add-morning-briefing` | Scheduled daily/weekly briefings |
| `/add-gmail-agent` | Email read/send via MCP (Gmail, Outlook, or any IMAP) |
| `/add-update-check` | Weekly check for GhostClaw updates |
| `/add-slack` | Slack as additional channel |
| `/add-discord` | Discord as additional channel |
| `/add-telegram-swarm` | Multi-bot agent teams in Telegram |

### Email integration

Email is optional — not core functionality. But it's fun to have the bot read verification codes, check for urgent messages, or send summaries. Gmail is the easiest setup (OAuth MCP server), but any email provider with IMAP or an MCP server works. See `/add-gmail-agent` for details.

### Security scanning

Skills are automatically scanned before installation. The scanner checks for:
- Command injection (`exec` with interpolation)
- Remote code execution (`curl | sh`)
- Credential exfiltration
- Writes to sensitive paths
- Dangerous post-apply commands

Critical findings block installation. Run manually:
```bash
npx tsx scripts/scan-skill.ts --all
```

## Scheduled tasks

Tell the bot in natural language:

```
Every weekday at 8am, check Hacker News for AI news and send me a summary
Remind me to review PRs every Friday at 3pm
Run a health check every 30 minutes
```

Tasks support cron expressions, intervals, and one-shot scheduling.

## Running as a service

### macOS (launchd)

```bash
# /setup-ghostclaw creates this automatically
launchctl load ~/Library/LaunchAgents/com.ghostclaw.plist
launchctl unload ~/Library/LaunchAgents/com.ghostclaw.plist
launchctl kickstart -k gui/$(id -u)/com.ghostclaw  # restart
```

### Linux (systemd)

```bash
systemctl --user start ghostclaw
systemctl --user stop ghostclaw
systemctl --user restart ghostclaw
```

## Configuration

All config lives in `.env`. See `.env.example` for all options.

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Yes* | Claude Max subscription token |
| `ANTHROPIC_API_KEY` | Yes* | Or use API key instead |
| `ASSISTANT_NAME` | Yes | Bot name (trigger word in groups) |
| `TELEGRAM_BOT_TOKEN` | Recommended | From @BotFather |
| `TELEGRAM_ONLY` | No | Set `true` to skip WhatsApp |
| `OPENAI_API_KEY` | No | For voice transcription |
| `GMAIL_MCP_ENABLED` | No | Set `1` for Gmail integration |

*One of `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` is required.

## Updating

GhostClaw checks for updates weekly (if you've run `/add-update-check`). It notifies but never auto-updates.

To update manually:
```bash
git fetch origin
git log HEAD..origin/main --oneline  # review what changed
git diff HEAD..origin/main           # review the code
git merge origin/main
npm run build
launchctl kickstart -k gui/$(id -u)/com.ghostclaw  # restart
```

## Pulling from upstream NanoClaw

GhostClaw is a fork. To pull NanoClaw improvements:

```bash
git remote add upstream https://github.com/qwibitai/nanoclaw.git  # once
git fetch upstream
git merge upstream/main
```

Watch for conflicts in `src/container-runner.ts` and `src/index.ts`.

## Requirements

- macOS or Linux
- Node.js 20+
- [Claude Code](https://claude.ai/download)
- No Docker required

## FAQ

**Why not just use NanoClaw?**

NanoClaw runs agents in Docker containers. If your machine is dedicated to the bot, containers add latency and complexity for zero security benefit. GhostClaw strips that out.

**Is this less secure?**

Yes. Agents have full host access. That's the point — don't run this on a machine with data the agent shouldn't see.

**Can I use other models?**

Set `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` in `.env` for any Anthropic-compatible endpoint.

**Why do I see `NANOCLAW_*` in the code?**

GhostClaw keeps NanoClaw's internal variable names (`NANOCLAW_GROUP_DIR`, `.nanoclaw/` state directory) so that skills from the NanoClaw ecosystem work without modification. User-facing names are all GhostClaw.

**How do I build my own skills?**

See the [NanoClaw skills architecture docs](docs/nanoclaw-architecture-final.md). GhostClaw skills follow the same format — `manifest.yaml` + `add/` + `modify/` directories.

## Credits

Fork of [NanoClaw](https://github.com/qwibitai/nanoclaw) by [qwibitai](https://github.com/qwibitai). Core architecture, skills engine, and agent runner are their work.

## Licence

MIT
