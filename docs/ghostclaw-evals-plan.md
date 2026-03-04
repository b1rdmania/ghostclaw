# GhostClaw Skills Evaluation System - Implementation Plan

## Executive Summary

Adapt bout3fiddy/agents evaluation framework to measure GhostClaw skill quality. Focus on **routing accuracy**, **code quality improvement**, and **cost-effectiveness** rather than full sandbox reproduction.

**Effort Estimate**: 3-4 days implementation + 1-2 days eval case creation

**ROI**: High - enables data-driven skill development and quality measurement

---

## What to Adopt from Fiddy's Framework

### 1. **Eval Case Methodology** ✅ ADOPT (Day 1)
**Value**: Core concept - variant-based comparison proves skill impact

**What it is**:
- JSONL case definitions with skill vs no-skill variants
- Poisoned fixtures to test anti-pattern avoidance
- File assertions (`mustContain`, `mustNotContain`, `maxNonEmptyLines`)

**Why adopt**:
- Quantifiable proof that skills improve agent behavior
- Lightweight - just JSON schemas + assertions
- Already well-documented in our analysis

**Implementation**:
```
ghostclaw/
├── evals/
│   ├── fixtures/
│   │   └── eval-cases/
│   │       ├── GC-001.jsonl  # Skill discovery test
│   │       ├── GC-002.jsonl  # Code quality test
│   │       └── ...
│   └── poisoned/
│       └── legacy-code-samples/
```

**Complexity**: LOW - mostly data files

---

### 2. **Routing Scorecard** ✅ ADOPT (Day 2)
**Value**: Tracks what skills/references agents actually read

**What it is**:
```typescript
{
  "readSkills": ["setup-ghostclaw"],
  "readRefs": ["setup-ghostclaw/soul-prompt.md"],
  "missingRefs": [],
  "unexpectedRefs": []
}
```

**Why adopt**:
- Validates agents use skills correctly
- Detects when agents ignore guidance
- Lightweight instrumentation

**Implementation**:
- Hook into agent Read tool in `container/agent-runner/src/index.ts`
- Pattern match paths: `.claude/skills/<name>/skill.ts` → skill read
- Track expected vs actual reads
- Write routing trace to IPC on completion

**Complexity**: LOW-MEDIUM - ~200 lines of instrumentation

---

### 3. **Token/Cost Tracking** ✅ ADOPT (Day 2)
**Value**: Measure cost of skill-guided vs vanilla runs

**What it is**:
```typescript
{
  "tokens": {
    "input": 21511,
    "output": 4249,
    "cacheRead": 132352,
    "totalTokens": 158112
  }
}
```

**Why adopt**:
- Skills add token cost - need to quantify ROI
- Claude SDK already exposes token counts
- Essential for cost-benefit analysis

**Implementation**:
- Capture from Claude SDK response metadata
- Per-turn breakdown already available
- Write to routing trace JSON

**Complexity**: LOW - data already available

---

### 4. **File Assertions** ✅ ADOPT (Day 3)
**Value**: Automated quality checks on agent output

**What it is**:
```json
"fileAssertions": [
  {
    "path": "{{artifactPath}}",
    "mustContain": ["Request", "Response"],
    "mustNotContain": ["LEGACY_FLAG", "TODO"],
    "maxNonEmptyLines": 200
  }
]
```

**Why adopt**:
- Objective pass/fail criteria
- Prevents regression
- Simple string matching + line counting

**Implementation**:
- TypeScript validator reads generated files
- String contains/excludes checks
- Line counter (non-empty, non-comment)

**Complexity**: LOW - ~100 lines

---

### 5. **Bootstrap Profiles** ⚠️ ADOPT SIMPLIFIED (Day 1)
**Value**: Control skill availability per variant

**What Fiddy does**:
- `full_payload`: Sync all skills via `bin/sync.sh`
- `no_payload`: Empty skill directory

**GhostClaw adaptation**:
- `full_payload`: Normal `.claude/skills/` directory
- `no_payload`: Empty or disabled skills directory
- NO SYNC - skills already installed via setup

**Why simplify**:
- GhostClaw skills are TypeScript (not markdown directories)
- No sync needed - skills live in `.claude/skills/`
- Just toggle skill availability

**Implementation**:
- Create isolated session dirs: `data/sessions/eval-{uuid}/.claude/skills/`
- Copy skills for full_payload, skip for no_payload
- Use `CLAUDE_CONFIG_DIR` override

**Complexity**: LOW - directory management

---

## What to Skip

### ❌ SKIP: Gondolin Sandbox (Too Complex)
**What it is**: QEMU-based VM sandbox for isolated agent execution

**Why skip**:
- High complexity (VM orchestration, checkpointing, image management)
- GhostClaw already has process isolation via `container-runner.ts`
- Adds 1-2 weeks of integration work
- Limited benefit - skills don't need VM-level isolation

**Alternative**: Use existing process isolation + temp directories

---

### ❌ SKIP: Pi Agent Integration (Not Applicable)
**What it is**: Fiddy's evals extend the Pi coding agent

**Why skip**:
- GhostClaw uses Claude SDK directly
- Pi integration requires rewriting eval harness
- No value - we already have agent runtime

**Alternative**: Instrument existing agent-runner

---

### ❌ SKIP: RPC Event Streaming Diagnostics (Low ROI)
**What it is**: Deep protocol instrumentation (turn counts, message deltas, tool streaming)

**Why skip**:
- Nice-to-have but not essential
- High implementation cost (~400 lines)
- Debugging value only - doesn't measure skill quality
- Can add later if needed

**Alternative**: Basic turn count + success/failure tracking

---

### ⚠️ SKIP FOR NOW: Router Artifact Validation (Later)
**What it is**: Schema validation for `skills.router.min.json`

**Why defer**:
- GhostClaw doesn't use router artifacts yet
- Validation is useful but not blocking
- Can add when skill routing becomes complex

**When to revisit**: If we add 10+ skills

---

## Proposed GhostClaw Architecture

### Directory Structure
```
ghostclaw/
├── evals/
│   ├── fixtures/
│   │   ├── eval-cases/           # JSONL case definitions
│   │   │   ├── GC-001.jsonl
│   │   │   └── ...
│   │   └── poisoned/             # Legacy code samples
│   │       └── bad-patterns.ts
│   ├── reports/
│   │   ├── routing-traces/       # Per-run telemetry
│   │   │   └── sonnet-4.5/
│   │   │       ├── GC-001.json
│   │   │       └── GC-001-NS.json
│   │   └── summary.md            # Scorecard table
│   ├── runner/
│   │   ├── case-loader.ts        # Parse JSONL, validate schema
│   │   ├── executor.ts           # Run agent with variant config
│   │   ├── assertions.ts         # File assertion checks
│   │   ├── reporting.ts          # Generate markdown reports
│   │   └── index.ts              # CLI entry point
│   └── schemas/
│       └── eval-case.schema.json # Case definition schema
```

### Agent Instrumentation

**Location**: `container/agent-runner/src/telemetry.ts` (NEW)

**What to track**:
```typescript
interface RoutingTrace {
  caseId: string
  variant: 'skill' | 'noskill'
  status: 'pass' | 'fail'
  runTimestamp: string

  // Routing
  expectedSkills: string[]
  readSkills: string[]
  expectedRefs: string[]
  readRefs: string[]
  missingRefs: string[]
  unexpectedRefs: string[]

  // Tokens
  tokens: {
    input: number
    output: number
    cacheRead: number
    totalTokens: number
  }

  // Basic metrics
  turns: number
  durationMs: number

  // Assertions
  fileAssertions: {
    path: string
    passed: boolean
    failures: string[]
  }[]
}
```

**How to capture**:
1. Hook Read tool calls → match paths to skill reads
2. Hook Claude SDK responses → extract token counts
3. Write trace to `$GHOSTCLAW_IPC_DIR/eval-traces/<case-id>.json`
4. Eval runner collects traces after execution

---

### Eval Case Schema

**File**: `evals/schemas/eval-case.schema.json`

```json
{
  "id": "GC-001",
  "description": "Verify agents discover and use skills",
  "prompt": [
    "Set up GhostClaw for a new user.",
    "Follow best practices from available skills."
  ],
  "expectedSkills": ["setup-ghostclaw"],
  "expectedRefs": ["setup-ghostclaw/soul-prompt.md"],
  "variants": [
    {
      "tag": "skill",
      "bootstrapProfile": "full_payload",
      "requireSkillRead": true
    },
    {
      "tag": "noskill",
      "bootstrapProfile": "no_payload"
    }
  ],
  "fileAssertions": [
    {
      "path": "groups/main/CLAUDE.md",
      "mustContain": ["## Soul"],
      "mustNotContain": ["TODO", "placeholder"]
    }
  ]
}
```

**Minimal required fields**:
- `id`, `description`, `prompt`
- `variants` (at least skill + noskill)
- Optional: `expectedSkills`, `expectedRefs`, `fileAssertions`

---

### CLI Interface

```bash
# Run all eval cases
npm run eval

# Run specific case
npm run eval -- --case GC-001

# Run specific variant
npm run eval -- --case GC-001 --variant skill

# Generate report
npm run eval -- --report
```

**Implementation**: `evals/runner/index.ts` with yargs CLI

---

## Development Roadmap

### Day 1: Foundation
- [ ] Create eval directory structure
- [ ] Define eval case JSON schema
- [ ] Implement case loader (parse JSONL)
- [ ] Implement bootstrap profiles (skill vs no-skill session setup)
- [ ] Write 1 minimal test case (GC-001: skill discovery)

**Deliverable**: Can load case definition and prepare isolated session

---

### Day 2: Instrumentation
- [ ] Add Read tool hook to track skill file reads
- [ ] Pattern matching for skill paths (`.claude/skills/<name>/skill.ts`)
- [ ] Extract token counts from Claude SDK responses
- [ ] Write routing trace JSON to IPC
- [ ] Test with GC-001 case

**Deliverable**: Routing trace JSON written after agent run

---

### Day 3: Assertions & Execution
- [ ] Implement file assertion validator
- [ ] String contains/excludes checks
- [ ] Line counting (non-empty)
- [ ] Executor orchestration (run variant, apply assertions)
- [ ] Pass/fail determination

**Deliverable**: Can run eval case and get pass/fail result

---

### Day 4: Reporting & Polish
- [ ] Markdown report generator
- [ ] Scorecard table (case | variant | status | tokens | skills read)
- [ ] Routing trace diff viewer (skill vs noskill comparison)
- [ ] CLI polish (progress bars, colored output)
- [ ] Error handling and validation

**Deliverable**: Complete eval system with reports

---

### Days 5-6: Eval Case Creation (Optional)
- [ ] GC-001: Skill discovery (already planned)
- [ ] GC-002: Code quality (poisoned fixture avoidance)
- [ ] GC-003: Cost analysis (measure skill overhead)
- [ ] GC-004: Routing accuracy (read expected references)
- [ ] GC-005: Multi-skill coordination

**Deliverable**: 5 eval cases covering core skill behaviors

---

## Success Metrics

### Immediate (Post-Implementation)
1. ✅ Eval harness runs without errors
2. ✅ Routing traces capture skill reads accurately
3. ✅ File assertions detect quality regressions
4. ✅ Reports show skill vs no-skill comparison

### Medium-Term (1 Month)
1. 📊 10+ eval cases covering all skills
2. 📈 Skill-guided runs show measurable quality improvement
3. 💰 Cost analysis proves skill ROI (quality gain > token cost)
4. 🔄 Evals run in CI on skill changes

### Long-Term (3 Months)
1. 📚 Eval cases inform skill improvements
2. 🎯 Routing accuracy > 90% (agents use expected skills)
3. 🚀 New skills validated with eval cases before merge
4. 📉 Regression prevention (no skill degradation)

---

## Risk Mitigation

### Risk: Evals take too long to run
**Mitigation**:
- Start with 3-5 quick cases (< 30s each)
- Add timeout controls
- Parallel execution if needed

### Risk: File assertions too brittle
**Mitigation**:
- Use regex patterns for flexibility
- Focus on anti-patterns (mustNotContain) over exact matches
- Allow optional assertions

### Risk: Skill reads not captured accurately
**Mitigation**:
- Test instrumentation thoroughly with known cases
- Log all file paths read during execution
- Manual spot-checks of routing traces

### Risk: No-skill variants still use skills
**Mitigation**:
- Physically remove `.claude/skills/` for no_payload
- Verify bootstrap in isolation
- Assert `readSkills: []` in no-skill traces

---

## Open Questions

1. **Model Matrix**: Should we test multiple models (Opus, Sonnet, Haiku)?
   - **Recommendation**: Start with Sonnet 4.5 only, add others later

2. **Fixture Management**: How to version poisoned fixtures?
   - **Recommendation**: Git-tracked files in `evals/fixtures/poisoned/`

3. **CI Integration**: Run evals on every commit or scheduled?
   - **Recommendation**: Scheduled (daily) to start, pre-commit for skill changes

4. **Eval Case Ownership**: Who writes/maintains eval cases?
   - **Recommendation**: Skill author writes eval case when adding new skill

---

## Cost-Benefit Analysis

### Implementation Cost
- **Development**: 3-4 days (~$800-1000 opportunity cost)
- **Maintenance**: ~1 hour/month (update cases as skills evolve)
- **Runtime**: ~$0.50-2/eval run (5 cases × 2 variants × ~$0.10/run)

### Benefits
- **Quality Assurance**: Prevent skill regressions (worth >> $1000)
- **Data-Driven Iteration**: Know which skills work (save 10+ hours trial/error)
- **User Confidence**: Prove skills improve agent behavior
- **Skill Development**: Clear criteria for skill quality

**ROI**: 10x+ (pays back in < 1 month via saved debugging time)

---

## Next Steps

1. **Approval**: Review this plan with stakeholders
2. **Spike**: 4-hour prototype (Day 1 tasks only) to validate approach
3. **Decision Point**: After spike, commit to full implementation or pivot
4. **Execution**: Follow roadmap if approved

---

## References

- [Eval Methodology Analysis](/Users/ziggy/nanoclaw/docs/eval-methodology.md)
- [Routing Traces Analysis](/Users/ziggy/nanoclaw/docs/agents-routing-traces-analysis.md)
- Fiddy's Framework: `bout3fiddy/agents` (better_evals branch)
