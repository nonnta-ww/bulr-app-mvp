// jest-dom のカスタムマッチャ（toBeInTheDocument 等）を vitest の expect に登録する。
// マッチャ拡張のみで DOM を要求しないため、node 環境のテストでも安全に読み込める。
// UI コンポーネントのテストはファイル先頭に `// @vitest-environment jsdom` を付けて
// jsdom 環境を選択する。
import "@testing-library/jest-dom/vitest";
