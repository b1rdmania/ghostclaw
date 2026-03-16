# GhostClaw

Personal AI assistant. Originally forked from [NanoClaw](https://github.com/qwibitai/nanoclaw), now fully independent with its own architecture.

## Quick Context

Single Node.js process that connects to Telegram and WhatsApp, routes messages to Claude Agent SDK running as **direct Node.js child processes** (no containers). Each group has isolated filesystem and memory.

Agents run directly on the host machine. `container-runner.ts` spawns `node` processes, passing paths via environment variables (`GHOSTCLAW_GROUP_DIR`, `GHOSTCLAW_IPC_DIR`, `GHOSTCLAW_GLOBAL_DIR`).

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/telegram.ts` | Telegram bot via Grammy |
| `src/channels/whatsapp.ts` | WhatsApp connection, auth, send/receive |
| `src/container-runner.ts` | Spawns agent as direct Node.js processes |
| `src/transcription.ts` | Voice transcription (ElevenLabs Scribe) and TTS (ElevenLabs) |
| `src/task-scheduler.ts` | Cron and one-shot scheduled tasks |
| `src/ralph.ts` | Ralph loop pure functions (task parsing, prompts) |
| `src/ralph-runner.ts` | Ralph loop orchestration (start, iterate, stop) |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/db.ts` | SQLite operations |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `groups/{name}/CLAUDE.md` | Per-group memory and personality (isolated) |
| `src/dashboard.ts` | Mission Control web UI (port 3333) |
| `src/error-alerts.ts` | Critical error alerting via Telegram |
| `container/agent-runner/src/index.ts` | Agent runtime (Claude SDK, MCP tools) |
| `skills-engine/` | Skill apply/merge/state engine |

## Skills

| Skill | When to Use |
|-------|-------------|
| `/setup-ghostclaw` | First-time setup with personality building |
| `/update-ghostclaw` | Safe update: backup, pull, migrate, rebuild, restart |
| `/add-heartbeat` | Periodic health checks |
| `/add-morning-briefing` | Scheduled daily/weekly briefings |
| `/add-gmail-agent` | Email integration (Gmail via MCP) |
| `/add-voice-transcription` | Voice note transcription (ElevenLabs Scribe) |
| `/add-voice-reply` | Voice replies via ElevenLabs TTS |
| `/add-telegram-swarm` | Multi-bot agent teams |
| `/add-slack` | Slack channel integration |
| `/pr-babysitter` | Automated PR monitoring with CI fix and review resolution |
| `/run-ralph` | Autonomous multi-task loop |
| `/debug` | Troubleshooting guide |
| `/customize` | Adding channels, integrations, changing behavior |
| `/update-nanoclaw` | Cherry-pick upstream NanoClaw updates |
| `/design` | Design system + best practices (Impeccable framework) |

## Community

[OpenClawOS Telegram group](https://t.me/+8qJbqxzBQAZkYTNk) — for problems, suggestions, and sharing.

## Dashboard (Mission Control)

Built-in web UI at `http://localhost:3333`. Token auto-generated in `.env` on first run. Tabs: Status, Chats, Tasks, Souls, Logs, Research. SSE for real-time updates. Source: `src/dashboard.ts` + `container/dashboard.html`.

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

- `container-runner.ts` sets `CLAUDE_CONFIG_DIR=data/sessions/{group}/.claude` for per-group session isolation. The Claude Agent SDK reads this natively.
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

For globally-enabled servers (available to all groups), add to `buildGlobalMcpServers()` in `container-runner.ts` — these get synced into every group's settings.json automatically. Only the `ghostclaw` server stays programmatic (needs runtime vars like `GHOSTCLAW_CHAT_JID`).

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
- `src/container-runner.ts` (rewritten to spawn node directly)
- `src/index.ts` (Telegram channel additions)
- `container/agent-runner/src/` (Gmail MCP, settings-based MCP merge)
