---
name: add-morning-briefing
description: Add scheduled briefings — morning summary, weekly review, and custom recurring prompts. No code changes, just well-crafted scheduled tasks.
---

# Add Morning Briefing

Registers scheduled tasks that run the agent with specific prompts on a cron. No code changes needed — this skill just creates IPC task files.

## Setup

### 1. Ask the user

Use AskUserQuestion to understand what they want:

- **Which briefings?** Morning summary / Weekly review / Both / Custom
- **What time?** Default: 8am weekdays for morning, 5pm Friday for weekly
- **What to include?** Weather, email, PRs, news, calendar, custom checks
- **Location?** For weather (default: London)

### 2. Register the tasks

For each briefing, write an IPC task file to `data/ipc/main/tasks/`.

Find the main group's chat JID first:

```bash
sqlite3 store/messages.db "SELECT jid FROM registered_groups WHERE folder = 'main' LIMIT 1;"
```

#### Morning Briefing (weekdays at 8am)

```bash
CHAT_JID="tg:414798121"  # Replace with actual JID
cat > data/ipc/main/tasks/morning_$(date +%s).json << EOF
{
  "type": "schedule_task",
  "prompt": "Morning briefing. Be concise — 5 lines max.\n\n1. Check the weather for London today\n2. Check Gmail for anything urgent in the last 12 hours\n3. Check for open PRs on my GitHub repos (gh pr list)\n4. Any scheduled tasks that failed overnight (check task_run_logs in the database)\n\nFormat as a quick summary. No greetings, no sign-off.",
  "schedule_type": "cron",
  "schedule_value": "0 8 * * 1-5",
  "context_mode": "isolated",
  "targetJid": "$CHAT_JID"
}
EOF
```

#### Weekly Review (Friday at 5pm)

```bash
cat > data/ipc/main/tasks/weekly_$(date +%s).json << EOF
{
  "type": "schedule_task",
  "prompt": "Weekly review. Check conversations/ folder for this week's conversation archives. Summarise:\n\n1. What we worked on this week\n2. What's still open or unfinished\n3. What to focus on next week\n\nKeep it to 10 lines. No fluff.",
  "schedule_type": "cron",
  "schedule_value": "0 17 * * 5",
  "context_mode": "isolated",
  "targetJid": "$CHAT_JID"
}
EOF
```

### 3. Customise the prompts

Adjust prompts based on user answers from step 1. Common additions:

- **Crypto prices**: "Check BTC and ETH price via web search"
- **News digest**: "Search Hacker News and TechCrunch for AI developments"
- **Calendar**: "Check Google Calendar for today's events" (requires calendar integration)
- **Project status**: "Check CI status for [repo] via gh run list"

### 4. Verify

```bash
sqlite3 store/messages.db "SELECT id, schedule_value, status, next_run FROM scheduled_tasks WHERE prompt LIKE '%briefing%' OR prompt LIKE '%review%';"
```

Check that tasks are active and next_run looks correct.

## Managing briefings

Tell the agent in the main channel:
- "Pause the morning briefing" — agent writes a pause_task IPC file
- "Change the morning briefing to 9am" — agent cancels and recreates
- "Add crypto prices to the morning briefing" — agent updates the task prompt

## Included templates

| Template | Schedule | What it checks |
|----------|----------|---------------|
| Morning briefing | Weekdays 8am | Weather, email, PRs, failed tasks |
| Weekly review | Friday 5pm | Conversation archives, open items |
