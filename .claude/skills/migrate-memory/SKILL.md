---
name: migrate-memory
description: Migrate from monolith CLAUDE.md to the three-file memory system (identity + state + log). Non-destructive — backs up the original first.
---

# Migrate Memory

Migrates an existing GhostClaw group from the single-file CLAUDE.md memory system to the structured three-file system.

## What it does

1. Backs up the current `CLAUDE.md` to `CLAUDE.md.backup`
2. Creates `memory/identity.md` — extracts soul, personality, user info
3. Creates `memory/state.md` — extracts project status, current work
4. Creates `memory/log.md` — empty, ready for the agent to start logging
5. Rewrites `CLAUDE.md` to be instructions-only (no project data)

## Steps

### 1. Identify the group folder

Ask the user which group to migrate, or default to the main group:

```bash
GROUP_DIR="$GHOSTCLAW_GROUP_DIR"
```

### 2. Back up

```bash
cp "$GROUP_DIR/CLAUDE.md" "$GROUP_DIR/CLAUDE.md.backup"
```

### 3. Read the existing CLAUDE.md

Read the full file. Identify these sections:
- **Soul/personality** — voice, tone, communication style
- **About the user** — name, location, projects, key people
- **About the agent** — name, machine, accounts, capabilities
- **Project status** — active projects, parked projects, shipped work
- **Admin/technical** — file paths, IPC, scheduling, group management

### 4. Create memory/identity.md

Extract soul + user info + agent info into this structure:

```markdown
# Identity

## Soul

[paste soul/personality section]

## About the User

[paste user details]

## About Me

[paste agent details — name, machine, accounts]
```

### 5. Create memory/state.md

Extract project status into this structure:

```markdown
# Current State

Last updated: [today's date]

## Active Projects

[active projects with current status]

## Parked

[inactive/shipped projects]

## Recent Decisions

[leave empty — agent will start populating this]
```

### 6. Create memory/log.md

```markdown
# Log

Append-only. Most recent first. Never edit old entries — only prepend new ones.

---

## [today's date]
- Migrated to three-file memory system (identity + state + log)
```

### 7. Rewrite CLAUDE.md

Replace the CLAUDE.md with the instructions-only template from `.claude/skills/setup-ghostclaw/templates/CLAUDE.md`.

If the template doesn't exist, use this structure:

```markdown
# Assistant

You are a personal AI assistant running on a dedicated machine.

## Memory

Your memory lives in `memory/`. Read these files at the start of every conversation:

| File | What it is | How it changes |
|------|-----------|----------------|
| `memory/identity.md` | Who you are, who the user is, personality | Rarely — only when facts change |
| `memory/state.md` | Active projects, current status, recent decisions | After every meaningful conversation |
| `memory/log.md` | Append-only history of what happened and when | Prepend new entries, never edit old ones |

**CRITICAL — Before responding to ANY message, you MUST use the Read tool to read `memory/state.md`.** Do this BEFORE generating any response. If you skip this step, your answers will be wrong.

On your **first message of a session only**, also read `memory/identity.md`. You don't need to re-read it after that — identity rarely changes.

### When to update memory

**Update `memory/state.md`** when:
- A project's status changes (started, shipped, paused, blocked)
- New project or work stream begins
- A decision is made that affects what you're working on
- Update the "Last updated" date when you edit this file

**Prepend to `memory/log.md`** when:
- Work is completed (shipped a feature, sent emails, finished research)
- A significant decision is made (chose a tool, changed direction, agreed on a plan)
- Format: `## YYYY-MM-DD` header, bullet points underneath, most recent first

**Don't log** routine messages, simple Q&A, or work that didn't change anything.

**Don't put project details in this file.** This file is for instructions. Memory lives in `memory/`.
```

Keep the Communication, File Paths, Scheduling Tasks, and Global Memory sections from the template.

### 8. Confirm

Tell the user:
- Backup saved to `CLAUDE.md.backup`
- Memory split into `memory/identity.md`, `memory/state.md`, `memory/log.md`
- CLAUDE.md rewritten as instructions-only
- To revert: `cp CLAUDE.md.backup CLAUDE.md && rm -rf memory/`

### 9. Restart

Restart GhostClaw so the agent picks up the new structure:

```bash
# macOS
launchctl kickstart -k gui/$(id -u)/com.ghostclaw
# Linux
systemctl --user restart ghostclaw
```
