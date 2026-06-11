import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * apps/business のテストランナー設定。
 *
 * - 純粋な単体テスト（lib/capture/* の決定論ロジック等）と
 *   ローカル Docker Postgres を使う統合テストの双方を node 環境で実行する。
 * - `.env.local`（apps/business 直下）の DATABASE_URL 等を読み込み test.env に流す。
 *   これにより DB 統合テストが `pnpm --filter @bulr/business test` だけで走る
 *   （インライン env 指定不要）。実行時に inline で渡した env はそちらが優先される。
 */
function loadDotEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const raw = readFileSync(resolve(__dirname, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key) env[key] = value;
    }
  } catch {
    // .env.local が無い環境（CI 等）では inline env / process.env を使う
  }
  return env;
}

export default defineConfig({
  resolve: {
    alias: {
      // Next.js の `@/*` エイリアスを vitest でも解決する（tsconfig.json paths と対応）
      "@": resolve(__dirname),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    env: { ...loadDotEnvLocal(), ...process.env },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
