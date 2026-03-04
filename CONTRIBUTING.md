# Contributing

## Source Code Changes

**Accepted:** Bug fixes, security fixes, simplifications, reducing code.

**Not accepted:** Features, capabilities, compatibility, enhancements. These should be skills.

## Skills

A [skill](https://code.claude.com/docs/en/skills) is a markdown file in `.claude/skills/` that teaches Claude Code how to transform a GhostClaw installation.

A PR that contributes a skill should not modify any source files.

Your skill should contain the **instructions** Claude follows to add the feature — not pre-built code. See `/add-telegram` for a good example.

### Testing

Test your skill by running it on a fresh clone before submitting. All skills are security-scanned before installation.

## Community

Join the [OpenClawOS Telegram group](https://t.me/+8qJbqxzBQAZkYTNk) for discussion.
