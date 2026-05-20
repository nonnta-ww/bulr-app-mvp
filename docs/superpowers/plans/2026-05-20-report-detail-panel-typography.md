# 面接レポート 観察タブ詳細パネル タイポグラフィ整合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** レポート観察タブの右側詳細パネル (`PatternDetailPanel`) のフォントサイズと行間を、面接セッション中の右ドロワー (`AnalysisResultDrawer`) に揃える。

**Architecture:** 単一ファイル (`pattern-detail-panel.tsx`) の className 修正のみ。本文コンテナの基底クラスを `text-xs` → `text-sm leading-relaxed` に変更し、子要素はラベル類だけ `text-xs` に明示落とす（DRY）。子要素で使われている `text-[10px]` / `text-[11px]` の任意ピクセル指定は標準の `text-xs` に統一する。

**Tech Stack:** TypeScript / Next.js 16 + React 19 / Tailwind CSS v4 / 本リポジトリは UI 単体テストフレーム未導入のため、検証は `pnpm typecheck` + `pnpm lint` + ブラウザでの手動目視確認で行う。

**設計の根拠:** `docs/superpowers/specs/2026-05-20-report-detail-panel-typography-design.md`

**重要な前提:**
- main ブランチに直接コミット（プロジェクトの既定運用）。
- 2 コミット構成: T1 = className 修正＋自動チェック / T2 = 手動ブラウザ確認（コミット無し）。
- `analysis-result-drawer.tsx` は無変更（基準コンポーネント）。
- 印刷用 CSS (`report-print.css`) は無変更（スコープ外）。

---

## File Structure

### 修正

```
apps/web/app/(interviewer)/interviews/_components/report/pattern-detail-panel.tsx  # className 修正のみ
```

### 新規 / 削除

なし。

---

## Task 1: タイポグラフィ整合の className 修正

**Files:**
- Modify: `apps/web/app/(interviewer)/interviews/_components/report/pattern-detail-panel.tsx`

### Step 1: ヘッダーのパターン名見出しを `text-lg font-semibold` に変更

`apps/web/app/(interviewer)/interviews/_components/report/pattern-detail-panel.tsx` の以下 1 行を変更する。

変更前（現状 L60）:

```tsx
            <h3 className="text-sm font-bold text-gray-900">{pattern.pattern_title}</h3>
```

変更後:

```tsx
            <h3 className="text-lg font-semibold text-gray-900">{pattern.pattern_title}</h3>
```

ドロワー側の `<h4 className="text-lg font-semibold">` と同等にする。

### Step 2: 本文コンテナの基底フォントを `text-sm leading-relaxed` に変更

同ファイル現状 L73 を変更する。

変更前:

```tsx
        <div className="flex-1 p-4 text-xs">
```

変更後:

```tsx
        <div className="flex-1 p-4 text-sm leading-relaxed">
```

子要素のスコアセクション・関連ターン本文・評価メモ本文は全てこの親を継承するため、これだけで本文が `text-sm leading-relaxed` になる。

### Step 3: 詰まりタイプチップを `text-xs` に変更

同ファイル現状 L81–L83 を変更する。

変更前:

```tsx
              <div className="mb-2 rounded bg-white px-2 py-1 text-center text-[11px] font-semibold text-gray-700">
                詰まり: {STUCK_TYPE_LABEL[stuckType]}
              </div>
```

変更後:

```tsx
              <div className="mb-2 rounded bg-white px-2 py-1 text-center text-xs font-semibold text-gray-700">
                詰まり: {STUCK_TYPE_LABEL[stuckType]}
              </div>
```

任意ピクセル指定 `text-[11px]` を標準スケール `text-xs` (12px) に統一する。

### Step 4: 関連ターンのセクション見出しを `text-xs uppercase tracking-wide text-gray-500` に変更

同ファイル現状 L95–L97 を変更する。

変更前:

```tsx
            <h4 className="mb-2 text-[10px] uppercase tracking-wide text-gray-400">
              関連ターン ({relatedTurns.length}件)
            </h4>
```

変更後:

```tsx
            <h4 className="mb-2 text-xs uppercase tracking-wide text-gray-500">
              関連ターン ({relatedTurns.length}件)
            </h4>
```

ドロワー側のラベルクラス (`text-xs uppercase tracking-wide text-gray-500`) と一致させる。色も `text-gray-400` → `text-gray-500` に揃える。

### Step 5: 関連ターン Q 番号を `text-xs` に変更

同ファイル現状 L104 を変更する。

変更前:

```tsx
                    <p className="text-[10px] text-gray-500">Q{t.sequence_no}</p>
```

変更後:

```tsx
                    <p className="text-xs text-gray-500">Q{t.sequence_no}</p>
```

### Step 6: 評価メモのセクション見出しを `text-xs uppercase tracking-wide text-gray-500` に変更

同ファイル現状 L114–L116 を変更する。

変更前:

```tsx
            <h4 className="mb-2 text-[10px] uppercase tracking-wide text-gray-400">
              評価メモ
            </h4>
```

変更後:

```tsx
            <h4 className="mb-2 text-xs uppercase tracking-wide text-gray-500">
              評価メモ
            </h4>
```

### Step 7: typecheck と lint を実行

Run:

```bash
pnpm --filter @bulr/web typecheck
pnpm --filter @bulr/web lint
```

Expected: どちらも 0 エラーで終了。className 文字列の変更のみなので型・lint 違反は発生しない想定。

### Step 8: コミット

```bash
git add "apps/web/app/(interviewer)/interviews/_components/report/pattern-detail-panel.tsx"
git commit -m "$(cat <<'EOF'
style(report): align detail panel typography with session drawer

Make the right detail panel on the report's observation tab read at
the same density as the right drawer shown during an interview
session: body text bumps to text-sm leading-relaxed, the header h3
to text-lg font-semibold, and the section labels move from custom
text-[10px] to standard text-xs uppercase tracking-wide.
EOF
)"
```

---

## Task 2: ブラウザ手動確認（コミット無し）

**Files:** なし（dev サーバ起動と目視確認のみ）

### Step 1: dev サーバが起動していることを確認、必要なら再起動

Run:

```bash
lsof -i :3020 -P -n 2>/dev/null | head -3
```

Expected: `node` プロセスが `*:3020 (LISTEN)` で表示される。

起動していない場合 / 既起動でも CSS 変更を確実に反映したい場合:

```bash
pnpm --filter @bulr/web dev
```

### Step 2: レポート観察タブで詳細パネルを開く

ブラウザで以下を実施:

1. サインインして既存の完了済み面接セッションのレポート画面 (`/interviews/{sessionId}/report`) を開く
2. 「観察」タブを選択
3. 任意のパターン行をクリックして右側に詳細パネルを開く

Expected:
- ヘッダーのパターン名 (`<h3>`) が以前より大きく描画されている（18px）
- スコアセクションの「到達段階」「Authenticity」「Judgment」等の行が以前より大きく、行間も広く読める（14px / leading-relaxed）
- 「関連ターン (N件)」「評価メモ」の **uppercase ラベル**が `text-gray-500` の落ち着いた色で、以前の極小サイズ (10px) ではなく **12px** で表示される
- 関連ターンの `Q1` `Q2` 等の番号も 12px

### Step 3: 同一セッションで質問ターンドロワーを開く

ブラウザで以下を実施:

1. 同じセッションの面接実行画面（または別タブで進行中セッション）を開き、進行ステップ内で質問ターンをクリック
2. 右側に `AnalysisResultDrawer` が開く

Expected:
- 詳細パネル（Step 2 で確認）と**同等のフォントサイズ・行間**で表示される
- 本文ブロックの 14px / leading-relaxed が同じ
- セクションラベル (`text-xs uppercase ... text-gray-500`) が同じ色・同じサイズ

### Step 4: スクロールとレイアウトの確認

関連ターンが 5 件以上あるパターンを開いて、以下を確認:

- 縦スクロールが正常に動作する
- パネル幅 (`w-80` = 320px) からはみ出るテキストが折り返される
- ヘッダーと本文の境界線がはっきり描画されている

### Step 5: dev サーバを停止

タスクで起動した場合のみ `Ctrl+C` で停止する（既起動だった場合は触らない）。コミットは無し。

---

## 完了条件

- T1 の 1 コミットが main に積まれている
- T2 のブラウザ確認 4 ステップ全てが期待通り
- `pnpm --filter @bulr/web typecheck` と `pnpm --filter @bulr/web lint` が 0 エラー
- ドロワー側 (`analysis-result-drawer.tsx`) と印刷用 CSS (`report-print.css`) は無変更
