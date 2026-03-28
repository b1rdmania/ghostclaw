# Contributing

## Skills (preferred)

Most new capabilities should be **skills** — markdown files in `.claude/skills/` that teach Claude how to add a feature. No source code changes needed.

See the [skills repo](https://github.com/b1rdmania/ghostclaw-skills) for examples. PR a new skill there, or add one directly to this repo.

Your skill should contain **instructions** Claude follows — not pre-built code. See `/add-telegram` for a good example. All skills are security-scanned before installation.

## Source code

**Welcome:** Bug fixes, security fixes, simplifications, performance improvements, reducing code.

**Discuss first:** New features or architectural changes. Open an issue before writing code — GhostClaw is intentionally lean (~4K LOC) and we want to keep it that way. If it can be a skill, it should be a skill.

## Before submitting

- Code compiles: `npm run build`
- Tests pass: `npm run test`
- Follows existing conventions

## Community

Join the [GhostClaw community on Telegram](https://t.me/+8qJbqxzBQAZkYTNk) for discussion.
