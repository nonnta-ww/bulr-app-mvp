import { defineConfig } from "vitest/config";

export default defineConfig({
  // JSX を自動ランタイム（react/jsx-runtime）で変換する。これがないと
  // classic runtime が使われ UI テストで `React is not defined` になる。
  esbuild: { jsx: "automatic" },
  test: {
    // 既定は node。UI/コンポーネントテストはファイル先頭の
    // `// @vitest-environment jsdom` で jsdom 環境を選択する。
    environment: "node",
    include: ["app/**/*.test.ts", "app/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
