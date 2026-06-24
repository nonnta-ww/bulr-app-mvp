import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: [
      // guards.ts に含まれる Next.js / server-only / DB モジュールを
      // vitest 環境でスタブに差し替えてユニットテストを可能にする
      {
        find: 'server-only',
        replacement: path.resolve(__dirname, 'src/__mocks__/server-only.ts'),
      },
      {
        find: 'next/headers',
        replacement: path.resolve(__dirname, 'src/__mocks__/next-headers.ts'),
      },
      {
        find: '@bulr/db/schema',
        replacement: path.resolve(__dirname, 'src/__mocks__/bulr-db-schema.ts'),
      },
      {
        find: '@bulr/db',
        replacement: path.resolve(__dirname, 'src/__mocks__/bulr-db.ts'),
      },
      // guards.ts 内部の ./server（createAuth）も DB を使うためスタブ化
      {
        find: /^\.\/server$/,
        replacement: path.resolve(__dirname, 'src/__mocks__/auth-server.ts'),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
