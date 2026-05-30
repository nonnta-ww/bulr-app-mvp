// @bulr/ui — shared UI primitives and Tailwind preset.
//
// Public exports for the shared shadcn/ui primitive set used by
// apps/web (and future apps). Keeps each app from re-implementing
// the same shadcn building blocks.

// Utilities
export { cn } from './lib/utils';
export { default as bulrTailwindPreset } from './tailwind-preset';

// Primitives
export { Button, buttonVariants, type ButtonProps } from './components/button';
export { Input, type InputProps } from './components/input';
export { Label } from './components/label';

export {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  useFormField,
} from './components/form';

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './components/card';
