# Design Normalize Command

Fix design violations at both layers (config compliance + technical quality) with preview before applying.

## Two-Layer Normalization

1. **Layer 1: Config Compliance** - Replace hardcoded values with design system tokens
2. **Layer 2: Technical Quality** - Fix Impeccable principle violations

## Usage

```
/design normalize <file_or_component>
```

Examples:
```
/design normalize src/components/Button.tsx
/design normalize src/pages/HomePage.tsx
/design normalize src/app/dashboard/page.tsx
```

Optional flags:
```
/design normalize src/components/Button.tsx --auto-apply  # Skip preview, apply immediately
/design normalize src/components/Button.tsx --layer=config  # Only fix config violations
/design normalize src/components/Button.tsx --layer=quality  # Only fix quality issues
```

## Process Flow

### Step 1: Audit

Run the design audit command internally to identify violations:
- Layer 1: Config violations (hardcoded colors, spacing, fonts, etc.)
- Layer 2: Technical quality issues (contrast, line-height, touch targets, etc.)

### Step 2: Generate Fixes

For each violation, generate a fix:

#### Layer 1: Config Compliance Fixes (Auto-fixable)

1. **Hardcoded Colors → Palette Tokens**
   ```tsx
   // Before:
   <div className="bg-[#3b82f6] text-white">

   // After (using .design.json palette):
   <div className="bg-primary-600 text-white">
   ```

2. **Arbitrary Spacing → Scale Tokens**
   ```tsx
   // Before:
   <div className="p-[13px] mb-[27px]">

   // After (using .design.json spacing scale):
   <div className="p-3 mb-6">  // p-3=12px, mb-6=24px from scale
   ```

3. **Custom Font Sizes → Modular Scale**
   ```tsx
   // Before:
   <h1 className="text-[26px]">

   // After (using .design.json type scale):
   <h1 className="text-2xl">  // 2xl=24px from scale
   ```

4. **Custom Border Radius → System Values**
   ```tsx
   // Before:
   <div className="rounded-[13px]">

   // After (using .design.json radius values):
   <div className="rounded-lg">  // lg=12px from system
   ```

5. **Inline Shadows → Named Shadows**
   ```tsx
   // Before:
   <div className="shadow-[0_4px_12px_rgba(0,0,0,0.15)]">

   // After (using .design.json shadow tokens):
   <div className="shadow-md">
   ```

#### Layer 2: Technical Quality Fixes

##### Typography Fixes (Auto-fixable)

1. **Line Height Too Tight**
   ```tsx
   // Before: line-height 1.2 on body text
   <p className="leading-tight">  // 1.2

   // After: line-height 1.5 for readability
   <p className="leading-normal">  // 1.5
   ```

2. **Line Length Too Wide**
   ```tsx
   // Before: no max-width, lines too long
   <p className="w-full">

   // After: optimal measure (60-75ch)
   <p className="max-w-prose">  // ~65ch
   ```

3. **Small Body Text**
   ```tsx
   // Before: 14px body text (too small)
   <p className="text-sm">

   // After: 16px minimum for readability
   <p className="text-base">
   ```

##### Color & Contrast Fixes (Auto-fixable)

1. **Insufficient Contrast**
   ```tsx
   // Before: 3.2:1 contrast (fails WCAG AA)
   <button className="bg-blue-400 text-blue-100">

   // After: 4.5:1+ contrast
   <button className="bg-blue-600 text-white">
   ```

2. **Pure Black/Gray**
   ```tsx
   // Before: pure black
   <div className="bg-black text-white">

   // After: slightly tinted dark gray
   <div className="bg-gray-950 text-white">  // Using warm-tinted gray from palette
   ```

##### Spatial Design Fixes (Auto-fixable)

1. **Inconsistent Spacing**
   ```tsx
   // Before: mix of arbitrary values
   <div className="mt-[14px] mb-[18px]">

   // After: consistent scale values
   <div className="mt-4 mb-4">  // 16px from spacing scale
   ```

2. **Touch Target Too Small**
   ```tsx
   // Before: 32x32px touch target
   <button className="w-8 h-8">

   // After: 44x44px minimum
   <button className="w-11 h-11">  // 44px
   ```

##### Interaction Design Fixes (Auto-fixable)

1. **Missing Focus Indicators**
   ```tsx
   // Before: no focus ring
   <button className="...">

   // After: visible focus ring
   <button className="... focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
   ```

2. **Touch Target Expansion (Optical Fix)**
   ```tsx
   // Before: small visual button with small touch area
   <button className="w-6 h-6">

   // After: small visual, large touch area
   <button className="w-6 h-6 p-2 -m-2">  // Visual 24px, touch 44px
   ```

##### Responsive Design Fixes (Auto-fixable)

1. **Fixed Width on Mobile**
   ```tsx
   // Before: fixed width breaks on small screens
   <div className="w-[600px]">

   // After: responsive width
   <div className="w-full max-w-2xl">
   ```

2. **Text Too Small on Mobile**
   ```tsx
   // Before: 12px text on mobile
   <p className="text-xs">

   // After: 14px minimum on mobile
   <p className="text-sm sm:text-xs">
   ```

#### Manual Fixes (Suggest, Don't Auto-Apply)

Some issues require design judgment and can't be auto-fixed:

1. **Font Pairing Changes**
   - Requires selecting a new font and updating multiple components
   - Suggest alternative fonts, but don't auto-replace

2. **Complex Layout Restructuring**
   - Changing grid layouts, reordering content
   - Suggest structural improvements, but don't auto-apply

3. **Animation Timing Adjustments**
   - Requires testing and feel
   - Suggest duration/easing improvements

4. **UX Writing Improvements**
   - "Click here" → "View dashboard"
   - Suggest better microcopy, but don't auto-replace

### Step 3: Show Preview

Display a diff-style preview of all changes:

```markdown
## Normalization Preview: ComponentName.tsx

### Layer 1: Config Compliance (4 fixes)

#### 1. Hardcoded Color → Palette Token (line 12)
```diff
- <div className="bg-[#3b82f6] text-white">
+ <div className="bg-primary-600 text-white">
```

#### 2. Arbitrary Spacing → Scale Token (line 15)
```diff
- <div className="p-[13px] mb-[27px]">
+ <div className="p-3 mb-6">
```

#### 3. Custom Font Size → Modular Scale (line 8)
```diff
- <h1 className="text-[26px]">
+ <h1 className="text-2xl">
```

#### 4. Inline Shadow → Named Shadow (line 20)
```diff
- <div className="shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
+ <div className="shadow-md">
```

### Layer 2: Technical Quality (3 fixes)

#### 1. Line Height Too Tight (line 18)
```diff
- <p className="leading-tight">
+ <p className="leading-normal">
```
**Rationale**: Body text needs 1.5 line-height for readability (was 1.2)

#### 2. Insufficient Contrast (line 25)
```diff
- <button className="bg-blue-400 text-blue-100">
+ <button className="bg-blue-600 text-white">
```
**Rationale**: Original contrast 3.2:1 (fails WCAG AA), new contrast 5.1:1 (passes)

#### 3. Touch Target Too Small (line 30)
```diff
- <button className="w-8 h-8">
+ <button className="w-11 h-11">
```
**Rationale**: Minimum 44x44px touch target required (was 32x32px)

---

### Manual Fixes Required (1)

#### 1. Font Pairing Issue (line 5-8)
**Problem**: Using two similar geometric sans-serifs (Inter + Montserrat)
**Suggestion**: Use one font family in multiple weights, or pair with serif

```tsx
// Option 1: Single font in multiple weights
<h1 className="font-sans font-bold">  // Inter Bold
<p className="font-sans font-normal">  // Inter Regular

// Option 2: Clear contrast
<h1 className="font-serif font-bold">  // Fraunces Bold
<p className="font-sans font-normal">   // Inter Regular
```

---

### Summary
- ✅ **7 auto-fixes** ready to apply
- ⚠️ **1 manual fix** requires review
- **Files to modify**: 1 (ComponentName.tsx)

Apply these changes? (y/n)
```

### Step 4: Apply or Reject

Wait for user confirmation:
- `y` or `yes` → Apply all auto-fixes, write updated file
- `n` or `no` → Cancel without changes
- `selective` → Let user choose which fixes to apply

After applying:
1. Write the modified file
2. Run audit again to verify fixes
3. Show before/after comparison

## Implementation Strategy

### Parsing & Analysis

1. **Read the file** to normalize
2. **Run audit command** to get violations
3. **Parse code** (use AST for JSX/TSX, regex for simple patterns)
4. **Build fix map** (line number → original → replacement)

### Fix Generation

For each violation:
1. **Identify fix type** (config vs quality, auto vs manual)
2. **Generate replacement code**
3. **Validate fix** (ensure it doesn't break syntax)
4. **Add to preview**

### Code Replacement

Use precise string replacement:
- Match exact className strings (including quotes)
- Preserve formatting (spaces, line breaks)
- Handle multi-line classNames
- Support Tailwind, CSS modules, styled-components

### Testing Fixes

After applying:
1. **Syntax check** (ensure valid TSX/JSX)
2. **Re-run audit** (verify violations are fixed)
3. **Report success/failure** for each fix

## Edge Cases

### Conflicting Fixes

If multiple fixes overlap (e.g., replacing both color AND spacing in same className):
```tsx
// Before:
<div className="bg-[#3b82f6] p-[13px]">

// After (combined fixes):
<div className="bg-primary-600 p-3">
```

### Partial Matches

If a color exists in palette but with different shade:
```tsx
// Before: #3b82f6 (blue-500 equivalent)
// Palette has: blue-400, blue-600 (but not blue-500)

// Strategy: Find closest match
<div className="bg-primary-600">  // Closest shade
```

### Dynamic Values

Can't auto-fix dynamic/computed values:
```tsx
// Can't fix this:
<div style={{ padding: `${spacing}px` }}>

// Suggest manual fix:
// "Consider using a design token: className={`p-${spacing}`}"
```

### Multiple Files

If fixing multiple files:
```
/design normalize src/components/**/*.tsx
```

Show aggregated preview, apply to all files that user confirms.

## Output Format

Always show:
1. **Preview of all changes** (diff format)
2. **Rationale for each fix** (why it's being changed)
3. **Summary statistics** (X auto-fixes, Y manual suggestions)
4. **Confirmation prompt** before applying
5. **Success report** after applying (what was changed, re-audit results)

## Exit Criteria

Normalization is complete when:
1. All auto-fixable violations are fixed
2. All manual fixes are suggested
3. Re-audit shows improvement
4. Files are written successfully
5. User is notified of results

## Best Practices

1. **Always preview before applying** (unless --auto-apply flag)
2. **Preserve code style** (spacing, quotes, formatting)
3. **One fix per violation** (don't combine unrelated changes)
4. **Clear rationale** (explain why each fix is needed)
5. **Test after applying** (re-run audit to verify)
6. **Handle errors gracefully** (if fix fails, report and continue)

## Related Commands

- `/design audit` - Identify violations (runs before normalize)
- `/design rules` - Show current design system config
- `/design init` - Set up design system for a new project
