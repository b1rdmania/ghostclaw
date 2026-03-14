# /variant - Apply Variant.com Exports to Codebase

Apply Variant.com JSON exports to existing codebases, update components with variant data, and deploy to Vercel.

## What This Does

1. Reads Variant JSON export
2. Finds matching components in codebase (HTML or React)
3. Updates component properties with variant data
4. Commits changes
5. Pushes to git (triggers Vercel deployment)

## Usage

```
/variant path/to/variant-export.json
```

Or place `variant-export.json` in the project root and run:

```
/variant
```

## Workflow

### Step 1: Get Variant JSON Path

Ask user for path to Variant JSON export, or check current directory for `variant-export.json`.

### Step 2: Read and Parse Variant JSON

Expected structure:
```json
{
  "variants": [
    {
      "id": "variant-1",
      "name": "Value-First",
      "components": {
        "headline": {
          "text": "Design that drives revenue",
          "fontSize": "56px",
          "fontWeight": "700"
        },
        "subheadline": {
          "text": "Beautiful websites that convert",
          "fontSize": "24px"
        },
        "cta": {
          "text": "See our work",
          "backgroundColor": "#667eea"
        }
      },
      "metadata": {
        "focus": "ROI and results",
        "tone": "professional"
      }
    }
  ]
}
```

### Step 3: Detect File Type

Search codebase for matching components:

**For React/Next.js:**
- Look for `.tsx`, `.jsx` files
- Find components with matching structure (headline, subheadline, CTA)
- Match by class names, component names, or text content

**For HTML:**
- Look for `.html` files
- Find elements with matching classes or IDs
- Match by text content or structure

Auto-detect based on what's found.

### Step 4: Update Components

**For React:**
- Update component props or inline styles
- Preserve existing code structure
- Only modify variant-controlled properties

Example transformation:
```tsx
// Before
<h1>Old Headline</h1>

// After (using first variant)
<h1 style={{
  fontSize: '56px',
  fontWeight: '700'
}}>
  Design that drives revenue
</h1>
```

**For HTML:**
- Update text content
- Update inline styles or style attributes
- Preserve existing structure

### Step 5: Optionally Add A/B Testing

Ask user: "Add A/B testing wrapper with localStorage and analytics tracking?"

If yes, wrap component with variant selection logic (like HeroVariants.tsx pattern).

### Step 6: Commit and Push

```bash
git add .
git commit -m "Apply Variant export: [variant names]

Updated components:
- [component 1]
- [component 2]

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

git push
```

### Step 7: Verify Deployment

Show user:
- Files changed
- Commit hash
- Vercel deployment URL (if available from git push output)
- Next steps for testing

## Rules

1. **Strict Preservation**: Follow variant-workflow principles — copy values exactly
2. **No Cleanup**: Don't simplify gradients, round numbers, or extract styles
3. **Auto-detect Format**: HTML vs React based on codebase
4. **Single Responsibility**: Just apply variant data, don't refactor
5. **Git Push Only**: No Vercel CLI needed, git push triggers deployment

## Component Matching Strategy

### 1. By Structure
Look for components with matching structure:
- Has headline + subheadline + CTA
- Has similar nesting pattern
- Has similar class names

### 2. By Content
Match by existing text content:
- Find headline containing similar text
- Find CTA with button text

### 3. By Name
Match by component/file name:
- `Hero.tsx`, `HeroSection.tsx`
- `index.html`, `home.html`

### 4. Ask User
If multiple matches or unclear, show options and ask user to pick.

## Error Handling

- **No Variant JSON found**: Ask user for path
- **Invalid JSON**: Show error, ask user to fix
- **No matching components**: Ask user which file to update
- **Multiple matches**: Show options, let user pick
- **Git conflicts**: Show diff, ask user to resolve manually

## Example Session

```
User: /variant variant-export.json

Agent: Found variant-export.json with 3 variants:
  - variant-1-value (ROI-focused)
  - variant-2-creative (Story-driven)
  - variant-3-speed (Urgency-driven)

Searching codebase for matching components...

Found: src/components/Hero.tsx
  - Has headline, subheadline, cta structure
  - Matches expected component pattern

Apply first variant or add A/B testing wrapper?
1. Apply first variant only
2. Add A/B testing with all 3 variants

User: 2

Agent: Adding A/B testing wrapper...
Created: src/components/HeroVariants.tsx
  - Random variant assignment
  - localStorage persistence
  - Google Analytics tracking

Committing changes...
git add .
git commit -m "Apply Variant export: Value/Creative/Speed variants"
git push

✓ Pushed to main
✓ Vercel deployment triggered

Next steps:
- Check deployment at: https://your-site.vercel.app
- Verify variants look correct
- Test A/B testing in browser (check localStorage)
- Monitor analytics for variant performance
```

## Notes

- This skill follows the **variant-workflow** preservation principles
- Values are copied exactly as-is from Variant JSON
- No simplification, rounding, or cleanup
- Git push automatically triggers Vercel deployment (no CLI needed)