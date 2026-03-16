# /design-init - Initialize Design Configuration

Create project-level design configuration files (`.design.json` and `.design.md`) that combine design system rules with Impeccable best practices.

## Purpose

The `/design-init` command sets up a two-layer design configuration for your project:

**Layer 1: Design System Rules** (`.design.json`)
- Fonts, colors, spacing, typography
- Project-specific design constraints
- Used for fast anti-pattern detection and normalization

**Layer 2: Design Philosophy** (`.design.md`)
- Project context and brand personality
- Design principles and guidelines
- UX writing voice and tone
- Used for deep design reviews and polish

## Usage

```bash
/design-init [directory]
```

**Arguments:**
- `directory` (optional): Project directory to initialize. Defaults to current directory.

## Behavior

### Interactive Setup

1. **Check for existing config**
   - If `.design.json` or `.design.md` exists, ask to overwrite or merge

2. **Choose starting point**
   ```
   Initialize from:
   1. Minimal starter (recommended for new projects)
   2. Emergence example (brutalist aesthetic)
   3. Velocity example (clean, modern)
   4. Custom (guided setup)
   ```

3. **Create `.design.json`**
   - Based on chosen template
   - User can customize fonts, colors, spacing

4. **Create `.design.md`**
   - Project context template
   - User fills in: project name, target audience, brand personality, design principles

5. **Confirm**
   ```
   ✓ Created .design.json
   ✓ Created .design.md

   Next steps:
   - Edit .design.md to add project context
   - Run /design-rules to view current config
   - Run /design-audit [file] to check compliance
   ```

## Templates

### Minimal Starter (`.design.json`)

```json
{
  "name": "Project Name",
  "version": "1.0.0",
  "fonts": {
    "heading": "Inter",
    "body": "Inter",
    "mono": "JetBrains Mono"
  },
  "colors": {
    "primary": "#000000",
    "secondary": "#666666",
    "background": "#FFFFFF",
    "text": "#000000"
  },
  "spacing": {
    "xs": "4px",
    "sm": "8px",
    "md": "16px",
    "lg": "24px",
    "xl": "32px",
    "2xl": "48px"
  },
  "typography": {
    "h1": { "size": "48px", "lineHeight": "1.2", "weight": "700" },
    "h2": { "size": "36px", "lineHeight": "1.3", "weight": "700" },
    "h3": { "size": "24px", "lineHeight": "1.4", "weight": "600" },
    "body": { "size": "16px", "lineHeight": "1.6", "weight": "400" },
    "small": { "size": "14px", "lineHeight": "1.5", "weight": "400" }
  },
  "rules": [
    "Use design system fonts only",
    "Use design system colors only",
    "Use design system spacing scale only",
    "Maintain WCAG AA contrast ratios (4.5:1 for text)"
  ]
}
```

### Project Context Template (`.design.md`)

```markdown
# Design Configuration

## Project Overview

**Name:** [Project Name]
**Type:** [Landing page / SaaS app / Marketing site / etc.]
**Target Audience:** [Who is this for?]

## Brand Personality

Describe your brand in 3-5 adjectives (e.g., "Bold, playful, accessible"):
- [Adjective 1]
- [Adjective 2]
- [Adjective 3]

## Design Principles

List 3-5 core design principles for this project:

1. **[Principle Name]**: [Description]
2. **[Principle Name]**: [Description]
3. **[Principle Name]**: [Description]

## Typography Strategy

- **Headings:** [Font choice and why]
- **Body:** [Font choice and why]
- **Mono:** [Font choice and why]

## Color Strategy

- **Primary:** [Color and meaning/usage]
- **Secondary:** [Color and meaning/usage]
- **Accent:** [Color and meaning/usage]

## Spatial Design

- **Layout density:** [Compact / Balanced / Spacious]
- **Whitespace philosophy:** [Description]
- **Grid system:** [12-column / Custom / None]

## Motion & Animation

- **Approach:** [Minimal / Subtle / Expressive]
- **Timing:** [Fast (100-200ms) / Standard (300ms) / Slow (500ms+)]
- **Easing:** [Linear / Ease / Custom]

## UX Writing Voice

**Tone:** [Professional / Friendly / Playful / Authoritative / etc.]

**Examples:**
- Success: "[Example success message]"
- Error: "[Example error message]"
- Empty state: "[Example empty state message]"

## Reference Examples

List 2-3 sites/apps that inspire this design:

1. [URL] - [What you like about it]
2. [URL] - [What you like about it]

## Anti-Patterns to Avoid

Specific things to avoid in this project:

- [ ] [Anti-pattern 1]
- [ ] [Anti-pattern 2]
- [ ] [Anti-pattern 3]
```

## Examples

### Example 1: Initialize with minimal starter

```bash
/design-init
# → Creates .design.json and .design.md in current directory
# → Uses minimal starter template
```

### Example 2: Initialize from Emergence example

```bash
/design-init /path/to/project --from emergence
# → Creates config based on Emergence design system
# → Brutalist aesthetic with sharp edges
```

### Example 3: Custom guided setup

```bash
/design-init --custom
# → Interactive prompts for fonts, colors, spacing
# → Builds config step by step
```

## Implementation Steps

1. **Check directory**
   ```typescript
   const targetDir = args.directory || process.cwd()
   const configPath = path.join(targetDir, '.design.json')
   const contextPath = path.join(targetDir, '.design.md')
   ```

2. **Check for existing files**
   ```typescript
   if (fs.existsSync(configPath) || fs.existsSync(contextPath)) {
     // Ask to overwrite or merge
   }
   ```

3. **Prompt for template choice**
   ```typescript
   const choice = await askUser([
     "Minimal starter (recommended)",
     "Emergence example (brutalist)",
     "Velocity example (modern)",
     "Custom (guided setup)"
   ])
   ```

4. **Load template**
   ```typescript
   let template
   switch (choice) {
     case 'minimal':
       template = loadTemplate('examples/minimal.json')
       break
     case 'emergence':
       template = loadTemplate('examples/emergence.json')
       break
     case 'velocity':
       template = loadTemplate('examples/velocity.json')
       break
     case 'custom':
       template = await guidedSetup()
       break
   }
   ```

5. **Write config files**
   ```typescript
   fs.writeFileSync(configPath, JSON.stringify(template, null, 2))
   fs.writeFileSync(contextPath, generateContextTemplate(template.name))
   ```

6. **Confirm**
   ```typescript
   console.log('✓ Created .design.json')
   console.log('✓ Created .design.md')
   console.log('\nNext steps:')
   console.log('- Edit .design.md to add project context')
   console.log('- Run /design-rules to view current config')
   console.log('- Run /design-audit [file] to check compliance')
   ```

## Integration with Other Commands

- **`/design-rules`**: Displays the config created by init
- **`/design-audit`**: Uses `.design.json` for Layer 1 checks
- **`/design-normalize`**: Fixes violations against `.design.json` rules
- **`/design-apply`**: Generates components using design system from config
- **`/design-deep`**: Uses `.design.md` context for Layer 2 reviews

## Notes

- The `.design.json` file is **required** for all design commands
- The `.design.md` file is **optional** but recommended for deep reviews
- Both files should be committed to git for team consistency
- Update config as your design evolves - it's not set in stone

## Error Handling

**No write permission:**
```
Error: Cannot write to [directory]
Please check permissions or choose a different directory.
```

**Invalid template:**
```
Error: Template '[name]' not found
Available: minimal, emergence, velocity
```

**Existing config conflict:**
```
Found existing .design.json
Options:
1. Overwrite (lose current config)
2. Merge (keep existing values, add missing)
3. Cancel
```
