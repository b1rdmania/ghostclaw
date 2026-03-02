---
name: add-gmail-agent
description: Wire Gmail MCP server into the agent so it can read, search, and send emails. Optional — not core functionality.
---

# Add Email to Agent (Gmail)

Gives the agent access to email via MCP tools. Read, search, send, and manage emails from the bot.

**This is optional.** Email is not core to GhostClaw. But it's useful — your bot can read verification codes, check for urgent emails, send summaries, or flag things that need attention. One practical use: the bot reads its own auth codes automatically during setup.

## Email providers

Gmail is the easiest path because there's a well-maintained MCP server for it. But this isn't Gmail-specific — any email provider with an MCP server or IMAP access works. Options:

| Provider | Approach | Difficulty |
|----------|----------|------------|
| **Gmail** | MCP server with OAuth (documented below) | Medium — Google Cloud setup required |
| **Outlook/365** | Microsoft Graph MCP server | Medium — Azure app registration |
| **Any IMAP** | Generic IMAP MCP server | Easy — just server/user/password |
| **Proton Mail** | Proton Bridge + IMAP MCP | Medium — needs Bridge running |

The Gmail route is documented here. For other providers, the wiring is identical — just swap the MCP server command in the agent runner config.

## Gmail setup

### 1. Google Cloud OAuth (one-time)

This is the fiddly part. You need a Google Cloud project with Gmail API enabled:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or use existing)
3. Enable the Gmail API
4. Create OAuth 2.0 credentials (Desktop app type)
5. Download the credentials JSON

Then authenticate the MCP server:

```bash
npx @gongrzhe/server-gmail-autoauth-mcp
```

Follow the browser OAuth flow. This creates credentials in `~/.gmail-mcp/`.

### 2. Enable in GhostClaw

Add to `.env`:

```bash
GMAIL_MCP_ENABLED=1
```

### 3. Rebuild and restart

```bash
cd container/agent-runner && npx tsc
launchctl kickstart -k gui/$(id -u)/com.ghostclaw  # macOS
# systemctl --user restart ghostclaw               # Linux
```

### 4. Test

Send a message to the bot: "Check my recent emails"

## What the agent can do

With email enabled, the agent has these MCP tools:

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

Remove `GMAIL_MCP_ENABLED=1` from `.env` and restart. The agent won't have email tools on next invocation.

## Using other email providers

To swap Gmail for another provider, edit `container/agent-runner/src/index.ts` and change the MCP server command in the `gmail` config block. The rest of the wiring (conditional enable via env var, tool permissions) stays the same.
