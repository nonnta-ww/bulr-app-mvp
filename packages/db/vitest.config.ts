import { defineConfig } from 'vitest/config';

// 統合テスト（実 DB 接続）。DATABASE_URL が未設定の場合はテスト側で describe.skip する。
// CI では Postgres サービス + DATABASE_URL を与えて実行する（.github/workflows/ci.yml）。
// ローカルでは
//   pnpm db:up && DATABASE_URL=postgres://bulr:dev_password@localhost:5434/bulr_dev pnpm --filter @bulr/db test
// のように実 DB を指定して実行する。スキーマは migrator で自己適用する。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // seed 統合テストは共有テーブル（skill_survey_* など）の総数を数えるため、
    // ファイル並列だと互いの seed が干渉して冪等カウントが崩れる。直列実行を強制する。
    fileParallelism: false,
  },
});
