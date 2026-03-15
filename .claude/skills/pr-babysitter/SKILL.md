---
name: pr-babysitter
description: Set up automated PR monitoring. Watches GitHub repos for PRs with failing CI or unanswered review comments, fixes high-confidence issues automatically, and messages you when human input is needed. Triggers on "pr babysitter", "watch PRs", "monitor PRs", "pr monitor".
---

# PR Babysitter

Automated PR monitoring that only spawns an agent when there's actual work to do. Uses the scheduler's `pre_check` feature to run a lightweight `gh` CLI check first — zero API credits burned when all PRs are clean.

## Setup

### 1. Verify GitHub CLI

```bash
gh auth status
```

If not authenticated, run `gh auth login`.

### 2. Ask the user

Use `AskUserQuestion` for each:

1. **Which repos to watch?** Accept either:
   - Specific repos: `owner/repo1 owner/repo2`
   - All repos: `gh repo list --json nameWithOwner -q '.[].nameWithOwner'`
2. **How often to check?** Default: every 30 minutes (`*/30 * * * *`)
3. **What to watch for?** Default: all of the below. Let user pick:
   - Failing CI checks
   - Unanswered review comments (especially from AI reviewers)
   - Stale PRs (no activity for 48h+)
4. **Auto-fix?** Should the agent attempt high-confidence fixes (typos, linting, simple test fixes) or always ask first?

### 3. Create the scheduled task

Build a pre_check script and prompt based on user choices. Example for watching specific repos:

```bash
cat > $GHOSTCLAW_IPC_DIR/tasks/pr-babysitter_$(date +%s).json << 'TASKEOF'
{
  "type": "schedule_task",
  "pre_check": "REPOS=\"owner/repo1 owner/repo2\"; for repo in $REPOS; do gh pr list --repo $repo --state open --json number,title,headRefName,statusCheckRollup,reviewDecision,updatedAt --jq '.[] | select(.statusCheckRollup == \"FAILURE\" or .reviewDecision == \"CHANGES_REQUESTED\" or (.reviewDecision == \"\" and (.statusCheckRollup == \"PENDING\" or .statusCheckRollup == \"\")))' 2>/dev/null; done",
  "prompt": "You are a PR babysitter. These PRs need attention:\n\n{{pre_check_output}}\n\nFor each PR:\n1. Check CI status: `gh pr checks <number> --repo <repo>`\n2. Read review comments: `gh api repos/<owner>/<repo>/pulls/<number>/comments`\n3. If CI fails with a clear fix (linting, type error, simple test fix):\n   - Clone the repo, checkout the branch, fix it, push\n   - Comment on the PR: \"Fixed [issue] automatically\"\n4. If review comments are from AI reviewers and the suggestion is high-confidence:\n   - Implement the change, push, reply to the comment\n5. If it needs human judgement:\n   - Message me with: repo, PR number, what's wrong, what you think the fix is\n\nBe conservative. Only auto-fix things you're confident about. When in doubt, ask.",
  "schedule_type": "cron",
  "schedule_value": "*/30 * * * *",
  "context_mode": "isolated",
  "targetJid": "TARGET_JID"
}
TASKEOF
```

Replace `TARGET_JID` with the user's chat JID (get from registered groups).

### 4. Confirm setup

Tell the user:
- PR babysitter is active
- Checking every [interval] for [repos]
- Will auto-fix: [yes/no]
- To pause: "pause the PR babysitter" or "stop watching PRs"
- To check now: "check my PRs"

## Pre-check script details

The `pre_check` runs as a bash script before spawning the agent:
- **Exit 0 + no output** → nothing to do, agent not spawned (free)
- **Exit 0 + output** → PRs found, output passed to agent as `{{pre_check_output}}`
- **Exit non-zero** → something's wrong, agent spawned to investigate

The `gh pr list` with `--jq` filter only outputs PRs that actually need attention. If all PRs are green with no pending reviews, the output is empty and the agent is skipped entirely.

## Customising the pre_check

For users who want to watch all their repos:

```bash
"pre_check": "gh repo list --json nameWithOwner -q '.[].nameWithOwner' | while read repo; do gh pr list --repo $repo --state open --json number,title,headRefName,statusCheckRollup,reviewDecision --jq '.[] | select(.statusCheckRollup == \"FAILURE\" or .reviewDecision == \"CHANGES_REQUESTED\")' 2>/dev/null; done"
```

For users who only care about failing CI (not review comments):

```bash
"pre_check": "gh pr list --repo owner/repo --state open --json number,title,statusCheckRollup --jq '.[] | select(.statusCheckRollup == \"FAILURE\")'"
```

## Managing the babysitter

- **Pause**: Update task status to `paused` via IPC or ask the agent
- **Resume**: Update task status to `active`
- **Change repos**: Cancel old task, create new one with updated pre_check
- **Run now**: User can say "check my PRs now" — agent runs the same prompt manually
