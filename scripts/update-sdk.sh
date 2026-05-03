#!/usr/bin/env bash
# Weekly auto-update for the Claude Agent SDK.
# Runs as a launchd job. Updates the SDK, rebuilds if changed, restarts GhostClaw.

set -e

AGENT_RUNNER_DIR="/Users/ziggy/nanoclaw/agent-runner"
NANOCLAW_DIR="/Users/ziggy/nanoclaw"
LOG_PREFIX="[sdk-update]"

log() { echo "$LOG_PREFIX $1"; }

BEFORE=$(cat "$AGENT_RUNNER_DIR/node_modules/@anthropic-ai/claude-agent-sdk/package.json" 2>/dev/null | grep '"version"' | tr -d ' "version:,')

log "Checking for SDK updates (current: $BEFORE)..."
cd "$AGENT_RUNNER_DIR"
npm update @anthropic-ai/claude-agent-sdk 2>&1

AFTER=$(cat "$AGENT_RUNNER_DIR/node_modules/@anthropic-ai/claude-agent-sdk/package.json" 2>/dev/null | grep '"version"' | tr -d ' "version:,')

if [ "$BEFORE" = "$AFTER" ]; then
  log "Already up to date ($AFTER). No action needed."
  exit 0
fi

log "Updated $BEFORE -> $AFTER. Rebuilding..."
npm run build 2>&1

log "Restarting GhostClaw..."
launchctl kickstart -k "gui/$(id -u)/com.ghostclaw" 2>&1

log "Done. SDK $AFTER live."
