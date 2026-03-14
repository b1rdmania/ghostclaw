# Brand Naming Skill

A systematic approach to brand naming that avoids generic LLM suggestions and checks real-world availability.

## Goals

1. **Avoid the obvious** - No Forge, Apex, Velocity, Summit, Nexus, Vertex
2. **Check availability** - Domain, Twitter, basic trademark conflicts
3. **Be creative** - Use linguistic frameworks, not first-pass AI slop
4. **Memorable** - Pronounceable, spellable, distinctive

## Process

### Step 1: Understand the Brief

Ask the user about:
- **What it is** - Product, company, feature?
- **Target audience** - Enterprise? Developers? Consumers?
- **Positioning** - Fast? Premium? Simple? Innovative?
- **Vibe** - Professional? Playful? Technical? Human?
- **Must-haves** - Any requirements? (e.g., ".ai domain available")

### Step 2: Category Audit

Before suggesting names, check what competitors use:

```
Search for "[category] companies 2026" and note naming patterns.

Example: If naming an AI dev agency, check what other dev agencies are called.
Flag patterns like:
- "[Adjective] + AI" (avoid)
- "[Metal/Element]" (overdone)
- "[Speed word]" (cliche)
```

**Internal blacklist** (never suggest these):
- Forge, Apex, Velocity, Summit, Nexus, Vertex, Catalyst, Elevate
- Quantum, Neural, Synapse, Cortex, Axon
- Zenith, Pinnacle, Ascent, Rise, Uplift
- Bolt, Flash, Rocket, Lightning, Surge
- **Lumen, Aether, Veritas** - Latin/Greek cliches
- Any word that sounds like "I typed 'AI company name' into ChatGPT"

**Self-check before suggesting:**
- Would a human brand strategist laugh at this?
- Is this a word-association result or a real insight?
- Does this name tell a story or just sound modern?
- **Would you want this on your business card?** (Aesthetic test)
- **Does it sound beautiful when spoken aloud?** (Linguistic beauty)
- **Is it elegant or industrial?** (Graft = ugly, Tessera = elegant)

### Step 3: Think Like a Brand Strategist (Not an LLM)

**STOP. Do not proceed to frameworks yet.**

First, deeply understand the **actual problem being solved**:
- What pain does this solve?
- What's the emotional transformation?
- What metaphor captures the essence of the work?

**Example:**
- Bad: "AI dev agency" → Lumen, Vertex, Nexus (generic)
- Good: "Threading AI through legacy systems without disruption" → Graft, Weft, Seam (specific metaphors)

**Ask yourself:**
1. What **real-world objects or processes** mirror what this company does?
2. What **existing words** already capture the feeling/transformation?
3. What would a **human creative director** suggest if they couldn't use AI?

**Now generate using these approaches:**

#### A. Deep Metaphors with Aesthetic Beauty (BEST approach)

Find objects/processes that mirror the value AND sound beautiful:

**Good examples:**
- **Tessera** - Tile in a mosaic (integration + elegant sound)
- **Cadence** - Musical rhythm (harmony + flows beautifully)
- **Volta** - Turn in a poem (transformation + lyrical)
- **Noria** - Ancient water wheel (continuous motion + exotic beauty)
- **Selvedge** - Finished edge of fabric (precision + sophisticated)

**Bad examples (accurate but ugly):**
- ❌ Graft - Sounds like construction
- ❌ Weft - Harsh consonants
- ❌ Seam - Industrial, not elegant
- ❌ Patch - Too utilitarian

**Domains to explore:**
- Music: rhythm, harmony, improvisation, composition
- Poetry: verse, stanza, volta, caesura
- Art: mosaic, palette, canvas, pigment
- Nature: river, delta, confluence, estuary
- Architecture: arcade, colonnade, parapet, soffit
- Textiles: damask, brocade, ikat, batik

Generate 5 names that are:
1. Meaningful metaphors (not word salad)
2. Aesthetically beautiful (flows when spoken)
3. Slightly esoteric (not obvious but discoverable)
4. Professional yet elegant (not generic or industrial)

#### B. Meaningful Portmanteaus
Combine words that tell the story:
- Good: Shopify (shop + simplify), Pinterest (pin + interest)
- Bad: CodeAI, TechFlow, DataMind (lazy combinations)

Only use if the combination reveals insight.

#### C. Respellings (Use Sparingly)
Only if the original word is perfect but taken:
- Lyft (lift), Fiverr (fiver)
- Must be instantly recognizable

#### D. Invented Words (Last Resort)
Only create if metaphors don't land:
- Must be pronounceable first try
- Should suggest meaning through sound
- Test: would a human remember this?

### Step 4: Generate AND Check Availability (Do NOT Skip This)

**CRITICAL:** Do not present names to the user without checking availability first.

**Process:**
1. Generate 10-15 candidate names using the frameworks above
2. Check ALL of them for availability BEFORE showing to user
3. Only present names that pass all checks

**For each candidate, check:**

1. **Company existence** - Web search:
   ```
   Search "[name] company AI tech 2026"
   ```
   If there's a funded startup, public company, or major product with this name, **discard immediately**.

2. **Domain check** - Use Namecheap MCP:
   ```
   Check if [name].com, [name].io, [name].ai are available
   ```
   At minimum, need .ai or .io available. .com taken is acceptable if others are free.

3. **Twitter check** - Search:
   ```
   Search "@[name]" twitter
   ```
   If handle is taken by an active tech account, flag it.

**Only after filtering, present 3-5 names that:**
- Pass company existence check (no major conflicts)
- Have domains available (.ai or .io minimum)
- Are elegant AND meaningful

**If all names are taken:** Generate a new batch with more esoteric/unique words.

### Step 5: Linguistic Tests

For finalists, check:
- **Pronunciation** - Say it out loud. Awkward? Ambiguous?
- **Spelling** - Can someone spell it after hearing it once?
- **Cultural issues** - Does it mean something bad in other languages?
- **Length** - 2-3 syllables ideal, 4 max

### Step 6: Present Recommendations

Show 3-5 final options with:
- **Name** - The actual name
- **Why it works** - Brief rationale (1 sentence)
- **Availability** - Domains available, Twitter status
- **Risks** - Any concerns (trademark, pronunciation, etc)

Format:
```
## Top Recommendations

### 1. [Name]
**Why:** [One sentence rationale]
**Domains:** [name].com ✅ | [name].io ✅ | [name].ai ❌
**Twitter:** @[name] available
**Risks:** None identified

### 2. [Name]
...
```

## Anti-Generic Rules

**Never suggest names that:**
- End in "-ify", "-ly", "-io" (overused patterns)
- Use speed words (Fast, Quick, Rapid, Velocity, Bolt)
- Use height words (Apex, Summit, Peak, Zenith)
- Use forge/building metaphors (Forge, Build, Craft)
- Are just "[category]" + "AI" (e.g., "CodeAI", "DataAI")
- Sound like existing big tech (avoid anything close to Vercel, Supabase, etc)

**If you catch yourself suggesting these**, stop and use a different framework.

## Example Session

**User:** "I need a name for an AI dev agency that helps legacy companies ship AI features fast."

**Agent:**
1. Asks: "What vibe - professional/enterprise or approachable? Any domain requirements?"
2. Checks: What are other dev agencies called? (Thoughtbot, Hashrocket, etc - lots of metaphors)
3. Generates:
   - Portmanteaus: ShipMind, CodeCurrent
   - Metaphors: Conduit, Tether, Stitch
   - Made-up: Velza, Pixlo, Zephyr
4. Checks availability for top 5
5. Presents 3 finalists with reasoning

## Tools to Use

- **Namecheap MCP** (`/setup-namecheap-mcp` if not installed) - Domain checks
- **WebSearch** - Trademark checks, Twitter checks, competitor audit
- **WebFetch** - If need to scrape competitor lists

## Internal Use vs Public

**For internal use now:**
- Keep it simple, fast
- Focus on avoiding generics
- Manual checks are fine

**Future public version:**
- Add comprehensive trademark API
- Bulk domain checking
- Social handle checks across platforms
- Export report as PDF
- Could be a paid service ($29 for a naming report?)

## Notes

This skill works best when:
- You understand the positioning first
- You avoid first-pass AI suggestions
- You check real availability
- You give 3-5 options, not 20

Quality over quantity.
