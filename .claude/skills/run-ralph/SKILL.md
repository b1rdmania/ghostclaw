---
name: run-ralph
description: Start, stop, or check status of a Ralph autonomous task loop. Runs a checklist of tasks overnight — one per fresh context window, commits after each, messages progress.
---

# Run Ralph — Autonomous Task Loop

Runs a markdown task file (checkboxes) as an autonomous loop. Each task gets a fresh agent with a fresh context window. After completing a task, the agent commits, the orchestrator marks it done, and schedules the next. Messages you with progress between iterations.

## Starting a Run

### 1. Create or identify the task file

The task file is standard markdown with checkboxes:

```markdown
# Feature: User Authentication

- [ ] Create user model with email and password fields
  POST /api/users table with bcrypt hashing
  Unit tests for model validation
- [ ] Add login endpoint with JWT
  POST /api/login returns token
  Returns 401 on invalid credentials
- [ ] Add registration endpoint
  POST /api/register with email verification
  Duplicate email returns 409
```

Rules for good task files:
- Each task must be completable in one agent session (one context window)
- Include acceptance criteria as indented lines below each checkbox
- Tasks run in order — put dependencies first
- Already-checked items `[x]` are skipped

### 2. Get the chat JID

```bash
sqlite3 store/messages.db "SELECT jid FROM registered_groups WHERE folder = 'main' LIMIT 1;"
```

### 3. Set iterations

Count the unchecked tasks in the task file. Set `maxIterations` to that count + 2 (buffer for retries). If unsure, ask the user: "You have N tasks — run all of them, or set a limit?"

Default is 10 if not specified. Can also be set via `RALPH_MAX_ITERATIONS` in `.env`.

### 4. Start the run

Write an IPC file:

```bash
CHAT_JID="<main chat JID>"
TASK_FILE="/absolute/path/to/tasks.md"
WORK_DIR="/absolute/path/to/project"
MAX_ITER=<task count + 2>

cat > data/ipc/main/tasks/ralph_start_$(date +%s).json << EOF
{
  "type": "start_ralph",
  "taskFile": "$TASK_FILE",
  "workDir": "$WORK_DIR",
  "targetJid": "$CHAT_JID",
  "maxIterations": $MAX_ITER,
  "notifyProgress": true
}
EOF
```

The bot will message you: "Ralph run started: ralph-{id}"

### 4. Monitor progress

Between each iteration, the bot messages you:
> Ralph [3/7]: Completed "Add login endpoint with JWT"

Check detailed progress:
```bash
cat data/ralph/ralph-{id}/progress.txt
```

Check run status:
```bash
cat data/ralph/ralph-{id}/config.json | python3 -m json.tool
```

## Stopping a Run

```bash
CHAT_JID="<main chat JID>"
RUN_ID="ralph-{id}"

cat > data/ipc/main/tasks/ralph_stop_$(date +%s).json << EOF
{
  "type": "stop_ralph",
  "runId": "$RUN_ID",
  "targetJid": "$CHAT_JID"
}
EOF
```

The bot will message: "Ralph run stopped: ralph-{id}"

## What happens on completion

When all tasks are checked off:
> Ralph run ralph-{id} completed. 5/5 tasks done in 5 iterations.

The task file will have all checkboxes marked `[x]`.

## What happens on failure

- **Task fails once**: Retried on the next iteration (same task, fresh context)
- **Task fails 3 times**: Skipped, bot messages you, moves to next task
- **Max iterations hit**: Run stops, bot tells you how many tasks completed
- **Service restart**: Run state is on disk (`data/ralph/{id}/config.json`), but the current iteration's scheduled task may need re-queuing

## Safety

- Each iteration runs in **isolated context** (fresh agent, no carried-over confusion)
- Max 10 iterations by default (configurable via `maxIterations` or `RALPH_MAX_ITERATIONS` in `.env`)
- Tasks that fail 3 times are skipped (configurable via `maxFailuresPerTask` in config.json)
- Agent is instructed to **commit after each task** — easy to roll back
- You can stop the loop at any time via the stop IPC command
- The task file is re-read each iteration — you can manually edit it between iterations
