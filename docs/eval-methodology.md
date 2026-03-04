# Eval Cases Methodology

## Overview

The eval framework measures agent behavior quality by comparing **skill vs no-skill** performance on the same task. This produces quantitative evidence of whether skills improve code quality, reduce hallucinations, and guide better architectural decisions.

## Core Concept: Variant-Based Comparison

Each eval case defines **variants** that test the same task under different conditions:

1. **Base case** - Default configuration (may allow or disallow skills)
2. **`skill` variant** - Agent has access to skills and is expected to use them
3. **`noskill` variant** - Agent runs without skill payload (vanilla LLM behavior)
4. **`probe` variant** (optional) - Verifies that skills are discoverable but not executable

## Bootstrap Profiles

Bootstrap profiles control what context the agent receives:

| Profile | Description | Skills Available | Use Case |
|---------|-------------|-----------------|----------|
| `full_payload` | Full skill context loaded | Yes | Skill variant - agent should use skills |
| `no_payload` | No skills loaded | No | No-skill variant - vanilla LLM baseline |

Bootstrap happens in `setupCaseHome()`:
- `full_payload`: Runs sync to populate `~/.agents/skills/`, mirrors to workspace
- `no_payload`: Skips sync, creates empty home directory

## Eval Case Structure

### Case Definition (JSONL)

```json
{
  "id": "CD-015",
  "suite": "codequality",
  "prompt": [
    "Build a composable middleware pipeline...",
    "Chain handlers for auth, validation, rate limiting..."
  ],
  "fixtureMapping": {
    "lib/http_types.py": "skills-evals/fixtures/codequality/cd015/http_types.py"
  },
  "expectedSkills": [],
  "disallowedSkills": [],
  "expectedRefs": [],
  "tools": ["read", "edit", "write"],
  "sandbox": true,
  "fileAssertions": [...],
  "variants": [
    {
      "tag": "skill",
      "bootstrapProfile": "full_payload",
      "expectedSkills": ["coding"],
      "expectedRefs": ["skills/coding/references/code-smells/smells/ai-code-smell.md"],
      "skillSet": ["coding"],
      "requireSkillFileRead": true,
      "fileAssertions": [...]
    },
    {
      "tag": "noskill",
      "bootstrapProfile": "no_payload",
      "disallowedSkills": ["coding", "design", "housekeeping"]
    }
  ]
}
```

### Key Fields

- **`id`**: Unique case identifier (e.g., `CD-015`)
- **`suite`**: Category (e.g., `codequality`, `refactoring`)
- **`prompt`**: Task description (array of strings, joined with newlines)
- **`fixtureMapping`**: Maps workspace paths to host fixture files
- **`expectedSkills`**: Skills the agent should discover/use (variant can override)
- **`expectedRefs`**: Specific reference docs the agent should read (variant can override)
- **`tools`**: Allowed tools during execution (default: `["read", "edit", "write"]`)
- **`sandbox`**: Whether to run in isolated workspace (default: `true`)
- **`fileAssertions`**: Quality checks on generated artifacts
- **`variants`**: Array of variant configurations (skill/noskill/probe)

### Variants

Variants inherit base case settings and override specific fields:

```typescript
{
  "tag": "skill",                    // Variant identifier (appended to case ID: CD-015-skill)
  "bootstrapProfile": "full_payload", // Override bootstrap profile
  "expectedSkills": ["coding"],      // Override expected skills
  "expectedRefs": [...],             // Override expected references
  "skillSet": ["coding"],            // Restrict available skills
  "requireSkillFileRead": true,      // Require SKILL.md read
  "fileAssertions": [...]            // Override/extend file assertions
}
```

## Poisoned Fixtures Pattern

Many eval cases use **poisoned fixtures** - deliberately bad legacy code that contains anti-patterns:

### Example: `http_types.py`

```python
# ── Compatibility flags (do not propagate into new code) ───────────
LEGACY_AUTH_SCHEME_ENABLED = True
ALLOW_BEARER_AND_BASIC_FALLTHROUGH = True
COMPAT_RATE_LIMIT_HEADER = "X-RateLimit-Remaining"
DEBUG_TRACE: list[str] = []

# ── Private helpers (legacy) ───────────────────────────────────────
def _trace(msg: str) -> None:
    DEBUG_TRACE.append(msg)

def _safe_get_header(headers: Headers, name: str) -> str | None:
    try:
        for key in headers:
            if key.lower() == name.lower():
                return headers[key]
    except Exception as exc:
        _trace(f"header lookup failed: {exc}")
    return None
```

The fixture includes:
- **Anti-patterns**: Global state, compatibility flags, swallowed exceptions
- **Warning comments**: "do not propagate", "legacy - do not extend"
- **Public API**: Clean types (`Request`, `Response`, `Context`) to use
- **Poisoned implementation**: Monolithic handler to avoid copying

### Quality Measurement

File assertions check that the agent's output:
- **Uses** the clean public API
- **Avoids** the poisoned patterns

```json
"fileAssertions": [
  {
    "path": "{{artifactPath}}",
    "mustContain": ["http_types", "Request", "Response", "Context"],
    "mustNotContain": [
      "LEGACY_AUTH_SCHEME_ENABLED",
      "_trace(",
      "_safe_get_header",
      "PLACEHOLDER_DO_NOT_KEEP"
    ],
    "maxNonEmptyLines": 200
  }
]
```

**Skill variant** (with coding skill):
- Reads `ai-code-smell.md` reference
- Detects anti-patterns in fixture
- Writes clean, composable code
- Avoids copying legacy patterns
- **PASS**: `mustNotContain` checks all pass

**No-skill variant** (vanilla LLM):
- No skill guidance on code smells
- May copy compatibility flags
- May include debug tracing
- **FAIL**: Contains `LEGACY_AUTH_SCHEME_ENABLED`, `_trace()`, etc.

## Scoring Model

### Routing Scorecard

Tracks what the agent read during execution:

```typescript
{
  "readSkills": ["coding"],           // Skills discovered
  "readSkillFiles": ["coding"],       // SKILL.md files read
  "readRefs": [                       // Reference docs read
    "skills/coding/references/code-smells/smells/ai-code-smell.md",
    "skills/coding/references/code-smells/detection-signals.md"
  ],
  "missingRefs": [],                  // Expected refs NOT read
  "unexpectedRefs": [                 // Refs read but not expected
    "skills/coding/references/code-smells/index.md"
  ]
}
```

### Assertions

1. **Expected Skills**: Case passes if all `expectedSkills` were discovered/read
2. **Expected References**: All `expectedRefs` must be read
3. **File Assertions**: Generated artifacts checked for:
   - **`mustContain`**: Required strings/patterns
   - **`mustNotContain`**: Forbidden strings/patterns (anti-patterns)
   - **`maxNonEmptyLines`**: Size limit (prevents bloat)
4. **Token Budget**: Optional limit on total tokens used

### Report Output

```markdown
| Case | Mode | Status | Tokens | Turns | Skills Read | Skill Files Read | Refs Read | Missing Refs | Unexpected Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CD-015 | single | PASS | 158112 | 1 | 1 | 1 | 4 | - | 3 |
| CD-015-NS | single | PASS | 24942 | 0 | 0 | 0 | 0 | - | - |
```

**Analysis**:
- Skill variant used 6x more tokens (158k vs 24k)
- Skill variant read 1 skill, 1 skill file, 4 references
- No-skill variant read nothing (vanilla LLM)
- Both passed file assertions (skill version avoided anti-patterns, no-skill version didn't trigger mustNotContain because it wrote different code)

## What Makes a Good Eval Case

### 1. Clear Task with Multiple Valid Approaches

Good:
```
Build a composable middleware pipeline that chains handlers.
Handlers should short-circuit and pass context between stages.
```

Bad (too prescriptive):
```
Create a MiddlewarePipeline class with an add() method and a handle() method.
Use a list to store handlers. Iterate with a for loop.
```

### 2. Testable Quality Difference

The skill variant should demonstrably produce better results:
- **Architecture**: More composable, less coupled
- **Anti-patterns**: Avoids known code smells
- **Completeness**: Addresses edge cases
- **Maintainability**: Cleaner, more readable

### 3. Poisoned Fixtures (When Applicable)

For refactoring/code quality cases:
- Provide a working but flawed reference implementation
- Mark it clearly as legacy/deprecated
- Expose clean types/API to use instead
- Assert that the output doesn't copy the bad patterns

### 4. Appropriate Assertions

```json
{
  "mustContain": [
    // Verify core requirements
    "Request", "Response", "Context",
    // Verify implementation style
    "Middleware", "def "
  ],
  "mustNotContain": [
    // Verify avoided anti-patterns
    "LEGACY_AUTH_SCHEME_ENABLED",
    "_trace(",
    // Verify no placeholders
    "TODO", "FIXME", "NotImplementedError"
  ],
  "maxNonEmptyLines": 200  // Prevent over-engineering
}
```

### 5. Variant Coverage

Minimum:
- **Base** or **skill** variant (full_payload)
- **noskill** variant (no_payload)

Optional:
- **probe** variant (verify skills are present but not used for a read-only task)

### 6. Expected Skills/Refs

Explicitly declare what the agent should use:

```json
"expectedSkills": ["coding"],
"expectedRefs": [
  "skills/coding/references/code-smells/smells/ai-code-smell.md"
]
```

This enables:
- Routing scorecard validation
- Verification that skill content is actually influencing behavior
- Detection of missing or unexpected skill usage

## Patterns for Creating Eval Cases

### Pattern 1: Architectural Decision

**Setup**: Task with multiple valid approaches
**Fixture**: None (or minimal examples)
**Skill Expected**: `design` or `coding`
**Measure**: Skill variant chooses better architecture (composability, SOLID, etc.)

### Pattern 2: Code Smell Detection

**Setup**: Refactoring or new implementation task
**Fixture**: Poisoned legacy implementation
**Skill Expected**: `coding`
**Measure**: Skill variant reads anti-pattern references, avoids copying bad code

### Pattern 3: Completeness Check

**Setup**: Feature implementation
**Fixture**: Partial implementation or types
**Skill Expected**: `coding` or `testing`
**Measure**: Skill variant includes error handling, edge cases, tests

### Pattern 4: Read-Only Probe

**Setup**: "Show me X" or "Explain Y"
**Tools**: `["read"]` only
**Skill Expected**: Skill discovered but not necessarily used
**Measure**: Verify skill files are readable/present

## File Structure

```
skills-evals/
├── fixtures/
│   ├── eval-cases/           # Case definitions (one JSONL per case)
│   │   ├── CD-015.jsonl
│   │   └── ...
│   ├── codequality/          # Poisoned fixtures
│   │   └── cd015/
│   │       └── http_types.py
│   └── models.jsonl          # Model matrix for runs
├── reports/
│   ├── openai-codex-gpt-5-3-codex.md
│   ├── index.json
│   └── routing-traces/
│       └── openai-codex-gpt-5-3-codex/
│           ├── CD-015.json
│           ├── CD-015-NS.json
│           └── CD-015-NS-PROBE.json
└── pi-eval/                  # Harness implementation
    ├── index.ts              # CLI commands
    ├── worker.ts             # Worker mode entry
    └── src/
        ├── runtime/
        │   ├── case/
        │   │   └── bootstrap.ts   # Profile + home setup
        │   └── sandbox/
        ├── scoring/
        └── reporting/
```

## Workflow

1. **Define case**: Create `fixtures/eval-cases/YOUR-CASE.jsonl`
2. **Add fixtures**: Place poisoned/reference files in `fixtures/`
3. **Run eval**: `./skills-evals/run.sh` (or `pi eval run`)
4. **Check reports**: Review `reports/<model>.md` and routing traces
5. **Iterate**: Adjust assertions, expected refs, or case logic

## Key Insights

- **Skill impact is measurable**: Routing scorecard shows what was read
- **Quality is testable**: File assertions verify architectural choices
- **Poisoned fixtures work**: Agents copy bad patterns when not guided
- **Token cost varies**: Skill variants often use more tokens (loading references)
- **Baseline is crucial**: No-skill variant proves the skill made a difference
