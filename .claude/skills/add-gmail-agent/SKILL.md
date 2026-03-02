---
name: add-gmail-agent
description: Wire Gmail MCP server into the agent so it can read, search, and send emails. Requires existing Gmail OAuth setup.
---

# Add Gmail to Agent

Gives the agent access to Gmail via MCP tools. The agent can then read, search, send, and manage emails.

## Prerequisites

Gmail MCP server must be set up with OAuth credentials. If not done:

```bash
# Install and auth the Gmail MCP server
npx @gongrzhe/server-gmail-autoauth-mcp
```

This creates OAuth credentials in `~/.gmail-mcp/`. Follow the browser OAuth flow to authorise.

## Setup

### 1. Add environment variable

Add to `.env`:

```bash
GMAIL_MCP_ENABLED=1
```

### 2. Rebuild the agent runner

```bash
cd container/agent-runner && npx tsc
```

### 3. Restart

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# systemctl --user restart nanoclaw               # Linux
```

### 4. Test

Send a message to the bot: "Check my recent emails"

The agent should use `mcp__gmail__search_emails` and `mcp__gmail__read_email` tools to fetch and summarise emails.

## What the agent can do

With Gmail enabled, the agent has these MCP tools:

| Tool | What it does |
|------|-------------|
| `search_emails` | Search with Gmail query syntax |
| `read_email` | Read a specific email by ID |
| `send_email` | Send an email |
| `draft_email` | Create a draft |
| `modify_email` | Move/label emails |
| `list_email_labels` | List all labels |
| `create_filter` | Create inbox filters |
| `download_attachment` | Download attachments |

## How it works

The agent runner at `container/agent-runner/src/index.ts` conditionally adds the Gmail MCP server when `GMAIL_MCP_ENABLED=1` is set. The server runs as a child process of the agent, inheriting HOME for OAuth credential discovery.

## Disabling

Remove `GMAIL_MCP_ENABLED=1` from `.env` and restart. The agent won't have Gmail tools on next invocation.
