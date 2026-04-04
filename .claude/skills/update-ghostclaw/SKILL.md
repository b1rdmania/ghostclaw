---
name: update-ghostclaw
description: Safely update GhostClaw to the latest version. Backs up, pulls, migrates, rebuilds, restarts, and verifies.
---

# Update GhostClaw

Pulls the latest GhostClaw release, runs migrations, rebuilds, and restarts the service. Creates a backup tag before changing anything so the user can roll back.

## Steps

### 1. Preflight

**Memory warning:** Before proceeding, tell the user:

> "⚠️ Heads up: updating will reset your active session. If you want to preserve recent conversation context, back up your memory files first:
> - `groups/main/memory/` — identity, state, and log
> - `groups/main/CLAUDE.md` — personalised soul
>
> The update won't delete these files, but a fresh session after restart won't have the previous conversation in context."

Check that the working tree is clean:

```bash
git status --porcelain
```

If there's any output, stop and tell the user: "You have uncommitted changes. Commit or stash them first, then run `/update-ghostclaw` again."

Get the current version:

```bash
node -e "console.log(require('./package.json').version)"
```

Save this as `OLD_VERSION`.

Check for updates:

```bash
git fetch origin
git log HEAD..origin/main --oneline
```

If no new commits, tell the user: "GhostClaw is already up to date (v`OLD_VERSION`)." and stop.

Otherwise, show the user the list of incoming commits and how many there are. Ask: "These updates are available. Apply them?"

### 2. Backup

Create a backup tag so the user can roll back:

```bash
git tag "backup/pre-update-$(git rev-parse --short HEAD)-$(date +%s)"
```

Tell the user the tag name. Remind them they can roll back with:
```
git reset --hard <tag-name> && npm run build && launchctl kickstart -k gui/$(id -u)/com.ghostclaw
```

### 3. Pull

```bash
git merge origin/main
```

If there are merge conflicts, stop. Tell the user which files conflict and that they need to resolve manually. Do NOT force-resolve conflicts — this code runs bare metal with full system access.

### 4. Install dependencies and run migrations

```bash
npm install
```

This also runs the `postinstall` script which bootstraps `container/agent-runner`.

Get the new version:

```bash
node -e "console.log(require('./package.json').version)"
```

Save this as `NEW_VERSION`.

If `NEW_VERSION` differs from `OLD_VERSION`, run migrations:

```bash
npx tsx scripts/run-migrations.ts OLD_VERSION NEW_VERSION .
```

Report the migration results (how many ran, any failures).

If migrations fail, warn the user but continue — they may need to fix something manually.

### 4b. Check for template updates

If the upstream changed `groups/main/CLAUDE.md.template` or `groups/global/CLAUDE.md.template`, inform the user:

```bash
git diff HEAD~$(git log HEAD..origin/main --oneline | wc -l)..HEAD --name-only | grep 'CLAUDE.md.template'
```

If any templates changed, tell the user: "The CLAUDE.md template was updated upstream. Your personalised `groups/main/CLAUDE.md` is untouched — review the template changes if you want to incorporate any new sections."

### 5. Build and validate

```bash
npm run build
```

If the build fails, stop. Tell the user to check the error and fix it before restarting.

Run tests (non-blocking):

```bash
npm test
```

If tests fail, warn the user but don't block. They may have local customisations that diverge from upstream tests.

### 6. Hard reset sessions

Clear all stored sessions so agents start fresh after restart (stale sessions from the previous version can cause auth or execution errors):

```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database('store/messages.db');
const result = db.prepare('DELETE FROM sessions').run();
console.log('Cleared ' + result.changes + ' session(s)');
"
```

Report how many sessions were cleared.

### 7. Restart service

Detect the platform and restart:

**macOS (launchd):**
```bash
launchctl kickstart -k gui/$(id -u)/com.ghostclaw
```

**Linux (systemd):**
```bash
systemctl --user restart ghostclaw
```

**Fallback (nohup/other):**
Tell the user to restart manually.

To detect: check if `launchctl list 2>/dev/null | grep com.ghostclaw` finds something (macOS), otherwise check if `systemctl --user is-active ghostclaw 2>/dev/null` works (Linux).

### 8. Verify

Wait 3 seconds, then check the service is running:

**macOS:**
```bash
launchctl list | grep com.ghostclaw
```

**Linux:**
```bash
systemctl --user is-active ghostclaw
```

Report to the user:
- Old version → new version
- Number of commits applied
- Migration results (if any)
- Service status
- Backup tag for rollback

If the service isn't running, tell the user to check `logs/ghostclaw.error.log`.

## Rolling back

If something goes wrong after an update:

```bash
git reset --hard <backup-tag>
npm install
npm run build
# Then restart the service (launchctl/systemctl)
```

The backup tag is printed during step 2 and again in the final summary.
