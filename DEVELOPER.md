# GhostClaw

Personal AI assistant. Originally forked from [NanoClaw](https://github.com/qwibitai/nanoclaw), now fully independent with its own architecture.

## Quick Context

Single Node.js process that connects to Telegram, routes messages to Claude Agent SDK running as **direct Node.js child processes** (no containers). Each group has isolated filesystem and memory.

Agents run directly on the host machine. `agent-spawner.ts` spawns `node` processes, passing paths via environment variables (`GHOSTCLAW_GROUP_DIR`, `GHOSTCLAW_IPC_DIR`, `GHOSTCLAW_GLOBAL_DIR`).

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator bootstrap: state, message loop, wiring |
| `src/channels/telegram.ts` | Telegram bot connection + inbound handlers |
| `src/channels/telegram-commands.ts` | Slash-command handlers (`/model`, `/budget`, `/status`, etc.) |
| `src/agent-spawner.ts` | Spawns agent as a direct Node.js child process |
| `src/run-agent.ts` | Orchestrator-side wrapper around `spawnAgentProcess` |
| `src/agent-pid-lock.ts` | Singleton PID lock + orphan agent cleanup |
| `src/fast-path.ts` | Cheap Haiku triage — skips the full agent for simple chat |
| `src/status-report.ts` | Builds the `/status` Telegram reply |
| `src/hard-reset.ts` | `/reset` — kills agents, clears tasks, wipes sessions |
| `src/transcription.ts` | Voice transcription (ElevenLabs Scribe) and TTS |
| `src/task-scheduler.ts` | Cron and one-shot scheduled tasks |
| `src/ralph.ts`, `src/ralph-runner.ts` | Ralph autonomous-loop functions + orchestration |
| `src/ipc.ts` | IPC file-watcher + handlers for agent → orchestrator commands |
| `src/db.ts` | SQLite operations (messages, tasks, sessions, usage_events) |
| `src/config.ts` | Env vars, trigger pattern, paths, intervals, daily budget |
| `src/dashboard.ts` | Mission Control web UI (port 3333) |
| `src/error-alerts.ts` | Critical error alerting via Telegram |
| `public/dashboard.html` | Dashboard frontend |
| `agent-runner/src/index.ts` | Agent runtime (Claude Agent SDK, MCP tools) |
| `groups/{name}/CLAUDE.md` | Per-group memory and personality (isolated) |
| `skills-engine/` | Skill apply/merge/state engine |

## Auth + cost controls

- **Auth**: `ANTHROPIC_API_KEY` in `.env` is required. OAuth/Max login is no longer supported; the keychain-read path was removed in v0.8.0.
- **Fast-path**: simple messages are answered directly via the raw Anthropic SDK (no agent spawn, no tools, no session). Memory-write phrases bypass and go to the full agent. Controlled by `GHOSTCLAW_FAST_PATH_MODEL` (default `claude-sonnet-4-6` — Haiku is opt-in but trips the `[HANDOFF]` contract and leaks preamble).
- **Daily budget cap**: `GHOSTCLAW_DAILY_BUDGET_USD`. When today's spend meets or exceeds the cap, the orchestrator forces fast-path-only mode until UTC midnight and sends a Telegram alert. Manage from Telegram with `/budget`, `/budget set 10`, `/budget off`.
- **Usage tracking**: every turn (agent or fast-path) writes a row into the `usage_events` table. `/budget` and the dashboard's "Today" tile read from here.
- **Session hygiene**: if a conversation goes silent for >1h, the stored session is cleared before the next turn so stale history doesn't replay as input tokens. Combined with the 80k auto-compact window (set in `agent-runner/src/index.ts`), this is the main session-cost lever.

## Skills

Core skills (setup, integrations, operations):

| Skill | When to Use |
|-------|-------------|
| `/setup-ghostclaw` | First-time setup with personality building |
| `/update-ghostclaw` | Safe update: backup, pull, migrate, rebuild, restart |
| `/update-nanoclaw` | Cherry-pick upstream NanoClaw updates |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Troubleshooting guide |
| `/add-gmail-agent` | Email integration (Gmail via MCP) |
| `/add-voice-transcription` | Voice note transcription (ElevenLabs Scribe) |
| `/add-voice-reply` | Voice replies via ElevenLabs TTS |
| `/add-telegram-swarm` | Multi-bot agent teams |
| `/add-slack`, `/add-discord` | Additional channels |
| `/add-heartbeat`, `/add-morning-briefing`, `/add-update-check` | Scheduled tasks |
| `/run-ralph` | Autonomous multi-task loop |
| `/pr-babysitter`, `/qodo-pr-resolver` | Automated PR monitoring + resolution |
| `/design` | Design system + best practices (Impeccable framework) |

Run `/skills` in Telegram for a full list synced from `.claude/skills/`.

## Community

[GhostClaw community on Telegram](https://t.me/+8qJbqxzBQAZkYTNk) — for problems, suggestions, and sharing.

## Dashboard (Mission Control)

Built-in web UI at `http://localhost:3333`. Token auto-generated in `.env` on first run. Tabs: Status, Chats, Tasks, Souls, Logs, Research. SSE for real-time updates. Source: `src/dashboard.ts` + `public/dashboard.html`.

## Development

Run commands directly — don't tell the user to run them.

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
npm run test         # Run tests
```

Service management:
```bash
# macOS (launchd)
launchctl load ~/Library/LaunchAgents/com.ghostclaw.plist
launchctl unload ~/Library/LaunchAgents/com.ghostclaw.plist
launchctl kickstart -k gui/$(id -u)/com.ghostclaw  # restart

# Linux (systemd)
systemctl --user start ghostclaw
systemctl --user stop ghostclaw
systemctl --user restart ghostclaw
```

## Agent Environment Model

Agents run as child processes with the **real HOME**. Session isolation uses `CLAUDE_CONFIG_DIR` — **never override HOME**.

- `agent-spawner.ts` sets `CLAUDE_CONFIG_DIR=data/sessions/{group}/.claude` for per-group session isolation. The Claude Agent SDK reads this natively.
- `HOME` is inherited from the host process. Tools like `gh`, Gmail OAuth, and any MCP server find their credentials at `~/` as expected.
- The MCP SDK automatically passes `HOME`, `PATH`, `USER`, `SHELL`, `TERM`, `LOGNAME` to MCP server processes (safe allowlist). Custom vars must be passed explicitly.

### Adding MCP servers

Use the **standard Claude Code pattern**: add to `data/sessions/{group}/.claude/settings.json`:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["my-mcp-package"]
    }
  }
}
```

The agent-runner reads `mcpServers` from settings.json at startup and merges them with the built-in `ghostclaw` IPC server. `allowedTools` is built dynamically (`mcp__{name}__*` for each server). No code changes needed.

For globally-enabled servers (available to all groups), add to `buildGlobalMcpServers()` in `agent-spawner.ts` — these get synced into every group's settings.json automatically. Only the `ghostclaw` server stays programmatic (needs runtime vars like `GHOSTCLAW_CHAT_JID`).

## Security

Skills are scanned before application (`skills-engine/security-scan.ts`). Critical findings block apply. Run `npx tsx scripts/scan-skill.ts --all` to scan all skills.

## NanoClaw Heritage

Originally forked from NanoClaw. The skills engine and `/update-nanoclaw` skill can still cherry-pick upstream changes, but the core architecture has diverged:
- `.ghostclaw/` state directory (was `.nanoclaw/`)
- `GHOSTCLAW_*` environment variables (was `NANOCLAW_*`)
- `mcp__ghostclaw__*` tool names (was `mcp__nanoclaw__*`)
- No containers — agents run directly on host
- Settings-based MCP server configuration

When pulling upstream updates, watch for conflicts in:
- `src/agent-spawner.ts` (rewritten to spawn node directly)
- `src/index.ts` (Telegram channel additions)
- `agent-runner/src/` (Gmail MCP, settings-based MCP merge)
