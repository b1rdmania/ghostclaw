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

#### A. Deep Metaphors (BEST approach)
Find objects/processes that mirror the value:
- **Graft** - Adding new growth to established systems
- **Riff** - Jazz improvisation on existing melodies
- **Weft** - Threads that integrate into existing fabric
- **Patch** - Software/quilting term for adding without replacing
- **Seam** - Where old meets new

Think: farming, music, textiles, architecture, cooking, biology.
Generate 5 metaphor names with **real meaning**, not word salad.

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

### Step 4: Availability Checks

For each promising name candidate:

1. **Domain check** - Use the Namecheap MCP skill:
   ```
   Check if [name].com, [name].io, [name].ai are available
   ```

2. **Twitter check** - Search Twitter:
   ```
   Search Twitter for "@[name]" to see if handle is taken
   ```

3. **Basic trademark check** - Web search:
   ```
   Search "[name] trademark" and "[name] company" to flag obvious conflicts
   ```

4. **Google test** - Does it dominate results?
   ```
   Search "[name]" - if first page is all unrelated, it's unique
   ```

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
