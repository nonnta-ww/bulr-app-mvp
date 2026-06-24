import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * apps/admin のテストランナー設定。
 *
 * - 純粋な単体テスト（lib/* のテンプレート等）と
 *   ローカル Docker Postgres を使う統合テストの双方を node 環境で実行する。
 * - `.env.local`（monorepo root 直下）の DATABASE_URL 等を読み込み test.env に流す。
 *   これにより DB 統合テストが `pnpm --filter @bulr/admin test` だけで走る
 *   （インライン env 指定不要）。実行時に inline で渡した env はそちらが優先される。
 */
function loadDotEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {};

  // まず apps/admin/.env.local を試み、次に monorepo root の .env.local を試みる
  const candidates = [
    resolve(__dirname, '.env.local'),
    resolve(__dirname, '../../.env.local'),
  ];

  for (const envPath of candidates) {
    try {
      const raw = readFileSync(envPath, 'utf8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (key && !env[key]) env[key] = value;
      }
      // 最初に見つかったファイルで break しない（両方をマージする）
    } catch {
      // ファイルが無い環境（CI 等）ではスキップ
    }
  }

  return env;
}

export default defineConfig({
  resolve: {
    alias: {
      // Next.js の `@/*` エイリアスを vitest でも解決する（tsconfig.json paths と対応）
      '@': resolve(__dirname),
    },
  },
  test: {
    environment: 'node',
    include: [
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
      'app/**/*.test.ts',
      'app/**/*.test.tsx',
    ],
    env: { ...loadDotEnvLocal(), ...process.env },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
