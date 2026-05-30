import type { Config } from 'tailwindcss';
import { bulrTailwindPreset } from '@bulr/ui';

const config: Config = {
  presets: [bulrTailwindPreset],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
