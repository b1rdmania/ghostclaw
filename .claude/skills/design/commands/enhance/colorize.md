# /enhance colorize

Strategically introduce color using OKLCH and perceptual uniformity principles.

## When to Use

- User wants to add color, create a color palette, or improve color usage
- Explicit request for "add color", "colorize", "create palette", "color system"
- Design feels flat, lacks visual hierarchy, or needs brand personality
- Need to establish semantic colors (success, error, warning, info)

## Before You Start

1. **Check design system config** - Look for color tokens in `.design.json`:
   ```json
   {
     "colors": {
       "primary": {
         "base": "oklch(60% 0.15 250)",
         "light": "oklch(85% 0.08 250)",
         "dark": "oklch(35% 0.12 250)"
       },
       "neutral": {
         "50": "oklch(98% 0.01 250)",
         "900": "oklch(15% 0.01 250)"
       }
     }
   }
   ```

2. **Identify color needs** - What role does color play?
   - **Brand identity** (primary accent)
   - **Hierarchy** (visual weight distribution)
   - **Semantic states** (success, error, warning, info)
   - **Emotional tone** (warm, cool, energetic, calm)

3. **Check for existing color usage**:
   ```bash
   grep -r "oklch\|hsl\|rgb\|#[0-9a-f]" src/
   ```

## The OKLCH Advantage

**Stop using HSL.** Use OKLCH for perceptually uniform color.

### Why OKLCH Matters

HSL lies: 50% lightness in yellow looks bright, 50% in blue looks dark. OKLCH fixes this—equal lightness steps **look** equal across all hues.

```css
/* ❌ HSL - unpredictable lightness */
--blue-500: hsl(250, 60%, 50%);   /* Looks dark */
--yellow-500: hsl(60, 60%, 50%);  /* Looks bright */

/* ✅ OKLCH - predictable lightness */
--blue-500: oklch(60% 0.15 250);   /* Perceptually 60% light */
--yellow-500: oklch(60% 0.15 60);  /* Also perceptually 60% light */
```

### OKLCH Syntax

```css
oklch(lightness chroma hue)
```

| Parameter | Range | Purpose |
|-----------|-------|---------|
| **Lightness** | 0-100% | How light/dark (perceptually uniform) |
| **Chroma** | 0-0.4+ | Saturation intensity |
| **Hue** | 0-360 | Color position on wheel |

**Key insight**: As you move toward white or black, **reduce chroma**. High chroma at extreme lightness looks garish.

```css
/* Proper chroma scaling */
--primary-base: oklch(60% 0.15 250);   /* Base blue */
--primary-light: oklch(85% 0.08 250);  /* Lighter → less chroma */
--primary-dark: oklch(35% 0.12 250);   /* Darker → less chroma */
```

## Building a Functional Palette

### Start Minimal

Most apps work with:
1. **One primary color** (brand, CTAs, key actions)
2. **Tinted neutrals** (text, backgrounds, borders)
3. **Semantic colors** (success, error, warning, info)

**Skip secondary/tertiary** unless you genuinely need them. More colors = more decisions = more visual noise.

### The Tinted Neutral Rule

**Pure gray is dead.** Add a subtle hint of your brand hue to all neutrals:

```css
/* ❌ Dead grays - no personality */
--gray-50: oklch(98% 0 0);
--gray-900: oklch(15% 0 0);

/* ✅ Warm-tinted grays (friendly, approachable) */
--gray-50: oklch(98% 0.01 60);   /* Hint of warmth */
--gray-900: oklch(15% 0.01 60);

/* ✅ Cool-tinted grays (tech, professional) */
--gray-50: oklch(98% 0.01 250);  /* Hint of blue */
--gray-900: oklch(15% 0.01 250);
```

The chroma is tiny (0.01) but perceptible. Creates subconscious cohesion between brand color and UI.

### Palette Structure

| Role | Purpose | Example Scale |
|------|---------|---------------|
| **Primary** | Brand, CTAs, key actions | 1 hue, 5-7 shades |
| **Neutral** | Text, backgrounds, borders | 9-11 shade scale (50-900) |
| **Semantic** | Success, error, warning, info | 4 colors, 3 shades each |
| **Surface** | Cards, modals, overlays | 2-3 elevation levels |

### The 60-30-10 Rule

This is about **visual weight**, not pixel count:

- **60%**: Neutral backgrounds, white space, base surfaces
- **30%**: Secondary colors—text, borders, inactive states
- **10%**: Accent—CTAs, highlights, focus states

**Common mistake**: Using accent color everywhere because it's "the brand color." Accent colors work *because* they're rare.

## Generating Shades from a Base Color

Given a base color, generate lighter and darker shades by adjusting lightness and chroma:

### Lightness Steps

| Shade | Lightness | Typical Use |
|-------|-----------|-------------|
| 50 | 98% | Subtle backgrounds |
| 100 | 95% | Hover states |
| 200 | 90% | Light borders |
| 300 | 80% | Muted elements |
| 400 | 70% | Placeholder text |
| 500 | 60% | **Base color** |
| 600 | 50% | Hover on base |
| 700 | 40% | Active states |
| 800 | 30% | Dark text |
| 900 | 20% | Headings, emphasis |

### Chroma Adjustment Formula

As lightness moves away from base (60%), reduce chroma:

```
chroma = base_chroma * (1 - abs(lightness - 60%) / 60%)
```

Example for primary blue at `oklch(60% 0.15 250)`:

```css
--primary-50:  oklch(98% 0.05 250);  /* Very light → low chroma */
--primary-100: oklch(95% 0.07 250);
--primary-200: oklch(90% 0.09 250);
--primary-300: oklch(80% 0.12 250);
--primary-400: oklch(70% 0.14 250);
--primary-500: oklch(60% 0.15 250);  /* Base */
--primary-600: oklch(50% 0.14 250);
--primary-700: oklch(40% 0.12 250);
--primary-800: oklch(30% 0.10 250);
--primary-900: oklch(20% 0.07 250);  /* Very dark → low chroma */
```

## Semantic Colors

Use standard hues with adjusted chroma:

| State | Hue | Base Example |
|-------|-----|--------------|
| **Success** | 140-160 (green) | `oklch(55% 0.15 150)` |
| **Error** | 25-30 (red) | `oklch(55% 0.18 28)` |
| **Warning** | 50-70 (yellow/orange) | `oklch(70% 0.15 60)` |
| **Info** | 240-260 (blue) | `oklch(60% 0.15 250)` |

**Note**: Error red can handle higher chroma (0.18) to feel urgent. Warning yellow needs higher lightness (70%) to maintain contrast.

### Semantic Shade Scales

Generate 3 shades for each semantic color:

```css
/* Success green */
--success-light: oklch(90% 0.08 150);  /* Subtle backgrounds */
--success-base:  oklch(55% 0.15 150);  /* Icons, borders */
--success-dark:  oklch(35% 0.12 150);  /* Text on light bg */

/* Error red */
--error-light: oklch(90% 0.09 28);
--error-base:  oklch(55% 0.18 28);
--error-dark:  oklch(35% 0.14 28);

/* Warning yellow */
--warning-light: oklch(95% 0.08 60);
--warning-base:  oklch(70% 0.15 60);
--warning-dark:  oklch(45% 0.12 60);

/* Info blue */
--info-light: oklch(90% 0.08 250);
--info-base:  oklch(60% 0.15 250);
--info-dark:  oklch(35% 0.12 250);
```

## Contrast & Accessibility

### WCAG Requirements

| Content Type | AA Minimum | AAA Target |
|--------------|------------|------------|
| Body text | 4.5:1 | 7:1 |
| Large text (18px+ or 14px bold) | 3:1 | 4.5:1 |
| UI components, icons | 3:1 | 4.5:1 |

**Critical gotcha**: Placeholder text needs 4.5:1. That light gray placeholder everywhere? Usually fails.

### Dangerous Combinations

❌ Light gray text on white (accessibility fail #1)
❌ Gray text on colored backgrounds (looks washed out)
❌ Red text on green background (8% of men can't distinguish)
❌ Blue text on red background (vibrates visually)
❌ Yellow text on white (almost always fails contrast)

**Solution**: Use a darker shade of the background color for text on colored backgrounds, not gray.

```css
/* ❌ Bad - gray text on blue */
.blue-card {
  background: oklch(60% 0.15 250);
  color: oklch(50% 0 0); /* Dead gray on blue */
}

/* ✅ Good - darker blue text on blue */
.blue-card {
  background: oklch(60% 0.15 250);
  color: oklch(20% 0.10 250); /* Same hue family */
}
```

### Never Use Pure Black or Pure Gray

Pure black (`#000` or `oklch(0% 0 0)`) and pure gray (`oklch(50% 0 0)`) don't exist in nature. Even a chroma of 0.005-0.01 feels more natural.

## Dark Mode Considerations

Dark mode is **not** inverted light mode. It requires different decisions:

| Light Mode | Dark Mode |
|------------|-----------|
| Shadows for depth | Lighter surfaces for depth |
| Dark text on light | Light text on dark (reduce weight) |
| Vibrant accents | Desaturate accents slightly |
| White backgrounds | Never pure black—use dark gray (15-18%) |

```css
/* Dark mode palette */
:root[data-theme="dark"] {
  --surface-1: oklch(15% 0.01 250);  /* Base surface */
  --surface-2: oklch(20% 0.01 250);  /* Elevated */
  --surface-3: oklch(25% 0.01 250);  /* Highest */

  /* Desaturate primary slightly */
  --primary-base: oklch(60% 0.12 250); /* Was 0.15 in light mode */
}
```

## Implementation Workflow

1. **Audit existing color usage**
   ```bash
   grep -r "hsl\|rgb\|#[0-9a-f]" src/
   ```

2. **Define base colors** (if missing from `.design.json`)
   - Choose brand hue (0-360)
   - Set base lightness (usually 60%)
   - Set base chroma (0.12-0.18 for primary)

3. **Generate shade scales**
   - Primary: 5-7 shades using chroma reduction formula
   - Neutrals: 9-11 shades with subtle brand tint
   - Semantic: 3 shades each (light, base, dark)

4. **Test contrast**
   - Use [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
   - Check all text/background combinations
   - Test with vision deficiency emulation

5. **Replace existing colors**
   - Convert hex/rgb/hsl to OKLCH equivalents
   - Apply tinted neutrals instead of pure grays
   - Use semantic colors for state-specific UI

6. **Document palette** in `.design.md`

## Common Patterns

### Primary Palette

```css
/* Base: oklch(60% 0.15 250) - blue */
:root {
  --primary-50:  oklch(98% 0.05 250);
  --primary-100: oklch(95% 0.07 250);
  --primary-200: oklch(90% 0.09 250);
  --primary-300: oklch(80% 0.12 250);
  --primary-400: oklch(70% 0.14 250);
  --primary-500: oklch(60% 0.15 250);  /* Base */
  --primary-600: oklch(50% 0.14 250);
  --primary-700: oklch(40% 0.12 250);
  --primary-800: oklch(30% 0.10 250);
  --primary-900: oklch(20% 0.07 250);
}
```

### Tinted Neutrals

```css
/* Cool-tinted for tech/professional */
:root {
  --gray-50:  oklch(98% 0.01 250);
  --gray-100: oklch(95% 0.01 250);
  --gray-200: oklch(90% 0.01 250);
  --gray-300: oklch(80% 0.01 250);
  --gray-400: oklch(70% 0.01 250);
  --gray-500: oklch(60% 0.01 250);
  --gray-600: oklch(50% 0.01 250);
  --gray-700: oklch(40% 0.01 250);
  --gray-800: oklch(30% 0.01 250);
  --gray-900: oklch(15% 0.01 250);
}
```

### Semantic Colors

```css
:root {
  /* Success */
  --success-light: oklch(90% 0.08 150);
  --success-base:  oklch(55% 0.15 150);
  --success-dark:  oklch(35% 0.12 150);

  /* Error */
  --error-light: oklch(90% 0.09 28);
  --error-base:  oklch(55% 0.18 28);
  --error-dark:  oklch(35% 0.14 28);

  /* Warning */
  --warning-light: oklch(95% 0.08 60);
  --warning-base:  oklch(70% 0.15 60);
  --warning-dark:  oklch(45% 0.12 60);

  /* Info */
  --info-light: oklch(90% 0.08 250);
  --info-base:  oklch(60% 0.15 250);
  --info-dark:  oklch(35% 0.12 250);
}
```

### Text on Colored Backgrounds

```css
/* ❌ Bad - gray text on color */
.card-blue {
  background: var(--primary-500);
  color: var(--gray-700); /* Washed out */
}

/* ✅ Good - same hue family */
.card-blue {
  background: var(--primary-500);
  color: var(--primary-900); /* Rich, cohesive */
}
```

### Surface Elevation

```css
/* Light mode - shadows */
.surface-1 { background: oklch(100% 0 0); }
.surface-2 {
  background: oklch(100% 0 0);
  box-shadow: 0 2px 8px oklch(0% 0 0 / 0.1);
}

/* Dark mode - lighter surfaces */
:root[data-theme="dark"] {
  --surface-1: oklch(15% 0.01 250);
  --surface-2: oklch(20% 0.01 250);
  --surface-3: oklch(25% 0.01 250);
}

:root[data-theme="dark"] .surface-2 {
  background: var(--surface-2);
  box-shadow: none; /* No shadows in dark mode */
}
```

## Anti-Patterns to Avoid

❌ **Using HSL** - Not perceptually uniform
❌ **Pure gray (#999, #666)** - Use tinted neutrals instead
❌ **Pure black (#000)** - Use `oklch(0% 0.01 hue)` minimum
❌ **High chroma at extreme lightness** - Looks garish
❌ **Gray text on colored backgrounds** - Use same hue family
❌ **More than 1 primary + 4 semantic colors** - Decision fatigue
❌ **Skipping contrast testing** - Accessibility violation
❌ **Color-only information** - Add icons/labels for accessibility
❌ **Inverting colors for dark mode** - Design separately

## Success Criteria

- [ ] All colors use OKLCH (not HSL, RGB, hex)
- [ ] Neutrals are subtly tinted with brand hue (chroma ~0.01)
- [ ] Chroma reduces as lightness moves toward extremes
- [ ] Primary palette has 5-7 shades
- [ ] Semantic colors defined (success, error, warning, info)
- [ ] All text meets WCAG AA contrast (4.5:1 minimum)
- [ ] No pure black (`#000`) or pure gray
- [ ] Text on colored backgrounds uses same hue family
- [ ] Dark mode uses lighter surfaces (not shadows) for elevation
- [ ] Color palette documented in `.design.json` and `.design.md`

## Output Format

```markdown
## Color System Created

**Palette structure:**
- Primary: Blue (hue 250) - 7 shades (50-900)
- Neutrals: Cool-tinted gray (chroma 0.01) - 9 shades
- Semantic: Success (green), Error (red), Warning (yellow), Info (blue) - 3 shades each

**Key decisions:**
- OKLCH for perceptual uniformity
- Chroma reduction at lightness extremes (formula applied)
- Tinted neutrals for brand cohesion
- No pure black or pure gray

**Contrast tested:**
- Body text on white: 7.2:1 (AAA) ✅
- Primary button text: 5.3:1 (AA) ✅
- Placeholder text: 4.6:1 (AA) ✅

**Dark mode:**
- Base surface: oklch(15% 0.01 250)
- Elevation via lighter surfaces (not shadows)
- Primary desaturated (0.12 vs 0.15 in light mode)

**Files modified:**
- src/styles/colors.css (OKLCH palette)
- src/styles/theme.css (dark mode overrides)
- .design.json (color tokens)
- .design.md (palette documentation)
```
