import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit (push / generate / migrate / studio) は直接接続を使う。
 *
 * Neon の pooled connection (PgBouncer transaction pooling) は prepared
 * statement のセッション越え・advisory lock・トランザクション跨ぎのセッション
 * 状態など、migration コマンドが踏みうるパターンで不安定になる。
 *
 * 優先順位: DIRECT_URL > DATABASE_URL
 *   - DIRECT_URL: Neon の direct (non-pooled) connection URL を推奨
 *   - DATABASE_URL: 後方互換 (ローカル Docker 等で 1 URL しか無い構成のため fallback)
 *
 * ランタイム接続 (packages/db/src/client.ts) は引き続き DATABASE_URL を使う
 * (pooled connection が短い・並行多数のサーバレス用途に有利)。
 */
const migrationUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!migrationUrl) {
  throw new Error(
    'DIRECT_URL も DATABASE_URL も設定されていません。.env.local もしくは Vercel 環境変数を確認してください。',
  );
}

export default defineConfig({
  // テストファイル（*.test.ts / *.integration.test.ts）はスキーマとして読み込まない
  schema: './src/schema/!(*.test|*.integration.test).ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: migrationUrl },
});
