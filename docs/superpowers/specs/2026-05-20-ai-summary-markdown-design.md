# 面接レポート AIサマリー Markdown 整形 — Design Spec

**作成日**: 2026-05-20
**対象画面**: `/interviews/[sessionId]/report` の「AIサマリー」セクション
**関連ファイル**:
- 生成側: `packages/ai/src/functions/generate-session-report.ts`
- 表示側: `apps/web/app/(interviewer)/interviews/[sessionId]/report/page.tsx`

---

## 1. 背景

面接レポート画面の「AIサマリー」は `ReactMarkdown` で描画されているが、現状は以下2点で読みづらい:

1. **LLM 側がほぼ平文で出力している**。プロンプトに Markdown 構造（見出し・箇条書き）を要求する指示がなく、`generate-session-report.ts` の `buildPrompt` / `SESSION_REPORT_SUPPLEMENT` ともに「形式」の指示は皆無。
2. **`prose` クラスが効いていない**。`apps/web/app/(interviewer)/interviews/[sessionId]/report/page.tsx:86` で `prose prose-sm max-w-none text-gray-700` を適用しているが、`@tailwindcss/typography` プラグインが未導入のため、見出し・リスト・強調のスタイルが Tailwind v4 のデフォルト（リセット済み）のまま出力されている。

結果として面接官にとって「5次元別所感／カテゴリ別カバレッジ／フリー質問総評」の区切りが視覚的に把握できない。

## 2. 設計原則

- LLM プロンプトで **固定セクション構成の Markdown スケルトン** を明示する（自由な構成にせず、レポート間の一貫性を担保）。
- 表示側は **Tailwind 公式 `@tailwindcss/typography` プラグイン** を有効化して `prose` を機能させる。手書きの `components` マッピングや独自 CSS は使わない。
- 既存サマリー（平文で保存済み）は移行不要 — `ReactMarkdown` は平文も問題なく段落描画する。次回以降の面接生成から新フォーマットが適用される。
- GFM 拡張（テーブル・チェックボックス等）は導入しない。

## 3. 仕様: LLM プロンプト

### 3.1 出力 Markdown スケルトン

LLM には以下の **固定構造** を返すよう指示する:

```markdown
## 評価軸別所感

### Authenticity
- （観察された具体事実 1）
- （観察された具体事実 2）

### Judgment
- ...

### Scope
- ...

### Meta cognition
- ...

### AI literacy
- ...

## カテゴリ別カバレッジ

- **{カテゴリ名}**: （観察された到達状況・詰まり状況）
- **{カテゴリ名}**: ...

## フリー質問総評

- （観察された事実 / 全体の傾向）
```

「フリー質問総評」セクションは **`freeQuestions.length === 0` の場合は出力しない**（プロンプト側で条件を伝える）。

### 3.2 プロンプト改修ポイント

`packages/ai/src/functions/generate-session-report.ts` の以下2箇所を更新:

**(a) `buildPrompt` 内の「## タスク」ブロック**
- 「Markdown 形式で返してください」と明示
- 上記スケルトンを「以下の構造で出力すること」として埋め込む
- 「h1 (`#`) は使わず `##` から始める」（ページ側で `<h1>` 面接レポートと重複しないため）
- 「重要な観察事実のみ `**bold**` で強調可（多用しない）」
- 「箇条書きは `-` を使う（番号付きは使わない）」
- フリー質問が無い場合は「フリー質問総評」セクション自体を省略

**(b) `SESSION_REPORT_SUPPLEMENT`**
- 「出力内容」セクションに「Markdown の見出し・箇条書きを使い、視覚的に区別できる構造にすること」を追記
- 既存の評価ラベル禁止ルールは維持

### 3.3 文字数制限

既存の `SUMMARY_TEXT_LIMIT = 10000` は維持。Markdown 記号分も含めて 10,000 文字以内に収まる前提。

### 3.4 スキーマ・フォールバック

- `summaryOutputSchema` は変更なし（`summary_text: z.string()` のまま）
- `SAFE_SUMMARY_FALLBACK` は変更なし（短いフォールバック文字列で OK）

## 4. 仕様: 表示スタイリング

### 4.1 依存追加

`apps/web` 直下で:

```bash
pnpm --filter @bulr/web add @tailwindcss/typography
```

`pnpm` がレジストリ最新の `0.5.x` を解決して `dependencies` に追記する。手書きでバージョンを固定する必要はない。

### 4.2 Tailwind v4 設定

`apps/web/app/globals.css` を以下に変更:

```css
@import 'tailwindcss';
@plugin "@tailwindcss/typography";
```

Tailwind v4 では `tailwind.config.*` を使わず、`@plugin` ディレクティブで CSS から直接プラグインを有効化する。

### 4.3 サマリー描画

`apps/web/app/(interviewer)/interviews/[sessionId]/report/page.tsx:84-89` の「AIサマリー」`<section>` を以下に調整:

```tsx
<section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
  <h2 className="mb-4 text-lg font-semibold text-gray-800">AIサマリー</h2>
  <div className="prose prose-sm max-w-none text-gray-700 prose-headings:text-gray-900 prose-h2:mt-6 prose-h2:mb-2 prose-h3:mt-4 prose-h3:mb-1 prose-ul:my-2 prose-li:my-0.5">
    <ReactMarkdown>{report.summary_text}</ReactMarkdown>
  </div>
</section>
```

`prose-h2:mt-6` などのモディファイアは、Tailwind Typography のデフォルト余白がやや広いため、レポート内の他セクションと密度を揃える微調整。

### 4.4 既存レポートの後方互換

`ReactMarkdown` は平文を `<p>` で描画するため、既存の平文 `summary_text` は「見出しなしの段落」として表示される（現状とほぼ同じ）。**バックフィルは行わない**。

## 5. 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `packages/ai/src/functions/generate-session-report.ts` | `buildPrompt` と `SESSION_REPORT_SUPPLEMENT` を更新（Markdown スケルトン指示） |
| `apps/web/package.json` | `@tailwindcss/typography` を `dependencies` に追加 |
| `apps/web/app/globals.css` | `@plugin "@tailwindcss/typography";` を追記 |
| `apps/web/app/(interviewer)/interviews/[sessionId]/report/page.tsx` | サマリー `<div>` の `className` に `prose-*` モディファイアを追加 |
| `pnpm-lock.yaml` | `pnpm install` による自動更新 |

## 6. テスト方針

- **手動確認**:
  1. ローカルで面接を1件完走し、レポート画面で見出し（##・###）と箇条書きが視覚的に区別されることを確認
  2. フリー質問なしのセッションで「フリー質問総評」セクションが省略されることを確認
- **既存テスト**:
  - `packages/ai` のユニットテストでスキーマが変わっていないことを確認（変更なしのため通るはず）
  - `apps/web` の型チェック (`pnpm typecheck`) と Lint (`pnpm lint`) が通ること

## 7. スコープ外（YAGNI）

- 既存レポートの再生成・バックフィル
- `remark-gfm`（テーブル・打ち消し・チェックボックス）導入
- 印刷用 CSS (`report-print.css`) の調整
- サマリー本文以外（ヘッダー・他セクション）のスタイル変更
- 言語切替（現状日本語のみで運用）

## 8. オープン論点

なし（仕様確定）。
