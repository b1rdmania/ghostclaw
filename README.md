# GhostClaw

Personal AI assistant that runs bare metal. Fork of [NanoClaw](https://github.com/qwibitai/nanoclaw) with containers ripped out.

## What's different

NanoClaw runs agents in Docker containers for isolation. GhostClaw runs them as direct Node.js child processes on the host. If you're running on a dedicated machine (Mac Mini, Raspberry Pi, spare laptop), you don't need the overhead.

**Core changes from NanoClaw:**

- **No containers.** Agents spawn as `node` processes with environment variables for paths. No Docker, no Apple Container, no mount security.
- **Telegram-first.** Bot gets its own identity. No trigger word needed in DMs. WhatsApp runs alongside for group chats.
- **Voice transcription.** Voice notes on both Telegram and WhatsApp are transcribed via OpenAI Whisper and delivered as text.
- **Soul system.** `groups/main/CLAUDE.md` defines how the agent thinks, talks, and works — not just what it can do.

## Quick start

```bash
git clone https://github.com/ziggythebot/ghostclaw.git
cd ghostclaw
npm install
claude
```

Then run `/setup`. Claude Code handles WhatsApp auth, Telegram bot setup, service configuration.

Or do it manually:

```bash
# 1. Get a Claude Code OAuth token
claude setup-token

# 2. Configure .env
cat > .env << 'EOF'
CLAUDE_CODE_OAUTH_TOKEN=your-token
ASSISTANT_NAME=YourBotName
TELEGRAM_BOT_TOKEN=your-telegram-bot-token  # optional
OPENAI_API_KEY=your-openai-key              # optional, for voice
EOF

# 3. Build and run
npm run build
npm run dev
```

## Architecture

```
Telegram / WhatsApp --> SQLite --> Polling loop --> Node.js child process (Claude Agent SDK) --> Response
```

Single process. Agents run directly on the host with isolated filesystems per group. IPC via filesystem. No microservices, no containers, no orchestration.

### Key files

| File | What it does |
|------|-------------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/telegram.ts` | Telegram bot via Grammy |
| `src/channels/whatsapp.ts` | WhatsApp via Baileys |
| `src/container-runner.ts` | Spawns agent as Node.js child process |
| `src/transcription.ts` | Voice note transcription via Whisper |
| `src/task-scheduler.ts` | Cron and one-shot scheduled tasks |
| `src/db.ts` | SQLite (messages, groups, sessions, state) |
| `groups/*/CLAUDE.md` | Per-group memory and personality |

## Channels

| Channel | Status | Trigger needed? |
|---------|--------|----------------|
| Telegram DM | Built in | No — all messages processed |
| Telegram group | Built in | Yes — `@BotName` |
| WhatsApp group | Built in | Yes — `@AssistantName` |
| WhatsApp DM | Built in | Needs separate phone number |

Set `TELEGRAM_ONLY=true` in `.env` to skip WhatsApp entirely.

## Voice transcription

Send a voice note in any registered chat. GhostClaw downloads the audio, sends it to OpenAI Whisper, and delivers the transcript to the agent as `[Voice: <transcript>]`.

Requires `OPENAI_API_KEY` in `.env`. Costs ~$0.006/minute of audio.

## Groups and isolation

Each group gets:
- Its own folder under `groups/`
- Its own `CLAUDE.md` (personality, rules, context)
- Its own conversation history
- Its own memory files

The main channel has admin privileges: it can register new groups, manage scheduled tasks, and see all groups. Other groups can only see their own data.

Register a new group by telling the bot in your main channel:
```
Register the WhatsApp group "Family Chat" — keep it casual, no work talk
```

The agent creates the group folder, writes an appropriate CLAUDE.md, and registers it via IPC.

## Soul

The soul lives in `groups/main/CLAUDE.md`. It's not a system prompt — it's the agent's working instructions, read fresh on every invocation. Define:

- Communication style (direct, verbose, technical, casual)
- Banned patterns (no emoji, no filler, no marketing speak)
- User context (businesses, preferences, people)
- Formatting rules (Telegram vs WhatsApp)

Keep the soul under 200 lines. Put facts in separate memory files that the agent can grep when needed.

## Scheduled tasks

The agent can schedule tasks via IPC:

```
Every weekday at 8am, check Hacker News for AI news and send me a summary
Remind me to review PRs every Friday at 3pm
Run a health check on the server every hour
```

Tasks run in the context of the group that created them.

## Optional integrations

GhostClaw inherits NanoClaw's skill system. Available skills:

| Skill | Command |
|-------|---------|
| Gmail | `/add-gmail` |
| Slack | `/add-slack` |
| Agent swarms | `/add-telegram-swarm` |
| Voice transcription | Already included |
| Telegram | Already included |

Run skills in Claude Code to apply them to your fork.

## Running as a service

### macOS (launchd)

```bash
# The /setup skill creates this automatically
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # restart
```

### Linux (systemd)

```bash
systemctl --user start nanoclaw
systemctl --user stop nanoclaw
systemctl --user restart nanoclaw
```

## Pulling upstream updates

GhostClaw tracks NanoClaw as the `upstream` remote:

```bash
git fetch upstream
git merge upstream/main
```

Watch for conflicts in:
- `src/container-runner.ts` — rewritten to spawn node directly
- `src/container-runtime.ts` — gutted to no-ops
- `src/index.ts` — Telegram channel additions

## Requirements

- macOS or Linux
- Node.js 20+
- [Claude Code](https://claude.ai/download)
- No Docker required

## FAQ

**Why remove containers?**

If the machine is dedicated to the bot, containers add latency and complexity for no security benefit. GhostClaw is for machines where the agent *should* have full access.

**Is this less secure than NanoClaw?**

Yes. Agents can read and write anything on the host. That's the point. Don't run this on a machine with sensitive data you don't want the agent to access.

**Can I add containers back?**

Use upstream NanoClaw instead. Or run `/convert-to-apple-container` on a fresh NanoClaw install.

**Can I use other models?**

Yes. Set `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` in `.env` for any Anthropic-compatible API endpoint.

## Credits

Fork of [NanoClaw](https://github.com/qwibitai/nanoclaw) by [qwibitai](https://github.com/qwibitai). All the hard work on the core architecture, skills system, and agent runner is theirs.

## Licence

MIT
