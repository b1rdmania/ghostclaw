# Design Audit Command

**Trigger**: `/design audit [file]`

**Purpose**: Two-layer audit - first checks config violations against `.design.json`, then evaluates technical design quality against Impeccable principles.

---

## Two-Layer Audit Approach

**Layer 1: Config Compliance**
Check against project's `.design.json` rules - are you following your own design system?

**Layer 2: Technical Quality**
Check against Impeccable design principles (reference docs) - is your design system itself good?

**Key Insight**: You can be compliant with your config but still have poor design quality. Both layers matter.

---

## Usage

```bash
/design audit src/components/Button.tsx    # Audit single file
/design audit src/pages/HomePage.tsx       # Audit page component
/design audit                              # Audit recent changes (interactive)
```

---

## Detailed Process

### Layer 1: Config Compliance Check

1. **Load Project Config**
   ```bash
   # Read .design.json from project root
   # If missing, offer to run `/design init` first
   ```

2. **Parse Target File**
   - Extract all design-related code (CSS, Tailwind classes, inline styles, design tokens)
   - Build list of all design values used

3. **Check Each Category**

   #### Typography Compliance
   - Font families: Must be from `typography.fontFamily`
   - Font sizes: Must be from `typography.fontSize`
   - Font weights: Must be from `typography.fontWeight`
   - **Flag**: Any arbitrary values like `text-[17px]` or custom font names

   #### Color Compliance
   - All colors: Must be from `colors` array
   - Check: hex values, rgb/rgba, Tailwind classes
   - **Flag**: Any hardcoded colors like `#3B82F6` or `rgb(255,0,0)`

   #### Spacing Compliance
   - Margins, padding, gaps: Must be from `spacing` scale
   - **Flag**: Arbitrary values like `mt-[13px]` or `padding: 15px`

   #### Border Radius Compliance
   - All radius values: Must be from `borderRadius`
   - **Flag**: Custom values like `rounded-[12px]`

   #### Shadow Compliance
   - All box-shadow usage: Must be from `shadows`
   - **Flag**: Inline shadow definitions

   #### Breakpoint Compliance
   - Media queries: Must match `breakpoints`
   - **Flag**: Custom breakpoints like `@media (min-width: 850px)`

4. **Generate Layer 1 Report**
   ```
   ❌ Config Violations Found: 8 issues

   Colors (3 violations):
   - Line 45: #3B82F6 (not in palette, closest match: blue-500)
   - Line 67: rgba(255,0,0,0.5) (arbitrary red, use colors.red with opacity)
   - Line 89: text-[#333333] (use text-gray-800)

   Typography (2 violations):
   - Line 23: text-[17px] (arbitrary size, use text-lg from scale)
   - Line 102: font-[550] (arbitrary weight, use font-medium)

   Spacing (2 violations):
   - Line 67: mt-[13px] (arbitrary value, use mt-3)
   - Line 91: gap-[18px] (not in scale, use gap-4)

   Shadows (1 violation):
   - Line 34: box-shadow: 0 2px 8px rgba(...) (use shadow-md)

   ✅ No violations in: borderRadius, breakpoints
   ```

   **Decision Point**:
   - If **no violations**: Proceed automatically to Layer 2
   - If **violations found**: Show report, ask "Continue to Layer 2 quality check? (y/n)"

---

### Layer 2: Technical Design Quality

**Only runs if Layer 1 passes OR user confirms to continue.**

Check each design category against Impeccable best practices:

#### 1. Typography Quality (`reference/typography.md`)

**Checks**:
- [ ] Font sizes follow modular scale (not arbitrary jumps)
- [ ] Line heights appropriate for text size:
  - Body text: 1.5-1.75 (comfortable reading)
  - Headings: 1.1-1.3 (tighter for impact)
  - Small text: 1.4-1.6 (needs more breathing room)
- [ ] Letter spacing follows conventions:
  - Large headings: tighter (-0.02em to -0.05em)
  - Body text: normal (0)
  - Small text: slightly wider (+0.01em)
- [ ] Font weights used semantically:
  - Regular (400) for body
  - Medium (500-600) for emphasis
  - Bold (700+) for headings
  - Avoid decorative weight changes
- [ ] Text hierarchy clear and consistent
- [ ] Measure (line length) comfortable: 60-75 characters for body text
- [ ] No orphans/widows in critical headings

**Example Issues**:
```
⚠️ Typography Issues (3):
- Line 45: Line height 1.2 on body text (too tight, use 1.5-1.6)
- Line 67: Paragraph width 120ch (too wide, max 75ch recommended)
- Line 89: Inconsistent heading scale (h2 jumps from 24px to 48px)
```

#### 2. Color & Contrast Quality (`reference/color-and-contrast.md`)

**Checks**:
- [ ] WCAG AA contrast ratios met:
  - Body text: ≥4.5:1 against background
  - Large text (18px+): ≥3:1
  - Interactive elements: ≥3:1 for boundaries
- [ ] Color used consistently (same color = same meaning)
- [ ] Interactive elements have distinct hover/active states
- [ ] Color NOT sole indicator of meaning:
  - Error states use icon + color
  - Links have underline or other visual cue
  - Charts/graphs have patterns/labels
- [ ] Focus indicators clearly visible:
  - ≥3:1 contrast with background
  - ≥1px outline or 2px underline

**Example Issues**:
```
❌ Color & Contrast Issues (2):
- Line 34: gray-400 on white = 2.8:1 (fails WCAG AA, need 4.5:1)
- Line 78: Error shown only with red color (add icon for accessibility)

✓ Focus indicators meet standards
✓ Interactive states clearly defined
```

#### 3. Spatial Design Quality (`reference/spatial-design.md`)

**Checks**:
- [ ] Spacing follows consistent scale (e.g., 4px base: 8, 12, 16, 24, 32...)
- [ ] Visual hierarchy through spacing:
  - Related items closer together
  - Unrelated items farther apart
  - Section spacing > group spacing > item spacing
- [ ] Padding/margins feel balanced (not cramped or sparse)
- [ ] Elements aligned to implicit grid
- [ ] Visual rhythm evident (repeating spacing patterns)
- [ ] Adequate breathing room around interactive elements

**Example Issues**:
```
⚠️ Spatial Design Issues (2):
- Lines 23-45: Inconsistent card padding (mix of 16px, 20px, 24px)
- Line 67: Button too close to edge (8px margin, use 16px minimum)

✓ Good visual rhythm in grid layout
✓ Clear hierarchy through spacing
```

#### 4. Motion Design Quality (`reference/motion-design.md`)

**Checks**:
- [ ] Transitions have purpose (not just decoration)
- [ ] Duration appropriate:
  - Small changes: 150-200ms
  - Medium changes: 200-300ms
  - Large changes: 300-500ms
- [ ] Easing curves natural (ease-out for entrances, ease-in for exits)
- [ ] Motion respects `prefers-reduced-motion`
- [ ] No jarring or disorienting animations
- [ ] Consistent animation style across interface

**Example Issues**:
```
⚠️ Motion Design Issues (1):
- Line 56: Transition 100ms (too fast, feels jarring - use 200-250ms)
- Missing: prefers-reduced-motion support

✓ Easing curves natural (ease-out)
✓ Purposeful transitions (state changes only)
```

#### 5. Interaction Design Quality (`reference/interaction-design.md`)

**Checks**:
- [ ] Touch targets ≥44×44px on mobile (WCAG guideline)
- [ ] Hover states provide clear feedback
- [ ] Focus states visible for keyboard navigation:
  - All interactive elements focusable
  - Focus order logical (follows visual layout)
  - Skip links for keyboard users
- [ ] Loading states handled (spinners, skeleton screens)
- [ ] Disabled states clearly indicated (visual + aria-disabled)
- [ ] Interactive elements obviously clickable:
  - Buttons look like buttons
  - Links underlined or clearly styled
  - Cursor changes on hover

**Example Issues**:
```
❌ Interaction Design Issues (3):
- Line 34: Button 32×32px (too small, need 44×44px minimum)
- Line 67: No focus indicator on custom dropdown
- Line 89: Disabled button same color as enabled (use opacity or gray)

✓ Hover states clear and consistent
✓ Loading spinners implemented
```

#### 6. Responsive Design Quality (`reference/responsive-design.md`)

**Checks**:
- [ ] Mobile-first approach (base styles for small screens)
- [ ] Breakpoints used consistently (matching config)
- [ ] No horizontal scroll on any screen size
- [ ] Touch targets adequate on mobile (44×44px)
- [ ] Text readable on mobile (≥16px body text)
- [ ] Images/videos responsive (max-width: 100%)
- [ ] Navigation usable on mobile (hamburger or bottom bar)
- [ ] Forms mobile-friendly (large inputs, spacing between fields)

**Example Issues**:
```
⚠️ Responsive Design Issues (2):
- Line 45: Fixed width 1200px (causes horizontal scroll on tablet)
- Line 78: Text 14px on mobile (too small, use 16px minimum)

✓ Navigation collapses to hamburger on mobile
✓ Touch targets meet 44px standard
✓ No horizontal scroll detected
```

#### 7. UX Writing Quality (`reference/ux-writing.md`)

**Checks**:
- [ ] Button text action-oriented:
  - "Save changes" not "Submit"
  - "Create account" not "Sign up"
  - "Delete permanently" not "Delete"
- [ ] Labels clear and concise (avoid jargon)
- [ ] Error messages helpful:
  - State what's wrong
  - Explain how to fix it
  - Example: "Password must be 8+ characters" not "Invalid password"
- [ ] Placeholder text provides examples:
  - "jane@example.com" not "Email address"
- [ ] Microcopy adds clarity:
  - Helper text under complex inputs
  - Tooltips for unfamiliar terms
- [ ] Consistent terminology (e.g., don't mix "sign in" and "log in")

**Example Issues**:
```
⚠️ UX Writing Issues (2):
- Line 34: Button says "Submit" (use specific action like "Send message")
- Line 67: Error "Invalid input" (explain what's invalid and how to fix)

✓ Labels clear and concise
✓ Placeholder text provides examples
```

---

## Anti-Pattern Detection

Check against common mistakes from `reference/anti-patterns.md`:

- **Pixel Pushing**: Arbitrary values instead of scale (e.g., `mt-[13px]`)
- **Contrast Ignorance**: Text/background combinations below WCAG standards
- **Responsive Rigidity**: Fixed widths that break on mobile
- **Touch Target Tiny**: Buttons/links <44×44px on mobile
- **Motion Madness**: Overly long or purposeless animations
- **Color as Sole Signal**: Red/green without icons or text
- **Generic Microcopy**: "Click here" or "Submit" buttons
- **Inconsistent Spacing**: Mixing arbitrary values with scale
- **Font Weight Overload**: Too many weights (>3 in a component)
- **Z-Index Chaos**: Random z-index values instead of scale

**Flag each detected anti-pattern with**:
- Pattern name
- Line number(s)
- Why it's problematic
- How to fix it

---

## Final Report Format

```markdown
# Design Audit Report: ComponentName.tsx

**Date**: 2026-03-16
**Auditor**: Claude
**File**: src/components/Button.tsx

---

## Summary

| Category | Status | Issues |
|----------|--------|--------|
| **Layer 1: Config Compliance** | ❌ Violations | 8 |
| **Layer 2: Technical Quality** | 🟡 Good with issues | 12 |
| **Anti-Patterns** | ⚠️ 3 detected | 3 |

**Overall Grade**: C+ (needs work)

**Priority**: Fix 5 critical issues, then address 7 warnings

---

## Layer 1: Config Compliance

❌ **8 violations found**

### Colors (3 violations)
- Line 45: `#3B82F6` → Use `bg-blue-500` from palette
- Line 67: `rgba(255,0,0,0.5)` → Use `bg-red-500/50` from colors
- Line 89: `text-[#333]` → Use `text-gray-800` from scale

### Typography (2 violations)
- Line 23: `text-[17px]` → Use `text-lg` (18px) from scale
- Line 102: `font-[550]` → Use `font-medium` (500) from config

### Spacing (2 violations)
- Line 67: `mt-[13px]` → Use `mt-3` (12px) from scale
- Line 91: `gap-[18px]` → Use `gap-4` (16px) from scale

### Shadows (1 violation)
- Line 34: Inline shadow → Use `shadow-md` from config

✅ **No violations**: borderRadius, breakpoints

---

## Layer 2: Technical Quality

🟡 **12 issues found** (5 critical, 7 warnings)

### Typography (2 warnings)
- ⚠️ Line 45: Line height 1.2 on body text (too tight, use 1.5-1.6)
- ⚠️ Line 67: Paragraph width 120ch (too wide, max 75ch)

### Color & Contrast (2 critical)
- ❌ Line 34: gray-400 text on white = 2.8:1 contrast (need 4.5:1 for WCAG AA)
- ❌ Line 78: Error state uses only red color (add icon for accessibility)

### Spatial Design (2 warnings)
- ⚠️ Lines 23-45: Inconsistent card padding (16px, 20px, 24px mix)
- ⚠️ Line 67: Button 8px from edge (use 16px minimum)

### Interaction Design (3 critical)
- ❌ Line 34: Button 32×32px (too small, need 44×44px minimum)
- ❌ Line 67: No focus indicator on dropdown (add visible outline)
- ❌ Line 89: Disabled state unclear (same color as enabled)

### Responsive Design (2 warnings)
- ⚠️ Line 45: Fixed width 1200px (use max-width or responsive units)
- ⚠️ Line 78: Text 14px on mobile (use 16px minimum)

### UX Writing (1 warning)
- ⚠️ Line 34: Button says "Submit" (use specific action like "Send message")

✅ **Passed checks**: Motion design, visual hierarchy, focus order

---

## Anti-Patterns Detected

### 1. Pixel Pushing (Line 67)
**Pattern**: Using arbitrary `mt-[13px]` instead of scale value

**Why problematic**: Breaks spacing consistency, creates visual noise

**Fix**: Use `mt-3` (12px) or `mt-4` (16px) from spacing scale

### 2. Contrast Ignorance (Line 34)
**Pattern**: gray-400 on gray-100 background = 2.8:1 contrast

**Why problematic**: Fails WCAG AA, hard to read for users with low vision

**Fix**: Use gray-600 or darker (minimum 4.5:1 ratio)

### 3. Touch Target Tiny (Line 34)
**Pattern**: 32×32px button on mobile

**Why problematic**: Hard to tap accurately, especially for users with motor impairments

**Fix**: Ensure 44×44px minimum with padding

---

## Recommended Fixes (Priority Order)

### 🚨 Critical (Must Fix)

#### 1. Button Contrast Ratio (Line 34)
```tsx
// Before:
<button className="bg-blue-400 text-blue-100">Click me</button>

// After:
<button className="bg-blue-600 text-white">Click me</button>
```
**Impact**: WCAG AA compliance, readability

---

#### 2. Touch Target Size (Line 34)
```tsx
// Before:
<button className="w-8 h-8">×</button>

// After:
<button className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center">
  ×
</button>
```
**Impact**: Mobile usability, accessibility

---

#### 3. Focus Indicators (Line 67)
```tsx
// Before:
<select className="border rounded">

// After:
<select className="border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none">
```
**Impact**: Keyboard navigation, accessibility

---

#### 4. Error State Accessibility (Line 78)
```tsx
// Before:
<p className="text-red-500">Error occurred</p>

// After:
<p className="text-red-600 flex items-center gap-2">
  <AlertCircle className="w-4 h-4" />
  Error occurred
</p>
```
**Impact**: Colorblind users, accessibility

---

#### 5. Disabled State Clarity (Line 89)
```tsx
// Before:
<button disabled className="bg-blue-500 text-white">Save</button>

// After:
<button
  disabled
  className="bg-gray-300 text-gray-500 cursor-not-allowed"
  aria-disabled="true"
>
  Save
</button>
```
**Impact**: User clarity, prevent confusion

---

### ⚠️ Warnings (Should Fix)

#### 6. Line Height (Line 45)
```tsx
// Before:
<p className="leading-tight">Long paragraph text...</p>

// After:
<p className="leading-relaxed">Long paragraph text...</p>
```

#### 7. Spacing Consistency (Lines 23-45)
```tsx
// Before:
<div className="p-4">
  <div className="p-5">
    <div className="p-6">

// After (choose one value):
<div className="p-4">
  <div className="p-4">
    <div className="p-4">
```

#### 8. Fixed Width (Line 45)
```tsx
// Before:
<div className="w-[1200px]">

// After:
<div className="max-w-7xl mx-auto px-4">
```

#### 9. Mobile Text Size (Line 78)
```tsx
// Before:
<p className="text-sm">Important information</p>

// After:
<p className="text-base">Important information</p>
```

#### 10. Config Violations
Apply all 8 config violation fixes from Layer 1

---

## Next Steps

1. **Immediate**: Fix 5 critical issues (accessibility & WCAG)
2. **This week**: Address 7 warnings (quality & consistency)
3. **Future**: Consider updating `.design.json` to enforce stricter rules
4. **Review**: Re-run audit after fixes to verify improvements

---

## References

- [Typography Best Practices](~/.claude/skills/design/reference/typography.md)
- [Color & Contrast Guidelines](~/.claude/skills/design/reference/color-and-contrast.md)
- [Interaction Design Patterns](~/.claude/skills/design/reference/interaction-design.md)
- [Common Anti-Patterns](~/.claude/skills/design/reference/anti-patterns.md)
- [WCAG 2.1 Level AA](https://www.w3.org/WAI/WCAG21/quickref/)

---

**End of Report**
```

---

## Implementation Strategy

### Tools to Use

1. **File Discovery**: `Glob` to find `.design.json` and target files
2. **Content Reading**: `Read` to load config and component files
3. **Pattern Searching**: `Grep` to find specific violations
4. **Contrast Calculation**: Extract color pairs, compute WCAG ratios
5. **Size Detection**: Regex for arbitrary values `\[(\d+)px\]` or `\[(\d+)rem\]`

### Analysis Approach

**Layer 1 (Config Compliance)**:
- Load `.design.json` as reference
- Parse component file for all design-related code
- Use regex to extract:
  - Tailwind classes: `className="([^"]*)"`
  - Inline styles: `style={{([^}]*)}}`
  - CSS files: color/spacing/shadow declarations
- Compare each value against config rules
- Generate violation report with line numbers

**Layer 2 (Technical Quality)**:
- For each check, use pattern matching or calculation:
  - **Typography**: Extract line-height, letter-spacing, width values
  - **Contrast**: Parse color pairs (text + background), calculate ratios
  - **Spacing**: Detect inconsistent padding/margin patterns
  - **Touch Targets**: Find elements with w-/h- classes <44px
  - **Responsive**: Check for fixed widths or missing breakpoints
- Reference Impeccable guides for thresholds
- Categorize issues by severity (critical vs warning)

**Anti-Pattern Detection**:
- Use regex patterns from `reference/anti-patterns.md`
- Flag common mistakes with explanations

### Reporting Flow

1. **Run Layer 1** → Show config violations
2. **Ask to continue** if violations found (or auto-proceed if clean)
3. **Run Layer 2** → Show technical quality issues
4. **Run Anti-Pattern Scan** → Flag common mistakes
5. **Generate comprehensive report** with prioritized fixes
6. **Offer next steps**: Fix critical issues first, then warnings

---

## Edge Cases & Handling

| Scenario | Solution |
|----------|----------|
| No `.design.json` found | Offer to run `/design init` first |
| File path doesn't exist | List available component files with `Glob` |
| No violations in Layer 1 | Auto-proceed to Layer 2, mention clean config compliance |
| Too many violations (>20) | Show top 10 by severity, offer full report export |
| Multiple files requested | Process sequentially, show individual reports, then summary |
| Unknown color format (CSS vars) | Flag for manual review, suggest adding to config |
| Dynamic/computed values | Note in report as "unable to audit dynamically generated styles" |

---

## Usage Examples

### Example 1: Single File Audit
```
User: /design audit src/components/Button.tsx

Agent:
1. Loads .design.json
2. Reads Button.tsx
3. Runs Layer 1 check
4. Finds 3 violations (2 colors, 1 spacing)
5. Shows violations, asks to continue
6. User says yes
7. Runs Layer 2 check
8. Finds 2 issues (1 contrast, 1 touch target)
9. Generates full report with fixes
```

### Example 2: No File Specified
```
User: /design audit

Agent: I can audit your recent changes. Found 3 modified files:
- src/components/Button.tsx
- src/components/Card.tsx
- src/pages/HomePage.tsx

Which would you like me to audit? (type number or "all")

User: 1

Agent: [runs audit on Button.tsx]
```

### Example 3: Clean Config, Quality Issues
```
User: /design audit src/pages/Checkout.tsx

Agent:
✅ Layer 1: Config Compliance - No violations!
All colors, spacing, typography, and shadows follow .design.json

🔍 Layer 2: Technical Quality - 4 issues found

[Shows quality issues with fixes]
```

### Example 4: Multiple Violations
```
User: /design audit src/App.tsx

Agent:
❌ Layer 1: 23 config violations found

Showing top 10 by severity:
[lists violations]

...and 13 more. Generate full report? (y/n)

User: n

Agent: Continue to Layer 2 quality check? (y/n)

User: n

Agent: Got it. Fix these violations first, then re-run the audit.
```

---

## Success Criteria

An audit is complete and actionable when:

1. ✅ All config violations identified with line numbers
2. ✅ All technical quality checks run against Impeccable principles
3. ✅ Issues categorized by severity (critical vs warnings)
4. ✅ Each issue includes:
   - Clear description of the problem
   - Why it matters (impact)
   - Code example showing before/after fix
   - Reference to relevant documentation
5. ✅ Summary statistics provided (X critical, Y warnings)
6. ✅ Prioritized next steps outlined
7. ✅ Anti-patterns flagged with explanations

---

## Notes

- **Be concise by default**: Show summary counts, not full dumps
- **Be interactive**: Ask before generating huge reports
- **Be actionable**: Every issue must have a clear fix
- **Be educational**: Link to reference docs for learning
- **Be prioritized**: Critical (WCAG/a11y) before nice-to-haves
