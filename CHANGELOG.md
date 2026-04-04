# Changelog

## v0.7.4 (2026-04-04) — Idle timeout architecture fix

### Fixes
- **Idle timer now tracks agent activity, not user-facing output** — the idle timer previously only reset on stdout (user-facing results). All internal activity — tool calls, Task sub-agent progress, SDK messages — logs to stderr and was invisible to the timer. A research task using a Task sub-agent would always hit the idle timeout because the parent session is silent while waiting for the sub-agent result. The stderr handler now also resets the idle timer, so "idle" correctly means "no activity at all" rather than "no output to Birdmania."
- **Session validation before resume** — before passing a session ID to the SDK, the agent-runner scans the session `.jsonl` for unmatched `tool_use` entries. A broken session (parent timed out mid-Task) caused the SDK to hang silently on resume. Now detected and cleared before the hang, starting fresh instead.
- **Clear session on no-output idle timeout** — if the orchestrator receives an idle timeout with no streaming output and no new session ID, it clears the stored session before retrying. Belt-and-suspenders with session validation above.
- **Stderr in timeout logs** — timeout log files now include stderr output, making stall diagnosis significantly easier.
- **Model updated** — `GHOSTCLAW_MODEL` bumped from `claude-sonnet-4-5-20250929` to `claude-sonnet-4-6`.

## v0.7.3 (2026-04-04) — OAuth extra usage support + update hard reset

### New
- **OAuth extra usage support** — GhostClaw now works with Claude Code OAuth tokens when extra usage bundles are active. The `CLAUDE_CODE_OAUTH_TOKEN` in `.env` is the primary auth path; `ANTHROPIC_API_KEY` remains supported as an alternative. Note: the Haiku fast-path (`src/fast-path.ts`) requires a direct API key and cannot use OAuth — it remains mothballed until an API key is configured.
- **Hard session reset on update** — `/update-ghostclaw` now deletes all stored sessions from the DB before restarting. Prevents stale sessions from causing auth or execution errors after an update. Previously relied on a soft restart which left old session state in place.
- **Pre-update memory warning** — `/update-ghostclaw` now warns users to back up `groups/main/memory/` and `groups/main/CLAUDE.md` before proceeding, since a fresh session after restart won't have prior conversation context.

## v0.7.2 (2026-04-03) — Unified reset command

### Changes
- **`/reset` merged with `/hardreset`** — the two commands have been unified. `/reset` now performs a full hard reset (kill agents, clear tasks, wipe session, advance cursor, restart). The separate `/hardreset` command has been removed.

## v0.7.1 (2026-04-03) — Stability + hard reset + memory reliability

### New
- **`/hardreset` command** — nuclear option via Telegram. Kills all agents, clears scheduled tasks, wipes session data, kills orphaned processes, advances message cursor, then restarts. Use when the system is stuck and `/reset` isn't enough.
- **Post-agent memory write** — after every successful agent run that produces output, an `[auto]` entry is appended to `memory/log.md`. Memory updates no longer depend on the agent remembering to write them.
- **Memory trigger bypass** — messages containing "remember this", "log this", "save this", "bank this", "note this", or "don't forget" always go to the full agent (never fast path) to ensure memory writes happen.
- **Ralph decomposition rule** — Ralph must now estimate scope and break tasks >20min into bounded subtasks before executing.
- **Ralph narration rule** — Ralph must send progress updates every 2-3 minutes during long operations to keep the idle timer alive.

### Fixes
- **PID lock hardened** — exclusive lock file held open for process lifetime with delayed verification. Prevents the duplicate-instance problem where 6 GhostClaw processes would spawn during rapid crash-restart cycles, each sending identical responses.
- **Session auto-prune** — deletes session data older than 1 hour on startup and every hour while running. Keeps `settings.json`. Prevents the 406MB session bloat that degraded performance over multi-day uptime.
- **Timeouts reverted to safe defaults** — `AGENT_IDLE_TIMEOUT` back to 10min, `AGENT_ABSOLUTE_TIMEOUT` back to 45min. The March 30-31 incident showed that long timeouts + Ralph loops = hours of wasted compute per failed task.
- **`@anthropic-ai/sdk` added** as dependency (for future fast-path routing when API key auth is available).

### Mothballed
- **Fast-path routing** (`src/fast-path.ts`) — built but disabled. OAuth tokens don't work with the raw Anthropic API ("OAuth authentication is currently not supported"). Code remains for when an `ANTHROPIC_API_KEY` is available. The routing logic, memory triggers, and handoff mechanism are all wired up and tested.

## v0.7.0 (2026-03-29) — Message history overflow fix

### Fixes
- **Message history queries now have LIMIT** — `getNewMessages()` and `getMessagesSince()` were loading unbounded results from SQLite. As conversations grew, this caused escalating memory usage and token costs. Both queries now cap at 200 rows (configurable), using a DESC subquery to keep the most recent messages.
- **Per-prompt message cap** — `MAX_MESSAGES_PER_PROMPT` (default 50, configurable via env var) limits how many messages are bundled into a single agent prompt.
- **Cursor recovery on restart** — when `lastAgentTimestamp` is missing (new group, corrupted state, or restart), the system now recovers from the last bot message timestamp instead of falling back to empty string (which would send the entire conversation history).

## v0.6.9 (2026-03-29) — Structured memory + process watchdog

### New
- **Structured memory system** — replaces the monolith CLAUDE.md with three files: `memory/identity.md` (who the agent is — read once per session), `memory/state.md` (active projects, current status — read every message), and `memory/log.md` (append-only decisions and completed work). CLAUDE.md becomes pure instructions. New installs get this from `/setup-ghostclaw`. Existing installs can migrate with `/migrate-memory`.
- **Runaway process watchdog** — heartbeat now checks for zombie processes (Chrome/agent-browser) consuming >90% CPU and kills them automatically. Also monitors load average and alerts if >4. Prevents the machine from cooking for days unattended.
- **Remote debug via Telegram** — text "check load", "check memory", "what's eating CPU", or "kill chrome" and the agent runs the commands and reports back.

## v0.6.8 (2026-03-27) — Clean session lifecycle

### Fixes
- **Sessions now exit cleanly after 2 minutes of inactivity** — previously the agent held its session open for 30 minutes after responding, then got killed by the 10-minute idle timeout. This caused noisy error logs on every single response and wasted resources. Now the host sends a `_close` signal after 2 minutes of no follow-up messages, and the agent exits gracefully. If a follow-up arrives within 2 minutes, it's handled in the same session with full context.
- The 10-minute idle timeout in the container-runner remains as a safety net for truly stuck agents, but should no longer fire during normal operation.

## v0.6.7 (2026-03-24) — Model selection + fast-fail on auth errors

### New
- **`/model` command in Telegram** — view and switch AI models without SSH or editing config files. Type `/model` to see current model and options, `/model opus` to switch. Persists to `.env` and takes effect on the next message — no restart needed. Available models: `sonnet` (default), `opus`, `haiku`.

### Fixes
- **Agent exits immediately on zero-result queries** — when the Claude API returned a 403 (e.g. expired OAuth token), the agent process would sit idle for 10 minutes waiting for IPC messages that would never arrive, then get killed by the idle timeout. Now detects the empty response and exits with an error immediately, so the retry happens in seconds.
- **Default model changed from Haiku to Sonnet** — the SDK was defaulting to Haiku when no model was specified. Now defaults to `sonnet`. Override with `GHOSTCLAW_MODEL` in `.env` or `/model` in Telegram.
- **Model config uses aliases** (`sonnet`, `opus`, `haiku`) instead of full dated model IDs, which avoids breakage when Anthropic rotates model versions.

## v0.6.6 (2026-03-23) — Fix retry spiral that caused multi-day hangs

### Fixes
- **Cursor rollback now has a limit** — previously, when an agent timed out without producing output, the message cursor rolled back unconditionally so the same messages would be retried. If the prompt itself was the problem (too large, API hang), this created an infinite loop: timeout -> rollback -> retry same messages -> timeout. After a week unattended, GhostClaw was stuck in this cycle with 17 queued messages, each retry burning 10 minutes before timing out.
- **After 3 consecutive failures on the same cursor position**, the cursor now advances past the stuck messages instead of rolling back, and the bot sends the user a message: "I had trouble processing some messages and had to skip them. Please resend anything important." This breaks the spiral while keeping the user informed — no silent data loss.
- The retry count in `group-queue.ts` (MAX_RETRIES=5) was not sufficient protection because every new incoming message triggered `recoverPendingMessages`, which restarted the retry cycle from scratch on the same backlog.

## v0.6.5 (2026-03-20) — Context bloat eliminated

### Fixes
- **`/reset` now deletes the session directory on disk** — previously it only removed the session ID from the database. The Claude SDK reloads `.claude.json` when no session ID is passed, so old conversation context (including weeks-old project messages) was being silently restored. Now `/reset` removes `data/sessions/{group}/.claude/` entirely — next message starts with a genuinely blank slate.

### New
- **Completed tasks archived to markdown, not kept in DB** — Ralph iterations and one-shot tasks are now written to `groups/{folder}/completed-tasks.md` on completion and immediately deleted from the database. Active task context only shows what actually needs attention (Due soon / Scheduled / Paused). No more stale task history injected into every agent run.
- **`list_tasks` reorganised** — output now groups tasks into Due soon, Scheduled, and Paused sections with human-readable timestamps instead of a flat noisy list.
- **`list_completed_tasks` tool** — new MCP tool lets the agent check `completed-tasks.md` when it needs to know what's already been done, without that history being forced into every context window.

## v0.6.4 (2026-03-20) — Timeout fix + queue visibility

### Fixes
- **Absolute timeout regression fixed** — v0.6.1 introduced a `Math.min(CONTAINER_TIMEOUT, AGENT_ABSOLUTE_TIMEOUT)` comparison that silently capped the ceiling at 30 minutes (CONTAINER_TIMEOUT) instead of the intended 45. Removed the comparison entirely — `AGENT_ABSOLUTE_TIMEOUT` now stands alone.

### New
- **Queue ack shows what's currently running** — when a message is queued behind an active agent, the bot now replies with `Got it, queued — currently: "..."` showing the first 100 characters of the task in progress, instead of the generic "finishing a task first" message.

## v0.6.3 (2026-03-19) — Session + status fixes

### Fixes
- **`/reset` now clears the Claude session** — previously it killed the agent and queue but left the session ID intact, so the next message resumed the same bloated context window. Now `/reset` wipes the session entirely, next message starts fresh.
- **`/status` waiting count fixed** — "Waiting groups" was showing 0 even when messages were queued behind a running agent. Now correctly counts any group with pending work.
- **`AGENT_IDLE_TIMEOUT` and `AGENT_ABSOLUTE_TIMEOUT` can now be set in `.env`** — previously required editing the launchd plist or systemd service.

## v0.6.2 (2026-03-19) — /update hotfix

### Fixes
- **`/update` no longer fails after applying a skill.** Skills apply patches and commit locally, which caused `git pull` to fail with "divergent branches". `/update` now uses `git fetch origin && git rebase origin/main` — fast-forwards when clean, replays local skill commits on top of upstream changes when not.

## v0.6.1 (2026-03-19) — Dual timeout for stuck agents

### Fixes
- **Dual agent timeout** replaces the old single 30-min timer:
  - **Idle timeout** (10 min default, `AGENT_IDLE_TIMEOUT` env var): reset on any stdout activity. An agent that produces no output for 10 minutes is considered stuck and killed. This catches the "hung waiting on API" case that was causing 30-40 min hangs.
  - **Absolute ceiling** (45 min default, `AGENT_ABSOLUTE_TIMEOUT` env var): never resets, regardless of any activity. Hard cap for runaway agents producing garbage output.
- Both timeouts log their reason (`idle` vs `absolute`) to make post-mortems easier.

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
