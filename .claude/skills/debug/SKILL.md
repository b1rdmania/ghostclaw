---
name: debug
description: Debug agent issues. Use when things aren't working, agent fails, authentication problems, or to understand how the system works. Covers logs, environment variables, sessions, and common issues.
---

# GhostClaw Agent Debugging

This guide covers debugging the agent execution system.

## Architecture Overview

```
Host (macOS/Linux)
───────────────────────────────────────────────
src/index.ts                   container/agent-runner/
    │                               │
    │ spawns child process          │ runs Claude Agent SDK
    │ with env vars                 │ with MCP servers
    │                               │
    ├── GHOSTCLAW_GROUP_DIR ──> groups/{folder}/
    ├── GHOSTCLAW_IPC_DIR ───> data/ipc/{folder}/
    ├── GHOSTCLAW_GLOBAL_DIR > groups/global/
    ├── CLAUDE_CONFIG_DIR ───> data/sessions/{folder}/.claude/
    └── HOME ────────────────> (inherited, real home)
```

**Important:** Agents run as direct Node.js child processes, not containers. `CLAUDE_CONFIG_DIR` provides per-group session isolation while `HOME` stays untouched so tools like `gh`, Gmail OAuth, etc. find their credentials naturally.

## Log Locations

| Log | Location | Content |
|-----|----------|---------|
| **Main app logs** | `logs/ghostclaw.log` | Routing, agent spawning, scheduling |
| **Main app errors** | `logs/ghostclaw.error.log` | Host-side errors |
| **Agent run logs** | `groups/{folder}/logs/container-*.log` | Per-run: input, stderr, stdout |
| **Claude sessions** | `data/sessions/{folder}/.claude/projects/` | Claude Code session history |

## Enabling Debug Logging

Set `LOG_LEVEL=debug` for verbose output:

```bash
# For development
LOG_LEVEL=debug npm run dev

# For launchd service (macOS), add to plist EnvironmentVariables:
<key>LOG_LEVEL</key>
<string>debug</string>
# For systemd service (Linux), add to unit [Service] section:
# Environment=LOG_LEVEL=debug
```

Debug level shows:
- Full environment configuration
- Agent process arguments
- Real-time agent stderr

## Common Issues

### 1. "Claude Code process exited with code 1"

**Check the agent log file** in `groups/{folder}/logs/container-*.log`

Common causes:

#### Missing Authentication
```
Invalid API key · Please run /login
```
**Fix:** Ensure `.env` file exists with either OAuth token or API key:
```bash
cat .env  # Should show one of:
# CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...  (subscription)
# ANTHROPIC_API_KEY=sk-ant-api03-...        (pay-per-use)
```

### 2. Environment Variables

Secrets are passed to the agent via stdin (never written to disk). The agent receives:
- `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`

Environment variables set via `GHOSTCLAW_*` paths:
- `GHOSTCLAW_GROUP_DIR` — group's working directory
- `GHOSTCLAW_IPC_DIR` — IPC communication directory
- `GHOSTCLAW_GLOBAL_DIR` — global shared directory
- `CLAUDE_CONFIG_DIR` — per-group Claude session isolation

To verify env vars are correct, check the agent log (first few lines show the input JSON).

### 3. Session Not Resuming

If sessions aren't being resumed (new session ID every time):

**Root cause:** The SDK looks for sessions at `$CLAUDE_CONFIG_DIR/projects/`. Each group's sessions live in `data/sessions/{folder}/.claude/`.

**Verify sessions exist:**
```bash
ls -la data/sessions/*/
```

**Check session continuity in logs:**
```bash
grep "Session initialized" logs/ghostclaw.log | tail -5
# Should show the SAME session ID for consecutive messages in the same group
```

### 4. MCP Server Failures

If an MCP server fails to start, the agent may exit. Check agent logs for MCP initialization errors.

MCP servers are configured in `data/sessions/{folder}/.claude/settings.json`. Global servers are synced automatically from `container-runner.ts:buildGlobalMcpServers()`.

### 5. Agent Timeout

Default timeout is 300 seconds. If the agent takes longer:
- Check logs for what it's doing (long tool calls, large file reads)
- Increase timeout via `containerConfig.timeout` on the registered group

## SDK Options Reference

The agent-runner uses these Claude Agent SDK options:

```typescript
query({
  prompt: input.prompt,
  options: {
    cwd: groupDir,
    allowedTools: ['Bash', 'Read', 'Write', ...],
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    settingSources: ['project'],
    mcpServers: { ... }
  }
})
```

**Important:** `allowDangerouslySkipPermissions: true` is required when using `permissionMode: 'bypassPermissions'`. Without it, Claude Code exits with code 1.

## Rebuilding After Changes

```bash
# Rebuild main app
npm run build

# Rebuild agent runner
cd container/agent-runner && npm run build && cd ../..

# Restart service
launchctl kickstart -k gui/$(id -u)/com.ghostclaw  # macOS
# systemctl --user restart ghostclaw                # Linux
```

## Session Persistence

Claude sessions are stored per-group in `data/sessions/{group}/.claude/` for security isolation. Each group has its own session directory, preventing cross-group access to conversation history.

To clear sessions:

```bash
# Clear all sessions for all groups
rm -rf data/sessions/

# Clear sessions for a specific group
rm -rf data/sessions/{groupFolder}/.claude/
```

## IPC Debugging

Agents communicate back to the host via files in `data/ipc/{folder}/`:

```bash
# Check pending messages
ls -la data/ipc/*/messages/

# Check pending task operations
ls -la data/ipc/*/tasks/

# Read a specific IPC file
cat data/ipc/*/messages/*.json

# Check available groups (main channel only)
cat data/ipc/main/available_groups.json

# Check current tasks snapshot
cat data/ipc/{groupFolder}/current_tasks.json
```

**IPC file types:**
- `messages/*.json` - Agent writes: outgoing messages
- `tasks/*.json` - Agent writes: task operations (schedule, pause, resume, cancel, refresh_groups)
- `current_tasks.json` - Host writes: read-only snapshot of scheduled tasks
- `available_groups.json` - Host writes: read-only list of groups (main only)

## Quick Diagnostic Script

Run this to check common issues:

```bash
echo "=== Checking GhostClaw Setup ==="

echo -e "\n1. Authentication configured?"
[ -f .env ] && (grep -q "CLAUDE_CODE_OAUTH_TOKEN=sk-" .env || grep -q "ANTHROPIC_API_KEY=sk-" .env) && echo "OK" || echo "MISSING - add CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY to .env"

echo -e "\n2. Node.js available?"
node --version 2>/dev/null && echo "OK" || echo "NOT FOUND - install Node.js 20+"

echo -e "\n3. Built?"
[ -d dist ] && echo "OK" || echo "MISSING - run npm run build"

echo -e "\n4. Agent runner built?"
[ -d container/agent-runner/dist ] && echo "OK" || echo "MISSING - run cd container/agent-runner && npm run build"

echo -e "\n5. Groups directory?"
ls -la groups/ 2>/dev/null || echo "MISSING - run /setup-ghostclaw"

echo -e "\n6. Service running?"
launchctl list 2>/dev/null | grep ghostclaw && echo "OK" || echo "NOT RUNNING"

echo -e "\n7. Recent agent logs?"
ls -t groups/*/logs/container-*.log 2>/dev/null | head -3 || echo "No agent logs yet"

echo -e "\n8. Session continuity working?"
SESSIONS=$(grep "Session initialized" logs/ghostclaw.log 2>/dev/null | tail -5 | awk '{print $NF}' | sort -u | wc -l)
[ "$SESSIONS" -le 2 ] && echo "OK (recent sessions reusing IDs)" || echo "CHECK - multiple different session IDs, may indicate resumption issues"
```
