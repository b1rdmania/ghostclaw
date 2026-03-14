# Setup Namecheap MCP

This skill helps users install and configure the Namecheap MCP server for checking domain availability from Claude.

## What This Skill Does

1. **Gets user's IP address** - Fetches from ipify.org
2. **Guides through Namecheap API setup** - Step-by-step instructions
3. **Configures Claude Code settings** - Adds MCP server config automatically
4. **Tests the installation** - Verifies everything works

## Process

### Step 1: Get IP Address

Use WebFetch to get the user's public IP:

```
Visit https://api.ipify.org and extract the IP address
```

Tell the user: "Your IP is **X.X.X.X** - keep this handy for the next step."

### Step 2: Guide Namecheap API Setup

Send a message with clear instructions:

```
To enable the Namecheap API:

1. Go to https://www.namecheap.com and log in
2. Click **Profile (top right) → Tools → Namecheap API Access**
3. Click **"Enable API Access"**
4. Under **Whitelisted IPs**, click **"Add New"** and paste: X.X.X.X
5. Copy your **API key**

Reply with your Namecheap username and API key when ready.
```

### Step 3: Add to Claude Code Settings

Once you have the credentials, read the user's Claude settings file to determine the correct location:

1. Check `~/.claude.json` first
2. If not found, check `~/.claude/settings.json`
3. If neither exists, create `~/.claude/settings.json`

Add the namecheap MCP server config:

```json
{
  "mcpServers": {
    "namecheap": {
      "command": "npx",
      "args": ["-y", "@birdmania1/namecheap-mcp"],
      "env": {
        "NAMECHEAP_API_USER": "their_username",
        "NAMECHEAP_API_KEY": "their_api_key",
        "NAMECHEAP_USERNAME": "their_username",
        "NAMECHEAP_CLIENT_IP": "their_ip_address"
      }
    }
  }
}
```

**Important:**
- Add to the existing `mcpServers` object if it exists
- Don't duplicate - check if "namecheap" already exists
- Preserve other MCP servers already configured

### Step 4: Restart Prompt

Tell the user:

```
✅ Namecheap MCP configured!

Please restart Claude Code (⌘+Q and reopen) for the changes to take effect.

After restart, test it by asking: "Check if example.com is available"
```

## Key Points

- **Never store credentials in the skill** - always get from user
- **Detect config file location** - don't assume which file they use
- **Check for duplicates** - warn if namecheap is already configured
- **Be conversational** - guide them through each step clearly

## Example Usage

**User:** "Set up Namecheap MCP"

**Agent:**
1. Fetches IP address
2. Guides through Namecheap setup
3. Waits for credentials
4. Configures settings automatically
5. Prompts restart

The whole process takes 3-5 minutes.

## Affiliate Note

The MCP includes affiliate tracking (ID 7069952) in all purchase links. This is built into the npm package and requires no configuration.
