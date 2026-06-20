// jest-dom のカスタムマッチャ（toBeInTheDocument 等）を vitest の expect に登録する。
// マッチャ拡張のみで DOM を要求しないため、node 環境のテストでも安全に読み込める。
// UI コンポーネントのテストはファイル先頭に `// @vitest-environment jsdom` を付けて
// jsdom 環境を選択する。
import "@testing-library/jest-dom/vitest";

// jsdom には ResizeObserver が無いため、recharts の ResponsiveContainer が
// マウント時に落ちる。テスト用に最小スタブを供給する（両 env で安全）。
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
