import { defineConfig } from "vitest/config";

export default defineConfig({
  // JSX を自動ランタイム（react/jsx-runtime）で変換する。これがないと
  // classic runtime が使われ UI テストで `React is not defined` になる。
  esbuild: { jsx: "automatic" },
  test: {
    // 既定は node。UI/コンポーネントテストはファイル先頭の
    // `// @vitest-environment jsdom` で jsdom 環境を選択する。
    environment: "node",
    include: [
      "app/**/*.test.ts",
      "app/**/*.test.tsx",
      "lib/**/*.test.ts",
      "lib/**/*.test.tsx",
    ],
    setupFiles: ["./vitest.setup.ts"],
    // next/dynamic(ssr:false) + recharts のコンポーネントテストは CI 高負荷時に
    // 既定 5s を超えることがあるため余裕を持たせる（findBy 側は 10s を指定）。
    testTimeout: 20_000,
  },
});
