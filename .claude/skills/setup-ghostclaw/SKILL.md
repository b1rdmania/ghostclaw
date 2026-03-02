---
name: setup-ghostclaw
description: First-time GhostClaw setup. Handles dependencies, authentication, channel configuration, main chat registration, soul building, and service setup. Run this instead of NanoClaw's /setup.
---

# GhostClaw Setup

Interactive setup for a fresh GhostClaw install. Handles everything from dependencies to personality.

## Phase 1: Dependencies

```bash
npm install
```

Check Node.js version:
```bash
node --version  # Must be 20+
```

## Phase 2: Authentication

### Claude Code token

Ask: "Do you have a Claude Max subscription or an API key?"

**Claude Max (recommended):**
Tell the user to run this in a separate terminal (not inside Claude Code):
```bash
claude setup-token
```
Then ask them to paste the token. Add to `.env`:
```
CLAUDE_CODE_OAUTH_TOKEN=<token>
```

**API key:**
```
ANTHROPIC_API_KEY=<key>
```

### Bot name

AskUserQuestion: What should the bot be called?

Add to `.env`:
```
ASSISTANT_NAME=<name>
```

## Phase 3: Channels

AskUserQuestion: Which channels do you want?
- Telegram only (recommended — bot gets own identity)
- WhatsApp only
- Both

### Telegram setup

If Telegram selected:

1. Tell the user:
   > Create a Telegram bot:
   > 1. Open @BotFather in Telegram
   > 2. Send /newbot
   > 3. Pick a name and username
   > 4. Copy the token

2. Add to `.env`:
   ```
   TELEGRAM_BOT_TOKEN=<token>
   ```

3. If Telegram-only, add:
   ```
   TELEGRAM_ONLY=true
   ```

### WhatsApp setup

If WhatsApp selected:

1. Run the app temporarily to get QR code:
   ```bash
   npm run build && node dist/index.js
   ```
2. Scan QR code with WhatsApp
3. Stop the process (Ctrl+C)

## Phase 4: Build and start

```bash
npm run build
```

### Service setup

AskUserQuestion: Set up as a background service? (Yes / No, I'll run it manually)

If yes, detect OS:

**macOS:**
Create `~/Library/LaunchAgents/com.nanoclaw.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.nanoclaw</string>
    <key>ProgramArguments</key>
    <array>
        <string>NODE_PATH</string>
        <string>PROJECT_ROOT/dist/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>PROJECT_ROOT</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:HOME/.local/bin</string>
        <key>HOME</key>
        <string>HOME</string>
    </dict>
    <key>StandardOutPath</key>
    <string>PROJECT_ROOT/logs/nanoclaw.log</string>
    <key>StandardErrorPath</key>
    <string>PROJECT_ROOT/logs/nanoclaw.error.log</string>
</dict>
</plist>
```

Replace NODE_PATH, PROJECT_ROOT, HOME with actual values.

```bash
mkdir -p PROJECT_ROOT/logs
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
```

**Linux:**
Create systemd user service and enable it.

## Phase 5: Register main chat

Start the service and wait for connection.

**Telegram:** Tell the user to send `/chatid` to their bot. They'll get back `tg:XXXXXXX`. Register it:

```bash
node -e "
const { initDatabase, setRegisteredGroup } = require('./dist/db.js');
initDatabase();
setRegisteredGroup('CHAT_JID', {
  name: 'BOTNAME Main',
  folder: 'main',
  trigger: '@BOTNAME',
  added_at: new Date().toISOString(),
  requiresTrigger: false,
});
console.log('Main group registered');
"
```

Create group directory:
```bash
mkdir -p groups/main/logs
```

Restart the service.

## Phase 6: Soul building (onboarding)

This is what makes GhostClaw different. After the bot is running, build its personality.

AskUserQuestion: "Tell me about yourself — what do you do, what are you building, what matters to you? (A few sentences is fine)"

AskUserQuestion: "How do you like AI to communicate? Pick what resonates:"
- Direct and short — no fluff
- Detailed and thorough
- Casual and conversational
- Technical and precise

AskUserQuestion: "Any words, phrases, or patterns you hate in AI responses? (e.g. 'leverage', emoji, 'Great question!')"

AskUserQuestion: "What should the bot proactively help with?"
- Email monitoring
- News/trend watching
- Code review reminders
- Morning briefings
- Nothing — just respond when asked

### Generate the soul

Based on answers, write `groups/main/CLAUDE.md` with:

1. **Identity section** — bot name, what it does
2. **Soul section** — communication style, banned patterns, user context
3. **Capabilities section** — what it can do (tools, scheduling, web access)
4. **Admin section** — file paths, group management, IPC instructions

Use the answers to craft specific instructions. Examples:

If "direct and short":
```
Don't over-explain. Short answers. Show the work, don't narrate it. Two lines, not ten.
```

If banned words provided:
```
Never use these words: [list]. No filler. Write like Orwell.
```

If proactive monitoring selected, also set up the heartbeat:
```bash
# Create HEARTBEAT.md and register the scheduled task
```

### Write memory seed files

Based on user description, create initial memory files:
- `groups/main/about-user.md` — what they told you about themselves
- `groups/main/preferences.md` — communication and tool preferences

## Phase 7: Verify

Tell the user to send a message to the bot. Check logs to confirm it responds.

```bash
tail -20 logs/nanoclaw.log | grep -E "Processing|Agent output|error"
```

If working: "You're set. Talk to BOTNAME — it knows who you are."

## Phase 8: Optional extras

After core setup, offer:

- `/add-heartbeat` — periodic monitoring checks
- `/add-morning-briefing` — scheduled briefings
- `/add-gmail-agent` — email access for the bot
- `/add-voice` — voice note transcription (needs OpenAI key)
