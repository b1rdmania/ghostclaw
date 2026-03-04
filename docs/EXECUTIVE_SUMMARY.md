# Executive Summary: Agent Development Research

**Date:** 2026-03-04
**Research Scope:** bout3fiddy/agents evaluation framework + marchatton/agent-skills methodology
**Total Analysis Time:** ~12 hours across 5 Ralph iterations

---

## What Fiddy's Eval Framework Does and Why It Matters

Fiddy's evaluation system is a **production-grade testing harness for AI agents** that answers the fundamental question: "Are our agents actually getting better when we add skills, or are we just hoping they are?" The framework runs agents through standardized test cases while capturing detailed telemetry—which skills were read, which references were consulted, how many tokens were consumed, and whether the output meets quality standards.

The methodology is elegant: run the same coding task twice—once with skills available (`skill` variant) and once without (`noskill` variant)—then compare the results. The `skill` variant has stricter assertions: it must avoid anti-patterns, produce more concise code, and demonstrate that it actually consulted the skill references. Fiddy uses "poisoned fixtures"—working code with intentional anti-patterns—to test whether agents blindly copy bad patterns or critically evaluate what they read. For example, a fixture might contain a 150-line monolithic function with inline warnings saying "don't copy this structure," and the test validates whether the skilled agent builds clean, composable middleware instead.

For GhostClaw, this matters because we have 22 skills but no systematic way to detect regressions. A change to the router, a skill's instructions, or the agent runtime could silently break workflows. Evals would give us immediate regression detection, quality assurance, cost tracking, and objective skill quality scores. When a user reports that `/setup-ghostclaw` didn't work, we could run the `GC-001-setup` test case and see exactly where routing failed. The framework's core value isn't the infrastructure (QEMU sandboxes, parallel execution)—it's the **methodology** of variant-based testing with routing scorecards and file assertions. We can adopt the concepts while skipping the enterprise complexity: use GhostClaw's existing process isolation, run tests serially, and instrument the agent-runner to track which skill files get read. Estimated MVP: 20 hours for 5 test cases.

## What Marc's Skills Repo Offers GhostClaw

Marc Hatton's agent-skills repository isn't a collection of ready-to-port skills—it's a **skill design methodology** demonstrated through three enterprise-focused examples (coding, design, housekeeping). The skills themselves are too specialized for a personal assistant (UI animation storyboards, monorepo housekeeping patterns), but the structural patterns are immediately valuable.

The standout contribution is the **progressive disclosure pattern**: instead of loading all reference materials upfront, skills use operation contracts to define triggers that load specific references on-demand. When a user mentions "telegram," load `telegram-setup.md`. When they mention "slack," load `slack-setup.md`. Never load everything at once. This is exactly what Fiddy's token cost metrics would reward—efficient context management. The second major contribution is the **code smells detection framework**: a catalog of 24 code smells with detection signals and refactoring guidance. While some smells are enterprise-specific (parallel inheritance hierarchies), 12 are universally applicable to personal projects—duplicate code, long methods, dead code, speculative generality. The framework integrates seamlessly with GhostClaw's existing `qodo-pr-resolver` skill to prevent agents from introducing anti-patterns during code reviews.

The other three patterns—GH PR review workflow, refactoring work package templates, and secrets/auth guardrails—are lower-effort, high-value additions. The PR review workflow automates gathering scattered review comments and CI failures into a fix plan. The work package template provides structured planning for complex refactors (perfect for Ralph task loops). The secrets guardrails are critical for preventing credential leaks—especially GhostClaw-specific patterns like never committing `auth_info_baileys/` or storing Telegram tokens outside environment variables.

Total porting effort: 25-35 hours over 3-4 weeks. Expected ROI: very high—these are proven patterns from production use, and the methodology scales to future skill development.

## Overall Recommendation: What to Prioritize

Both repositories solve the same problem from complementary angles: **Fiddy shows us how to know if agents work correctly** (testing/validation), while **Marc shows us how to make agents work correctly** (design methodology). They're not competing—they're two halves of a complete quality system.

**Recommended phased approach:**

**Phase 1: Quick Security & Pattern Wins (1 week, 9-12 hours)**
Start with secrets/auth guardrails (3-4 hours) for immediate security value—prevent credential leaks in all code operations. Then implement the progressive disclosure pattern (6-8 hours) as the foundation for all future skills. This reduces token costs immediately and sets up better eval cases later, since we'll be able to test that agents load references correctly, not just that they load them all.

**Phase 2: Evaluation Framework (2 weeks, 20 hours)**
Build Fiddy's eval MVP with 5 test cases covering core skills (setup, customize, add-telegram, debug, run-ralph). Use serial execution with ephemeral groups, routing scorecard validation, and token budget enforcement. Do this *after* Phase 1 so we can write better eval cases that validate progressive disclosure patterns. The result: automated regression detection, quality metrics for all 22 skills, cost tracking per skill, and confidence in releases.

**Phase 3: Skill Enhancements (2-3 weeks, 16-23 hours)**
Port the GH PR review workflow (4-6 hours), refactoring work packages (4-5 hours), and code smells framework (8-12 hours). These are incremental improvements that benefit from having evals in place to validate they work. The code smells framework is the largest effort but highest long-term value—transforms code quality in all agent-assisted development.

**Total investment:** 45-55 hours (5-7 weeks part-time), zero cost (all open source), very high ROI. After Phase 1, we'll have no more secret leaks and lower token costs. After Phase 2, we'll have automated regression detection and quality metrics. After Phase 3, we'll have superior code quality, better PR automation, and a complete skill development methodology.

**Critical success factors:** Keep the eval system simple (no VMs, serial execution), start with 5 cases and expand to 15 over time, document the progressive disclosure methodology as we implement it, and validate ROI at each phase before committing to the next. The research shows both repositories are production-proven—the question isn't *whether* to adopt these patterns, but *in what order*.

---

**Status:** ✅ Complete
**Next Action:** Review with user, begin Phase 1 (secrets guardrails + progressive disclosure)
