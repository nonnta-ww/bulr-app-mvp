# 面接レポート 観察タブ詳細パネル タイポグラフィ整合 — Design Spec

**作成日**: 2026-05-20
**対象画面**: `/interviews/[sessionId]/report` の観察タブで開く右側ドリルダウンパネル
**関連ファイル**:
- 修正対象: `apps/web/app/(interviewer)/interviews/_components/report/pattern-detail-panel.tsx`
- 基準（無変更）: `apps/web/app/(interviewer)/interviews/_components/agenda/analysis-result-drawer.tsx`

---

## 1. 背景

レポート画面の観察タブからパターンをクリックすると、右側に詳細パネル (`PatternDetailPanel`) が開く。一方、面接セッション中にも質問ターンを開くと右側にドロワー (`AnalysisResultDrawer`) が表示される。両者は役割が似ているにも関わらず、**フォントサイズと行間が大きく異なる**:

- レポート詳細パネル: ベース `text-xs` (12px)、見出し `text-sm`、極小ラベル `text-[10px]`
- セッション中のドロワー: ベース `text-base` (16px)、見出し `text-lg`、本文ブロック `text-sm leading-relaxed`

結果として、同じ「右側の補助情報パネル」というメンタルモデルの中で、レポート側が小さく詰まって見える。本タスクではドロワー側のタイポグラフィを基準としてレポート詳細パネルを揃える。

## 2. 設計原則

- **ドロワーは無変更**。既存運用の安定したコンポーネントを基準とし、レポート側だけを寄せる。
- 変更は `pattern-detail-panel.tsx` 1 ファイルのみ。
- 親の `<div>` に `text-sm leading-relaxed` を 1 回適用 → 子要素はラベル類だけ `text-xs` で明示的に絞る（DRY）。
- 幅・パディング・色味・レイアウト構造は変更しない（ユーザー指示は「フォントサイズと行間」のみ）。
- 印刷用 CSS (`report-print.css`) は触らない。

## 3. 仕様

### 3.1 変更マトリクス

`pattern-detail-panel.tsx` の以下を変更する:

| 箇所 | 現状の className 該当部分 | 変更後 |
|---|---|---|
| ヘッダー `<h3>` パターン名 | `text-sm font-bold text-gray-900` | `text-lg font-semibold text-gray-900` |
| パターンコード `<p>` | `font-mono text-xs font-bold text-cyan-700` | 変更なし（ラベル相当の小サイズで OK） |
| 本文コンテナ `<div>` (L73) | `flex-1 p-4 text-xs` | `flex-1 p-4 text-sm leading-relaxed` |
| 詰まりタイプ チップ `<div>` | `... text-[11px] font-semibold ...` | `... text-xs font-semibold ...` |
| セクションラベル `<h4>`（関連ターン / 評価メモ） | `mb-2 text-[10px] uppercase tracking-wide text-gray-400` | `mb-2 text-xs uppercase tracking-wide text-gray-500` |
| 関連ターン Q 番号 `<p>` | `text-[10px] text-gray-500` | `text-xs text-gray-500` |
| 関連ターン質問文 `<p>` | `text-gray-700`（親 `text-xs` を継承） | `text-gray-700`（親 `text-sm leading-relaxed` を継承） |
| 評価メモ本文 `<div>` | `... text-gray-700 whitespace-pre-wrap`（親 `text-xs` 継承） | `... text-gray-700 whitespace-pre-wrap`（親 `text-sm leading-relaxed` 継承） |

注意:
- ヘッダー左カラムの **パターンコード** は意図的に小さいまま（コード値はメタ情報なので大きく見せる必要がない）。ドロワー側のラベル `text-xs uppercase` と同水準。
- スコアセクションの `<div className="my-0.5 flex justify-between">` は class そのものは変えず、親が `text-sm` になることで自動的に拡大される。
- 詰まりタイプチップの色 (`bg-white text-gray-700`) は変更しない。

### 3.2 期待される視覚効果

- 本文コンテンツ（質問文・評価メモ・スコア数値）は drawer の本文ブロックと**同じ 14px / leading-relaxed**
- セクションラベル（関連ターン / 評価メモ）は drawer のラベル (`text-xs uppercase tracking-wide text-gray-500`) と**同一クラス**
- ヘッダー見出しは drawer の `<h4>` と**同じ 18px / font-semibold**

### 3.3 後方互換・データ移行

スタイル変更のみ。データ移行不要、API 変更なし、レイアウト構造変更なし。レポート画面以外には影響しない。

## 4. 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `apps/web/app/(interviewer)/interviews/_components/report/pattern-detail-panel.tsx` | 上記 3.1 の className 修正のみ |

## 5. テスト方針

- **`pnpm --filter @bulr/web typecheck`** が 0 エラー（className 文字列変更のみなので型は影響なし）
- **`pnpm --filter @bulr/web lint`** が 0 エラー
- **手動確認**:
  1. レポート画面の観察タブを開きパターンをクリック → 右パネルの font-size / 行間がドロワーと同等になっていること
  2. 同じセッション中に質問ターンを開きドロワーを確認 → 両者の本文・ラベルが視覚的に同等であること
  3. 関連ターンが多数あるパターンを開き、スクロール時のレイアウトが崩れないこと

## 6. スコープ外（YAGNI）

- `analysis-result-drawer.tsx` の改修
- パネル幅 (`w-80`) の変更
- パディング (`p-4` / `p-3`) の変更
- 色・スペーシング・レイアウト構造の見直し
- 印刷用 CSS (`report-print.css`) の調整

## 7. オープン論点

なし（仕様確定）。
