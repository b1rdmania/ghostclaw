# Changelog

## v0.6.0 (2026-03-19) — Reliability + remote control

### Fixes
- Infinite retry loop eliminated: `scheduleRetry` no longer resets `retryCount` after `MAX_RETRIES`. Previously, a group that hit max retries would silently reset the counter and retry forever.
- Orphaned agent processes from previous runs are now killed on startup. PIDs are tracked in `data/agent-pids.json` and cleaned up on boot, preventing slot starvation and timeout cascades after a crash or forced restart.

### New
- `/status` command: shows active agents per group, queue depth (pending tasks + messages), and uptime. Available via Telegram.
- `/skills` command: lists all installed skills with descriptions, read live from `.claude/skills/`. Available via Telegram.
- Telegram command menu: `setMyCommands()` called at startup so all commands appear with descriptions when the user types `/`.
- `GroupQueue.getStatus()`: exposes live queue state (active count, waiting groups, per-group task/message queues) for external consumers.

## v0.5.5 (2026-03-18) — Remote control hotfix

### Fixes
- `/reset` now clears the pending task and message queue, not just kills the current agent. Previously, resetting would immediately drain the next queued item, making it impossible to stop a runaway queue remotely.
- `/reset` reply updated to confirm both kill and queue clear.

### New
- `/update` command: pulls latest code from git, rebuilds, and restarts via launchd. Allows remote updates over Telegram without SSH access. This is a bootstrapped command — requires one manual `git pull && npm run build` to get it onto a running instance, after which all future updates can be done via Telegram.

## v0.5.0 (2026-03-04) — Public Beta

First public beta release. GhostClaw is feature-complete and ready for testing.

### New features
- Mission Control dashboard with live status, chat management, task scheduling, soul editing, logs, and research tabs
- Research tab with inline file editor (click to view/edit output, download links)
- Ralph autonomous task loop — run multi-step research and task checklists overnight
- Telegram file delivery — research output sent as documents after Ralph completion
- Queue acknowledgment — "Got it, finishing a task first..." when messages arrive during tasks
- Typing indicator stays alive during long agent responses
- Voice transcription via ElevenLabs Scribe (replaced OpenAI Whisper)
- Ghost personality throughout dashboard (loading quips, save feedback, footer rotation)

### Fixes
- Ralph task ID collisions on retry
- Error alert spam from transient WhatsApp disconnections
- Research tab no longer shows unrelated project files (README, CHANGELOG, etc.)

### Cleanup
- Removed experimental `add-parallel` skill
- Consolidated Gmail skills (single `add-gmail-agent` skill)
- Updated voice transcription skill code package to ElevenLabs
- Updated all docs: README, CLAUDE.md, .env.example, SKILL.md files
- Debug skill rewritten for direct process model (no more Docker references)

## v0.2.1 (2026-03-03)

- PID file lock prevents duplicate instances (fixes Telegram 409 and WhatsApp conflict errors)
- Mission Control dashboard (built-in web UI)
- Branded README with GhostClaw mark
- Repo transferred to b1rdmania/ghostclaw

## v0.2.0 (2026-03-03)

**GhostClaw identity release.** Full independence from NanoClaw naming and architecture.

- Complete rename: all env vars, MCP servers, directories, package names now `ghostclaw`/`GHOSTCLAW_*`
- Settings-based MCP server configuration — agents install MCP servers via standard `settings.json`, no code changes needed
- Agent environment model: `CLAUDE_CONFIG_DIR` for session isolation, `HOME` left untouched so tools find credentials naturally
- Reserved MCP server names, shape validation, source-of-truth global sync
- Ralph autonomous task loop — run multi-step tasks overnight from a checklist
- Telegram formatting (bold, italic, code blocks)
- Morning briefing skill
- Cleaned up stale NanoClaw assets, docs, and duplicate files

## v0.1.1 (2026-03-01)

- Gmail integration via MCP
- Voice transcription (Whisper)
- Heartbeat monitoring
- Skills engine with security scanning

## v0.1.0 (2026-02-28)

- Initial fork from NanoClaw
- Containers removed — agents run as direct Node.js child processes
- Telegram as primary channel
- WhatsApp group chat support
- Scheduled tasks (cron, interval, one-shot)
- Per-group personality system
