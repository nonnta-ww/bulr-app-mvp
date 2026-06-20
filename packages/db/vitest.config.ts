import { defineConfig } from 'vitest/config';

// 統合テスト（実 DB 接続）。DATABASE_URL が未設定の場合はテスト側で describe.skip する。
// CI ではテストを実行しない（typecheck/lint/audit のみ）。ローカルでは
//   pnpm db:up && DATABASE_URL=postgres://bulr:dev_password@localhost:5434/bulr_dev pnpm --filter @bulr/db test
// のように実 DB を指定して実行する。スキーマは migrator で自己適用する。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
