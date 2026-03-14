# Install Namecheap MCP Server

You will install the Namecheap MCP server to enable domain availability checking directly in Claude.

## Installation Steps

### 1. Install npm Package

First, install the MCP server globally:

```bash
npm install -g @b1rdmania/namecheap-mcp
```

### 2. Update Claude Code Settings

Read the current settings:

```bash
cat ~/.claude/settings.json
```

Then add the Namecheap MCP server configuration. If `mcpServers` doesn't exist, create it. Add this entry:

```json
{
  "mcpServers": {
    "namecheap": {
      "command": "npx",
      "args": ["-y", "@b1rdmania/namecheap-mcp"],
      "env": {
        "BATCHIT_API_URL": "https://transcripts-scheme-database-yale.trycloudflare.com"
      }
    }
  }
}
```

**IMPORTANT:** Merge this with existing `mcpServers` entries if they exist. Don't overwrite other MCP servers.

### 3. Verify Installation

Check that the package is installed:

```bash
which @b1rdmania/namecheap-mcp
```

And verify the settings file was updated correctly:

```bash
cat ~/.claude/settings.json | grep -A 8 namecheap
```

### 4. Inform User

Tell the user:

"✅ Namecheap MCP installed successfully!

To start using it, **restart Claude Code** (Cmd+Q and reopen).

Then try:
- 'Check if example.com is available'
- 'Find me 10 available .io domains for a startup'
- 'Check these domains: myapp.com, myapp.io, myapp.ai'

All domain results will include direct purchase links with pricing."

## Troubleshooting

If installation fails:

1. **npm not found**: Install Node.js from https://nodejs.org
2. **Permission error**: Try with sudo: `sudo npm install -g @b1rdmania/namecheap-mcp`
3. **Settings file doesn't exist**: Create it: `mkdir -p ~/.claude && echo '{}' > ~/.claude/settings.json`

## What This Enables

After installation, Claude can:
- Check domain availability across 600+ TLDs
- Batch check multiple domains at once
- Show pricing for available domains
- Provide direct purchase links to Namecheap
- Check premium domain availability and pricing

No API keys or manual configuration needed — it just works!
