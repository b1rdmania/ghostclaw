---
name: add-voice-transcription
description: Add voice message transcription to GhostClaw using ElevenLabs Scribe API. Automatically transcribes voice notes so the agent can read and respond to them.
---

# Add Voice Transcription

This skill adds automatic voice message transcription using ElevenLabs Scribe API. When a voice note arrives, it is downloaded, transcribed, and delivered to the agent as `[Voice: <transcript>]`.

## Phase 1: Pre-flight

### Check if already applied

Read `.ghostclaw/state.yaml`. If `voice-transcription` is in `applied_skills`, skip to Phase 3 (Configure). The code changes are already in place.

### Ask the user

Use `AskUserQuestion` to collect information:

AskUserQuestion: Do you have an ElevenLabs API key?

If yes, collect it now. If no, direct them to create one at https://elevenlabs.io — sign up and get an API key from Settings > API Keys.

## Phase 2: Apply Code Changes

Run the skills engine to apply this skill's code package.

### Initialize skills system (if needed)

If `.ghostclaw/` directory doesn't exist yet:

```bash
npx tsx scripts/apply-skill.ts --init
```

### Apply the skill

```bash
npx tsx scripts/apply-skill.ts .claude/skills/add-voice-transcription
```

This deterministically:
- Adds `src/transcription.ts` (voice transcription module using ElevenLabs Scribe)
- Three-way merges voice handling into `src/channels/whatsapp.ts` (isVoiceMessage check, transcribeAudioMessage call)
- Three-way merges transcription tests into `src/channels/whatsapp.test.ts` (mock + 3 test cases)
- Updates `.env.example` with `ELEVENLABS_API_KEY`
- Records the application in `.ghostclaw/state.yaml`

If the apply reports merge conflicts, read the intent files:
- `modify/src/channels/whatsapp.ts.intent.md` — what changed and invariants for whatsapp.ts
- `modify/src/channels/whatsapp.test.ts.intent.md` — what changed for whatsapp.test.ts

### Validate code changes

```bash
npm test
npm run build
```

All tests must pass (including the 3 new voice transcription tests) and build must be clean before proceeding.

## Phase 3: Configure

### Get ElevenLabs API key (if needed)

If the user doesn't have an API key:

> I need you to create an ElevenLabs API key:
>
> 1. Go to https://elevenlabs.io and sign up (free tier available)
> 2. Go to Settings > API Keys
> 3. Click "Create API Key"
> 4. Copy the key
>
> The Scribe transcription API is included in all ElevenLabs plans.

Wait for the user to provide the key.

### Add to environment

Add to `.env`:

```bash
ELEVENLABS_API_KEY=<their-key>
```

### Build and restart

```bash
npm run build
launchctl kickstart -k gui/$(id -u)/com.ghostclaw  # macOS
# Linux: systemctl --user restart ghostclaw
```

## Phase 4: Verify

### Test with a voice note

Tell the user:

> Send a voice note in any registered chat (Telegram or WhatsApp). The agent should receive it as `[Voice: <transcript>]` and respond to its content.

### Check logs if needed

```bash
tail -f logs/ghostclaw.log | grep -i voice
```

Look for:
- `ElevenLabs transcription complete` — successful transcription with character count
- `ELEVENLABS_API_KEY not set` — key missing from `.env`
- `ElevenLabs STT failed` — API error (check key validity)
- `Failed to download audio message` — media download issue

## Troubleshooting

### Voice notes show "[Voice Message - transcription unavailable]"

1. Check `ELEVENLABS_API_KEY` is set in `.env`
2. Verify key works: `curl -s https://api.elevenlabs.io/v1/user -H "xi-api-key: $ELEVENLABS_API_KEY" | head -c 200`

### Voice notes show "[Voice Message - transcription failed]"

Check logs for the specific error. Common causes:
- Network timeout — transient, will work on next message
- Invalid API key — regenerate at https://elevenlabs.io Settings > API Keys
- Rate limiting — wait and retry

### Agent doesn't respond to voice notes

Verify the chat is registered and the agent is running. Voice transcription only runs for registered groups.
