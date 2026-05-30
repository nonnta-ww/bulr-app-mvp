import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Conditionally join Tailwind class names and de-duplicate conflicting utilities.
 *
 * Standard shadcn/ui pattern: `clsx` for conditional logic + `tailwind-merge`
 * to resolve conflicts (e.g. `cn('p-2', 'p-4')` → `'p-4'`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
