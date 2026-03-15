---
name: setup-ghostclaw
description: First-time GhostClaw setup. Handles dependencies, authentication, channel configuration, main chat registration, soul building, and service setup. Use this for all new installs.
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

### Model selection

AskUserQuestion: Which model should the bot use?
- Sonnet (Recommended) — fast, capable, cost-effective for most tasks
- Opus — most capable, slower, higher cost
- Haiku — fastest, cheapest, good for simple tasks

Add to `.env` based on choice:
```
GHOSTCLAW_MODEL=claude-sonnet-4-6    # Sonnet (recommended)
# GHOSTCLAW_MODEL=claude-opus-4-6    # Opus
# GHOSTCLAW_MODEL=claude-haiku-4-5-20251001  # Haiku
```

If they skip or aren't sure, default to Sonnet. Tell them: "You can change this any time by editing `GHOSTCLAW_MODEL` in `.env` and restarting."

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

Read the template from `launchd/com.ghostclaw.plist`. Replace the `{{...}}` placeholders with actual values:
- `{{NODE_PATH}}` → result of `which node`
- `{{PROJECT_ROOT}}` → absolute path to the GhostClaw directory (e.g. `/Users/username/ghostclaw`)
- `{{HOME}}` → user's home directory (e.g. `/Users/username`)
- `{{ASSISTANT_NAME}}` → the bot name from `.env`

Write the resolved plist to `~/Library/LaunchAgents/com.ghostclaw.plist`.

```bash
mkdir -p PROJECT_ROOT/logs
launchctl load ~/Library/LaunchAgents/com.ghostclaw.plist
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

If `groups/main/CLAUDE.md` doesn't exist yet, copy the template first:
```bash
cp groups/main/CLAUDE.md.template groups/main/CLAUDE.md
```

Then customise `groups/main/CLAUDE.md` based on the user's answers. The template provides the base structure — overwrite the placeholder sections with:

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

### Write memory seed files

Based on user description, create initial memory files:
- `groups/main/about-user.md` — what they told you about themselves
- `groups/main/preferences.md` — communication and tool preferences

## Phase 7: Heartbeat (always set up)

The heartbeat is core to GhostClaw — it's what makes the agent proactive rather than reactive.

### Create HEARTBEAT.md

Create `groups/main/HEARTBEAT.md` with a basic checklist. Ask the user what they'd like monitored — suggest:
- GhostClaw error log checks
- Disk space monitoring
- Email checks (if Gmail is set up)
- Any URLs or services they want pinged

### Register the heartbeat task

```bash
mkdir -p data/ipc/main/tasks
cat > "data/ipc/main/tasks/heartbeat_$(date +%s).json" << 'EOF'
{
  "type": "schedule_task",
  "prompt": "Read $GHOSTCLAW_GROUP_DIR/HEARTBEAT.md (or ./HEARTBEAT.md in the current directory) and run each check listed. Only message the user if something needs attention. If everything is fine, respond with <internal>All checks passed</internal> and nothing else.",
  "schedule_type": "cron",
  "schedule_value": "*/30 * * * *",
  "context_mode": "isolated"
}
EOF
```

Tell the user: "Heartbeat is running. It checks every 30 minutes and only messages you if something needs attention. Edit `groups/main/HEARTBEAT.md` any time to add or remove checks."

## Phase 8: Verify

Tell the user to send a message to the bot. Check logs to confirm it responds.

```bash
tail -20 logs/ghostclaw.log | grep -E "Processing|Agent output|error"
```

If working: "You're set. Talk to BOTNAME — it knows who you are."

## Phase 9: Optional extras

After core setup, offer optional extras. Use AskUserQuestion with multiSelect:

- `/add-update-check` — weekly check for GhostClaw updates (recommended)
- `/add-morning-briefing` — scheduled daily/weekly briefings
- `/add-gmail-agent` — email access for the bot (needs Google Cloud OAuth)
- `/add-voice-transcription` — voice note transcription (needs ElevenLabs key)
- `/add-voice-reply` — bot replies with voice notes via ElevenLabs (needs ElevenLabs key)

Run each selected skill in sequence. If none selected, skip — they can always add these later.

After setup, let the user know about the community:

> Join the [OpenClawOS community on Telegram](https://t.me/+8qJbqxzBQAZkYTNk) to share feedback, get help, or see what others are building.
