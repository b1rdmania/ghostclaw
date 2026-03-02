---
name: add-update-check
description: Monthly check for GhostClaw updates. Notifies the user when new commits are available. Never auto-updates — user reviews and applies manually.
---

# Add Update Check

Registers a monthly scheduled task that checks the GhostClaw repo for new commits and notifies the user if updates are available.

## Setup

Find the main group's chat JID:

```bash
sqlite3 store/messages.db "SELECT jid FROM registered_groups WHERE folder = 'main' LIMIT 1;"
```

Register the task:

```bash
CHAT_JID="<main chat JID>"
cat > data/ipc/main/tasks/update_check_$(date +%s).json << EOF
{
  "type": "schedule_task",
  "prompt": "Check for GhostClaw updates.\n\n1. Run: git fetch origin 2>&1\n2. Run: git log HEAD..origin/main --oneline\n3. If there are new commits, message the user with how many and a one-line summary of each.\n4. If no new commits, respond with <internal>GhostClaw is up to date</internal> and nothing else.\n\nWhen notifying about updates, always include:\n- Number of new commits\n- One-line summary of each\n- Remind them: 'Review the changes before applying. Run git diff HEAD..origin/main to see the full diff. When ready: git merge origin/main && npm run build && launchctl kickstart -k gui/$(id -u)/com.nanoclaw'\n- Remind them to review for security — this code runs with full system access.",
  "schedule_type": "cron",
  "schedule_value": "0 10 1 * *",
  "context_mode": "isolated",
  "targetJid": "$CHAT_JID"
}
EOF
```

This runs at 10am on the 1st of every month.

## What the user sees

If updates are available:
> 3 new GhostClaw commits available:
> - abc1234 Add heartbeat disk usage threshold config
> - def5678 Fix Telegram reconnection on network change
> - ghi9012 Update Grammy to 1.25
>
> Review the changes before applying. This code runs with full system access.
> Run `git diff HEAD..origin/main` to see the full diff.
> When ready: `git merge origin/main && npm run build`

If up to date: silence (wrapped in `<internal>` tags).

## Security note

This skill deliberately does NOT auto-update. The user must:
1. Review the diff
2. Understand what changed
3. Manually apply the update

GhostClaw runs bare metal with no sandboxing. Blindly pulling code is a security risk.
