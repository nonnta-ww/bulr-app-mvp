# 面接レポート AIサマリー Markdown 整形 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 面接レポート画面の AIサマリーを「見出し付き Markdown」で出力・描画するよう、LLM プロンプトと Tailwind Typography の両側を改修する。

**Architecture:** プロンプト側で固定 Markdown スケルトン（`## 評価軸別所感` / `## カテゴリ別カバレッジ` / `## フリー質問総評`）を強制し、表示側で `@tailwindcss/typography` プラグインを有効化して `prose` クラスを機能させる。既存サマリーの再生成は行わない（後方互換は ReactMarkdown が平文を `<p>` 描画することで担保）。

**Tech Stack:** TypeScript / pnpm workspace (turbo) / Next.js 16 + React 19 / Tailwind CSS v4 / react-markdown v9 / Vercel AI SDK + Anthropic / 本リポジトリは単体テストフレーム未導入のため、検証は `pnpm typecheck` + `pnpm lint` + ブラウザでの手動確認で行う。

**設計の根拠:** `docs/superpowers/specs/2026-05-20-ai-summary-markdown-design.md`

**重要な前提:**
- main ブランチに直接コミットする運用（既存方針）。
- 4 コミット構成: T1 = プロンプト改修 / T2 = typography 依存追加 / T3 = globals.css + page.tsx スタイル / T4 = 手動確認（コミット無し）。
- 各タスクは独立。typecheck エラーが残るシーケンスはない。
- 既存 `summary_text` の DB 値はそのまま残し、バックフィルしない。

---

## File Structure

### 修正

```
packages/ai/src/functions/generate-session-report.ts                            # buildPrompt の「## タスク」と SESSION_REPORT_SUPPLEMENT に Markdown 構造指示を追加
apps/web/package.json                                                           # @tailwindcss/typography を dependencies に追加（pnpm が自動更新）
apps/web/app/globals.css                                                        # @plugin "@tailwindcss/typography"; を追記
apps/web/app/(interviewer)/interviews/[sessionId]/report/page.tsx               # サマリー <div> の className に prose-* モディファイアを追加
pnpm-lock.yaml                                                                  # pnpm install が自動更新
```

### 新規 / 削除

なし。

---

## Task 1: LLM プロンプトに Markdown 構造指示を追加

**Files:**
- Modify: `packages/ai/src/functions/generate-session-report.ts`

### Step 1: `buildPrompt` の「## タスク」ブロックを置換

`packages/ai/src/functions/generate-session-report.ts` の L57–L64（`parts.push(\`## タスク … \`);` の1ブロック）を以下に置き換える:

```typescript
  const freeQuestionsSectionInstruction =
    freeQuestions.length > 0
      ? '`## フリー質問総評` セクションを必ず含め、観察された傾向を箇条書きまたは短い段落で記述してください。'
      : '`## フリー質問総評` セクションは省略してください（フリー質問が無いため）。';

  parts.push(`## タスク
候補者の面接観察事実を簡潔にまとめた summary_text（10000 文字以内）を **Markdown 形式** で生成し、JSON で返してください。

### 出力フォーマット（厳守）
以下の固定スケルトンに沿って出力すること。見出しレベルは \`##\` から始め、\`#\` (h1) は使わない（ページ側の h1 と重複するため）。箇条書きは \`-\` を使い、番号付きリストは使わない。重要な観察事実のみ \`**bold**\` で控えめに強調可（多用しない）。

\`\`\`markdown
## 評価軸別所感

### Authenticity
- （観察された具体事実）
- （観察された具体事実）

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
\`\`\`

${freeQuestionsSectionInstruction}

### 内容要件
- 5 次元別所感は、数値の単純引用ではなくターンから観察された具体的な事実を記述する。
- カテゴリ別カバレッジは、各カテゴリの到達状況・詰まり状況を端的に列挙する。
- 採用推奨・不採用推奨・「中堅水準」「強み/弱み」のような評価ラベルは出さない（観察事実のみ）。`);
```

### Step 2: `SESSION_REPORT_SUPPLEMENT` を更新

同ファイル L69–L79 の `SESSION_REPORT_SUPPLEMENT` 定数全体を以下に置き換える:

```typescript
const SESSION_REPORT_SUPPLEMENT = `# レポート生成タスク固有の指示

## 出力形式
summary_text は **Markdown 形式** で出力すること。見出し（\`##\` / \`###\`）と箇条書き（\`-\`）を使い、面接官が視覚的にセクションを区別できる構造にすること。詳細フォーマットはユーザープロンプトの「出力フォーマット」を参照。

## フリー質問の扱い
フリー質問（pattern_id が null のターン）がある場合は、\`## フリー質問総評\` セクションを別途設け、観察された傾向を記述する。フリー質問が無い場合はセクション自体を省略する。

## 出力内容
- 候補者の観察事実の客観的な要約
- 5 次元別所感（観察された具体事実ベース）
- カテゴリ別のカバレッジ所感
- フリー質問の総評（ある場合）
- 採用可否に関わる判定や「強み/弱み」「中堅水準」のような評価ラベルを含めない`;
```

### Step 3: typecheck と lint

Run:

```bash
pnpm --filter @bulr/ai typecheck
pnpm --filter @bulr/ai lint
```

Expected: どちらも 0 エラーで終了。

### Step 4: コミット

```bash
git add packages/ai/src/functions/generate-session-report.ts
git commit -m "$(cat <<'EOF'
feat(ai): instruct session-report LLM to output structured markdown

Add an explicit markdown skeleton (## 評価軸別所感 / ## カテゴリ別カバレッジ
/ ## フリー質問総評) to the generate-session-report prompt so the AI
summary on the interview report page renders with visible section
hierarchy instead of one flat paragraph.
EOF
)"
```

---

## Task 2: `@tailwindcss/typography` を依存に追加

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`（自動）

### Step 1: パッケージを追加

Run:

```bash
pnpm --filter @bulr/web add @tailwindcss/typography
```

Expected: `apps/web/package.json` の `dependencies` に `"@tailwindcss/typography": "^0.5.x"`（最新の `0.5.x`、執筆時点で `^0.5.16` 系）が追加され、`pnpm-lock.yaml` が更新される。

### Step 2: 追加結果を確認

Run:

```bash
grep "@tailwindcss/typography" apps/web/package.json
```

Expected: `    "@tailwindcss/typography": "^0.5.xx",` のような 1 行が表示される。

### Step 3: typecheck（依存追加が他に副作用が無いことを確認）

Run:

```bash
pnpm --filter @bulr/web typecheck
```

Expected: 0 エラーで終了。

### Step 4: コミット

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
chore(web): add @tailwindcss/typography for AI summary markdown styling

Adds the official Tailwind typography plugin so the `prose` classes on
the interview report AI summary will actually apply styling. The plugin
is wired up in globals.css in the next commit.
EOF
)"
```

---

## Task 3: globals.css と report page.tsx の Markdown スタイル

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/(interviewer)/interviews/[sessionId]/report/page.tsx`

### Step 1: globals.css に `@plugin` ディレクティブを追加

`apps/web/app/globals.css` を以下の内容に置換する（現状 2 行のシンプルなファイル）:

```css
@import 'tailwindcss';
@plugin "@tailwindcss/typography";
```

Tailwind v4 はランタイム CSS で `@plugin` を解釈し、`tailwind.config.*` を介さずプラグインを有効化する。

### Step 2: page.tsx の AIサマリー `<div>` className を更新

`apps/web/app/(interviewer)/interviews/[sessionId]/report/page.tsx` の L84–L89 の `<section>` ブロックを以下に置換する:

```tsx
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-800">AIサマリー</h2>
          <div className="prose prose-sm max-w-none text-gray-700 prose-headings:text-gray-900 prose-h2:mt-6 prose-h2:mb-2 prose-h3:mt-4 prose-h3:mb-1 prose-ul:my-2 prose-li:my-0.5">
            <ReactMarkdown>{report.summary_text}</ReactMarkdown>
          </div>
        </section>
```

差分は `<div>` の `className` のみ。元の `prose prose-sm max-w-none text-gray-700` に `prose-headings:text-gray-900 prose-h2:mt-6 prose-h2:mb-2 prose-h3:mt-4 prose-h3:mb-1 prose-ul:my-2 prose-li:my-0.5` を追加する。

### Step 3: typecheck と lint

Run:

```bash
pnpm --filter @bulr/web typecheck
pnpm --filter @bulr/web lint
```

Expected: どちらも 0 エラーで終了。

### Step 4: コミット

```bash
git add apps/web/app/globals.css "apps/web/app/(interviewer)/interviews/[sessionId]/report/page.tsx"
git commit -m "$(cat <<'EOF'
feat(report): style AI summary markdown via tailwind typography

Enable the @tailwindcss/typography plugin in globals.css and tune
prose-h2 / prose-h3 / prose-ul / prose-li spacing on the AI summary
container so the new markdown structure (## 評価軸別所感 etc.) reads
with clear section hierarchy without overshooting the surrounding card
padding.
EOF
)"
```

---

## Task 4: 手動ブラウザ確認（コミット無し）

**Files:** なし（ローカル実行と目視確認のみ）

### Step 1: dev サーバを起動

Run:

```bash
pnpm --filter @bulr/web dev
```

Expected: `http://localhost:3020` で Next.js dev サーバが起動する。

### Step 2: 面接を1件完走してレポートを生成

ブラウザで以下を実施:

1. サインインして面接官として既存パターンで面接を開始
2. 1 つ以上のパターンを最後まで進める
3. 任意でフリー質問を 1 件追加する
4. 「面接終了」を押す
5. レポート画面（`/interviews/{sessionId}/report`）に遷移する

Expected: 「AIサマリー」セクション内に以下が**視覚的に区別された状態で**表示される:
- `## 評価軸別所感` が `h2` として太字・大きめに描画される
- `### Authenticity` 〜 `### AI literacy` の 5 つの `h3` がインデントされた箇条書きの上に並ぶ
- 各 `h3` 下の `- ...` 箇条書きがブレットインデント付きで描画される
- `## カテゴリ別カバレッジ` セクションが続く
- フリー質問を入れた場合、`## フリー質問総評` セクションが末尾に表示される

### Step 3: フリー質問なしのケースを確認

別のセッションでフリー質問を**入れずに**面接を完走し、レポート画面で `## フリー質問総評` セクションが**省略されている**ことを確認する。

### Step 4: 既存（旧フォーマット）レポートの後方互換を確認

新フォーマット適用前に生成済みの過去レポート（DB に平文で保存されているもの）を 1 件開き、平文段落として崩れずに表示されることを確認する。レポート画面のヘッダーやヒートマップ等、サマリー以外のレイアウトに影響が無いことも合わせて目視する。

### Step 5: dev サーバを停止

`Ctrl+C` で停止。コミットは無し。

---

## 完了条件

- T1〜T3 の 3 コミットが main に積まれている
- T4 のブラウザ確認 4 ステップ全てが期待通り
- `pnpm --filter @bulr/web typecheck` と `pnpm --filter @bulr/ai typecheck` が 0 エラー
- 既存レポート画面が崩れていない
