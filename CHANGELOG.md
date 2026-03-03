# Changelog

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
