# Design Apply

Generate new components using your design system configuration and best practices from Impeccable.

## Purpose

Create new UI components that:
- Follow your design system rules (.design.json)
- Apply Impeccable principles (typography, color, spatial design, etc.)
- Avoid common anti-patterns
- Are production-ready with proper accessibility

## When to Use

- Creating new components from scratch
- Scaffolding component variants (primary/secondary buttons, card types, etc.)
- Generating boilerplate that follows your design rules
- Prototyping new UI elements

## How It Works

1. **Load Design System**: Read `.design.json` (or use minimal defaults)
2. **Load Best Practices**: Read relevant Impeccable references
3. **Generate Component**: Create code following both layers
4. **Anti-Pattern Check**: Verify no anti-patterns were introduced
5. **Return Code**: Provide ready-to-use component code

## Usage

```
/design-apply <component-type> [variant]
```

**Examples:**
```
/design-apply button
/design-apply button primary
/design-apply card
/design-apply modal
/design-apply form
```

## What You Get

The command generates:

1. **Component Code**: React/TypeScript component (or your framework)
2. **Design Notes**: Why specific choices were made
3. **Accessibility**: ARIA labels, keyboard nav, focus management
4. **Variants**: Common variants (size, style, state)
5. **Usage Example**: How to use the component

## Design System Integration

The component will use:
- Your color palette from `.design.json`
- Your typography scale
- Your spacing system
- Your motion tokens (if defined)
- Your component-specific overrides

If no `.design.json` exists, uses sensible defaults from `examples/minimal.json`.

## Best Practices Applied

### Typography
- Proper font family from your design system
- Correct type scale for hierarchy
- Optimal line-height and letter-spacing
- Accessible font sizes (min 16px for body)

### Color & Contrast
- WCAG AA contrast ratios (4.5:1 text, 3:1 UI)
- Semantic color usage (error = red, success = green)
- OKLCH for consistent perceived brightness
- Avoids anti-patterns (gray on colored backgrounds)

### Spatial Design
- Consistent spacing scale (4px base or your custom scale)
- Optical alignment, not mathematical
- Appropriate density for component type
- Touch targets ≥44x44px

### Motion
- Purposeful animations only
- Impeccable timing: 100ms micro, 300ms standard, 500ms complex
- Spring physics or appropriate easing
- Respects `prefers-reduced-motion`

### Interaction
- Clear affordances (buttons look clickable)
- Hover/active/focus/disabled states
- Proper focus indicators
- Loading and error states

### Accessibility
- Semantic HTML
- ARIA labels where needed
- Keyboard navigation
- Screen reader support
- Color-blind safe (not relying on color alone)

## Anti-Patterns Avoided

The generated code will NOT include:
1. ❌ Bad contrast (gray text on colored backgrounds)
2. ❌ Cardocalypse (excessive nesting)
3. ❌ Inter everywhere (uses your font system)
4. ❌ Massive icons (proper sizing)
5. ❌ Modal abuse (appropriate for use case)
6. ❌ Purple gradients (unless in your palette)
7. ❌ Redundant UX writing
8. ❌ Thick border cards
9. ❌ Lazy "cool" design (glassmorphism, neon)
10. ❌ Lazy "impact" design (gradient text, bouncing)
11. ❌ Layout templates (unique, purposeful design)

## Example Output

```tsx
// Button component generated with /design-apply button

import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', isLoading, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          // Base styles
          'inline-flex items-center justify-center',
          'font-medium transition-all duration-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',

          // Variant styles
          variant === 'primary' && [
            'bg-blue-600 text-white',
            'hover:bg-blue-700 active:bg-blue-800',
            'focus-visible:ring-blue-600'
          ],
          variant === 'secondary' && [
            'bg-slate-100 text-slate-900',
            'hover:bg-slate-200 active:bg-slate-300',
            'focus-visible:ring-slate-400'
          ],
          variant === 'ghost' && [
            'bg-transparent text-slate-700',
            'hover:bg-slate-100 active:bg-slate-200',
            'focus-visible:ring-slate-400'
          ],

          // Size styles (touch-friendly)
          size === 'sm' && 'h-9 px-3 text-sm',
          size === 'md' && 'h-11 px-4 text-base',
          size === 'lg' && 'h-14 px-6 text-lg',

          className
        )}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading ? (
          <span className="inline-block animate-spin mr-2">⏳</span>
        ) : null}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export { Button }

// Usage:
// <Button variant="primary" size="md">Click me</Button>
// <Button variant="secondary" isLoading>Loading...</Button>
```

## Design Notes Example

When generating the button above, the command explains:

- **Typography**: Uses system font stack, proper size scale
- **Color**: Blue 600 base, darkens on interaction (perceived brightness)
- **Spacing**: Touch targets ≥44px (h-11 = 44px), comfortable padding
- **Motion**: 100ms transition for immediate feedback
- **Interaction**: Clear states (hover, active, focus, disabled, loading)
- **Accessibility**: forwardRef for focus management, disabled state, semantic button element

## Customization

You can provide additional context:

```
/design-apply button "Make it bold and high-contrast for a gaming app"
```

The command will:
1. Use your base design system
2. Adjust for the context (bold typography, higher contrast)
3. Still avoid anti-patterns
4. Explain the choices made

## Framework Support

Currently supports:
- React + TypeScript (default)
- React + Tailwind CSS
- Vue 3 + TypeScript
- Svelte
- Plain HTML/CSS

Specify in your `.design.json`:

```json
{
  "framework": "react",
  "styling": "tailwind"
}
```

## When to Use vs Other Commands

- **Use `/design-apply`**: Creating new components
- **Use `/design-audit`**: Reviewing existing components
- **Use `/design-normalize`**: Fixing rule violations
- **Use `/design-polish`**: Improving existing design
- **Use `/design-critique`**: Getting expert feedback

## Implementation

```typescript
// Pseudocode for /design-apply

async function designApply(componentType: string, variant?: string, context?: string) {
  // 1. Load design system
  const designSystem = await loadDesignSystem() // .design.json or minimal defaults

  // 2. Load relevant references
  const references = await loadReferences([
    'typography.md',
    'color-and-contrast.md',
    'spatial-design.md',
    'interaction-design.md',
    'anti-patterns.md'
  ])

  // 3. Generate component
  const component = await generateComponent({
    type: componentType,
    variant,
    context,
    designSystem,
    references
  })

  // 4. Validate against anti-patterns
  const antiPatternCheck = await checkAntiPatterns(component.code)

  // 5. Return formatted output
  return {
    code: component.code,
    designNotes: component.notes,
    antiPatternCheck,
    usageExample: component.example
  }
}
```

## Tips

1. **Start with basics**: Generate button, card, input first
2. **Use variants**: Generate all variants at once (`/design-apply button all-variants`)
3. **Iterate**: Generate, review with `/design-critique`, refine
4. **Combine**: Use generated components as building blocks
5. **Customize**: Edit the output to match your exact needs

## Related Commands

- `/design-init` - Set up design system first
- `/design-audit` - Review after generating
- `/design-polish` - Refine the output
- `/design-critique` - Get expert feedback
