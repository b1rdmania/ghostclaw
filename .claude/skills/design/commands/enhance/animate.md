# /enhance animate

Add motion and animation following performance-first timing principles.

## When to Use

- User wants to add transitions, animations, or motion
- Explicit request for "animate", "add transitions", "motion design"
- Component feels static or lacks polish
- Need to guide user attention during state changes

## Before You Start

1. **Check design system config** - Look for motion tokens in `.design.json`:
   ```json
   {
     "motion": {
       "instant": "100ms",
       "quick": "200ms",
       "base": "300ms",
       "slow": "500ms",
       "ease-out": "cubic-bezier(0.16, 1, 0.3, 1)",
       "ease-in-out": "cubic-bezier(0.65, 0, 0.35, 1)"
     }
   }
   ```

2. **Identify animation type** - What kind of motion?
   - **Feedback** (instant): Button press, toggle, focus
   - **State change** (quick): Menu open, tooltip, hover
   - **Layout shift** (base): Accordion, modal, drawer
   - **Entrance** (slow): Page load, hero reveal

3. **Check for reduced motion** - Motion isn't optional:
   ```bash
   grep -r "prefers-reduced-motion" .
   ```

## The 100/300/500 Rule

**Duration matters more than easing.** Use these timings for most UI:

| Duration | Use Case | Examples |
|----------|----------|----------|
| **100-150ms** | Instant feedback | Button press, toggle, color change |
| **200-300ms** | State changes | Menu open, tooltip, hover states |
| **300-500ms** | Layout changes | Accordion, modal, drawer |
| **500-800ms** | Entrance animations | Page load, hero reveals |

**Exit animations are 25% faster** - Use ~75% of entrance duration for exits.

## Easing: The Right Curves

**Don't use `ease`**—it's rarely optimal. Use:

| Curve | Use For | CSS |
|-------|---------|-----|
| **ease-out** | Elements entering | `cubic-bezier(0.16, 1, 0.3, 1)` |
| **ease-in** | Elements leaving | `cubic-bezier(0.7, 0, 0.84, 0)` |
| **ease-in-out** | State toggles | `cubic-bezier(0.65, 0, 0.35, 1)` |

**For refined micro-interactions**, use exponential curves:

```css
/* Quart out - smooth, refined (recommended default) */
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);

/* Expo out - snappy, confident */
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
```

**Avoid bounce and elastic**—they feel dated and draw attention to the animation itself.

## Performance: What to Animate

**Only animate `transform` and `opacity`**—everything else causes layout recalculation.

```css
/* ✅ Good - GPU accelerated */
.modal {
  transform: translateY(10px);
  opacity: 0;
  transition: transform 300ms ease-out, opacity 300ms ease-out;
}

.modal.open {
  transform: translateY(0);
  opacity: 1;
}

/* ❌ Bad - causes layout thrashing */
.modal {
  height: 0;
  margin-top: 100px;
}
```

**For height animations**, use `grid-template-rows`:

```css
.accordion-content {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 300ms ease-out;
  overflow: hidden;
}

.accordion-content.open {
  grid-template-rows: 1fr;
}
```

## Staggered Animations

Use CSS custom properties for clean stagger logic:

```css
/* In CSS */
.card {
  animation: slide-up 400ms ease-out;
  animation-delay: calc(var(--i, 0) * 50ms);
}

/* In HTML */
<div class="card" style="--i: 0">...</div>
<div class="card" style="--i: 1">...</div>
<div class="card" style="--i: 2">...</div>
```

**Cap total stagger time**—10 items × 50ms = 500ms total. For long lists, reduce per-item delay or cap staggered count.

## Reduced Motion (Required)

**This is not optional.** ~35% of adults over 40 have vestibular disorders.

```css
/* Define animations normally */
.hero {
  animation: slide-up 500ms ease-out;
}

/* Provide alternative for reduced motion */
@media (prefers-reduced-motion: reduce) {
  .hero {
    animation: fade-in 200ms ease-out;  /* Crossfade instead of motion */
  }
}

/* Or disable spatial motion entirely */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

**What to preserve**: Progress bars, loading spinners (slowed), focus indicators—just without spatial movement.

## Perceived Performance

**Nobody cares how fast your site is—just how fast it feels.**

### The 80ms Threshold

Our brains buffer sensory input for ~80ms. Anything under 80ms feels **instant**. Target this for micro-interactions.

### Active vs Passive Time

Passive waiting feels longer than active engagement:

- **Preemptive start**: Begin transitions immediately while loading (iOS app zoom, skeleton UI)
- **Early completion**: Show content progressively—don't wait for everything
- **Optimistic UI**: Update interface immediately, sync later (Instagram likes)

### Easing Affects Perceived Duration

**Ease-in** toward completion makes tasks feel shorter (peak-end effect weights final moments). Use for progress bars and loading states.

**Caution**: Too-fast responses can decrease perceived value. Users may distrust instant results for complex operations.

## Implementation Workflow

1. **Audit existing motion**
   ```bash
   grep -r "transition\|animation" src/
   ```

2. **Define motion tokens** (if missing from `.design.json`)
   ```json
   {
     "motion": {
       "instant": "100ms",
       "quick": "200ms",
       "base": "300ms",
       "slow": "500ms",
       "exit-multiplier": 0.75,
       "ease-out": "cubic-bezier(0.16, 1, 0.3, 1)",
       "ease-in": "cubic-bezier(0.7, 0, 0.84, 0)",
       "ease-in-out": "cubic-bezier(0.65, 0, 0.35, 1)"
     }
   }
   ```

3. **Add motion to components**
   - Map animation type → duration
   - Choose easing curve (enter/exit/toggle)
   - Use `transform` and `opacity` only
   - Add `prefers-reduced-motion` alternative

4. **Test performance**
   ```bash
   # Check for layout thrashing
   grep -r "transition.*height\|transition.*width\|transition.*top\|transition.*left" .
   ```

5. **Document motion system** in `.design.md`

## Common Patterns

### Button Press

```css
.button {
  transform: scale(1);
  transition: transform 100ms ease-out;
}

.button:active {
  transform: scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .button {
    transition: opacity 100ms ease-out;
  }
  .button:active {
    transform: none;
    opacity: 0.8;
  }
}
```

### Modal Enter/Exit

```css
.modal {
  transform: translateY(10px);
  opacity: 0;
  transition:
    transform 300ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 300ms ease-out;
}

.modal.open {
  transform: translateY(0);
  opacity: 1;
}

.modal.closing {
  /* Exit 25% faster */
  transition-duration: 225ms;
}

@media (prefers-reduced-motion: reduce) {
  .modal {
    transform: none;
    transition: opacity 200ms ease-out;
  }
}
```

### Accordion

```css
.accordion-content {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 300ms ease-out;
  overflow: hidden;
}

.accordion-content > div {
  min-height: 0; /* Required for grid animation */
}

.accordion-content.open {
  grid-template-rows: 1fr;
}
```

### Staggered List

```css
@keyframes slide-up {
  from {
    transform: translateY(10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.card {
  animation: slide-up 400ms ease-out;
  animation-delay: calc(var(--i, 0) * 50ms);
  animation-fill-mode: both;
}

@media (prefers-reduced-motion: reduce) {
  .card {
    animation-name: fade-in;
    animation-delay: 0ms;
  }
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

## Anti-Patterns to Avoid

❌ **Animating everything** - Animation fatigue is real
❌ **Using >500ms for UI feedback** - Feels sluggish
❌ **Ignoring `prefers-reduced-motion`** - Accessibility violation
❌ **Using animation to hide slow loading** - Fix the real problem
❌ **Bounce and elastic curves** - Dated and distracting
❌ **Animating width/height/top/left** - Causes layout thrashing
❌ **Using generic `ease`** - Rarely the right choice

## Success Criteria

- [ ] Motion tokens defined in `.design.json`
- [ ] Only `transform` and `opacity` animated
- [ ] Duration follows 100/300/500 rule
- [ ] Exit animations are 25% faster than entrances
- [ ] Easing curves match animation type (enter/exit/toggle)
- [ ] `prefers-reduced-motion` alternative provided
- [ ] Stagger timing capped (total duration < 500ms)
- [ ] No layout-triggering properties animated
- [ ] Motion system documented in `.design.md`

## Output Format

```markdown
## Motion Added

**Components enhanced:**
- Button: 100ms scale feedback on press
- Modal: 300ms slide-up entrance, 225ms fade-out exit
- Accordion: 300ms grid-template-rows animation
- Card list: 50ms stagger (max 500ms total)

**Motion tokens:**
- instant: 100ms (feedback)
- quick: 200ms (state changes)
- base: 300ms (layout shifts)
- slow: 500ms (entrances)

**Performance:**
- Only transform/opacity animated
- Reduced motion alternatives provided
- Total stagger capped at 500ms

**Files modified:**
- src/components/Button.css
- src/components/Modal.css
- src/components/Accordion.css
- src/styles/motion.css
- .design.json (motion tokens)
```
