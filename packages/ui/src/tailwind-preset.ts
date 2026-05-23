import type { Config } from 'tailwindcss';

/**
 * Shared Tailwind preset for the 3-app monorepo (`@bulr/candidate`,
 * `@bulr/business`, `@bulr/admin`).
 *
 * Each app's `tailwind.config.ts` should `extend` this preset so that theme
 * tokens stay consistent across apps:
 *
 * ```ts
 * import type { Config } from 'tailwindcss';
 * import { bulrTailwindPreset } from '@bulr/ui';
 *
 * const config: Config = {
 *   presets: [bulrTailwindPreset],
 *   content: [
 *     './app/**\/*.{ts,tsx}',
 *     './components/**\/*.{ts,tsx}',
 *     '../../packages/ui/src/**\/*.{ts,tsx}',
 *   ],
 * };
 *
 * export default config;
 * ```
 *
 * NOTE: This project uses Tailwind CSS v4, which configures theme tokens
 * primarily via the CSS-first `@theme` block (see each app's `app/globals.css`).
 * The current `apps/web/tailwind.config.ts` does not define any custom
 * colors/fontFamily/animation, so this preset starts as a minimal scaffold
 * that downstream apps and future shadcn primitives can extend.
 *
 * Named exports are also provided so individual sections (colors, fontFamily,
 * keyframes, animation) can be composed à la carte by other apps if needed.
 */

export const colors = {
  border: 'hsl(var(--border))',
  input: 'hsl(var(--input))',
  ring: 'hsl(var(--ring))',
  background: 'hsl(var(--background))',
  foreground: 'hsl(var(--foreground))',
  primary: {
    DEFAULT: 'hsl(var(--primary))',
    foreground: 'hsl(var(--primary-foreground))',
  },
  secondary: {
    DEFAULT: 'hsl(var(--secondary))',
    foreground: 'hsl(var(--secondary-foreground))',
  },
  destructive: {
    DEFAULT: 'hsl(var(--destructive))',
    foreground: 'hsl(var(--destructive-foreground))',
  },
  muted: {
    DEFAULT: 'hsl(var(--muted))',
    foreground: 'hsl(var(--muted-foreground))',
  },
  accent: {
    DEFAULT: 'hsl(var(--accent))',
    foreground: 'hsl(var(--accent-foreground))',
  },
  popover: {
    DEFAULT: 'hsl(var(--popover))',
    foreground: 'hsl(var(--popover-foreground))',
  },
  card: {
    DEFAULT: 'hsl(var(--card))',
    foreground: 'hsl(var(--card-foreground))',
  },
} as const;

export const borderRadius = {
  lg: 'var(--radius)',
  md: 'calc(var(--radius) - 2px)',
  sm: 'calc(var(--radius) - 4px)',
} as const;

export const fontFamily = {
  sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
} as const;

export const keyframes = {
  'accordion-down': {
    from: { height: '0' },
    to: { height: 'var(--radix-accordion-content-height)' },
  },
  'accordion-up': {
    from: { height: 'var(--radix-accordion-content-height)' },
    to: { height: '0' },
  },
} as const;

export const animation = {
  'accordion-down': 'accordion-down 0.2s ease-out',
  'accordion-up': 'accordion-up 0.2s ease-out',
} as const;

const bulrTailwindPreset = {
  // `content` is intentionally omitted — each consuming app declares its own
  // content scan roots (including `../../packages/ui/src/**/*.{ts,tsx}`).
  content: [],
  theme: {
    extend: {
      colors,
      borderRadius,
      fontFamily,
      keyframes,
      animation,
    },
  },
} satisfies Config;

export default bulrTailwindPreset;
