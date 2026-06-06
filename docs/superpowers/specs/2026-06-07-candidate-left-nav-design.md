# 候補者アプリ 左ナビゲーション（開閉式）設計

- **日付**: 2026-06-07
- **対象**: `apps/candidate`（bulr.net / port 3020）のみ
- **目的**: 認証済み候補者が、アクセス可能な全機能ページへ常時ナビゲートできるようにする。現状はホーム `/` に「自己分析」カード 1 枚しか導線が無く、スキルアンケート等へ到達できない（＝「過去の診断しか見えず新規診断できない」と感じる原因）。

## スコープ

- **In**: 左サイド開閉式ナビ（ミニレール）＋上部バー統合（candidate アプリ内）。ナビ 6 項目。アクティブ強調、開閉状態の永続化、モバイル drawer。
- **Out**: business / admin への展開（項目が異なるため必要時に各アプリで同パターン複製。共有 package には入れない＝アプリ別文面を package に持たない方針 [feedback_package_dependency_direction] に準拠）。ホーム `/` のカード拡充（別途・任意）。正式なビジュアルデザイン（後日）。新規サーバー/DB ロジック。

## ナビ項目（6）

| ラベル | href | lucide アイコン（案） | アクティブ判定 |
|---|---|---|---|
| ホーム | `/` | `Home` | 完全一致（`/` のみ） |
| スキルアンケート | `/skill-survey` | `ClipboardList` | 前方一致 |
| 自己分析 | `/self-analysis` | `BarChart3` | 前方一致 |
| 履歴書 | `/resume` | `FileText` | 前方一致 |
| 模擬面接 | `/mock-interview` | `MessageSquare` | 前方一致 |
| エントリー | `/entries` | `Send` | 前方一致 |

> `/` だけは前方一致だと全ページに一致するため**完全一致**で判定する。

## アーキテクチャ（アプリシェル）

```
┌─ 上部バー ─────────────────────────┐
│ ☰  bulr                ✉ email  [→ ログアウト] │
├────┬──────────────────────────────┤
│ 🏠 ホーム │                              │
│ 📝 スキル │        本文 = children          │
│ 📊 自己分析│                              │
│ 📄 履歴書 │                              │
│ 💬 模擬面接│                              │
│ ✉ エントリー│                             │
└────┴──────────────────────────────┘
```

- `app/layout.tsx`（Server）: `getCurrentUser()` で email/認証状態を取得し、`<AppShell userEmail={email | null}>{children}</AppShell>` でラップ。
- `AppShell`（Client）: `usePathname()` で判定し、**未認証 / `/sign-in` / `/onboarding`** では枠を描画せず `children` のみ返す。それ以外は上部バー＋左サイドバー＋本文を配置。`collapsed`（デスクトップのレール）と `mobileOpen`（ドロワー）の state を管理。
- 既存 Server `Header` は廃止し上部バーを AppShell に統合。`SignOutButton` は再利用。

## コンポーネント

- `app/_components/app-shell.tsx`（Client）: レイアウト枠・state 管理・上部バー（☰ トグル＋ロゴ＋SignOutButton）
- `app/_components/sidebar.tsx`（Client）: `nav-items` を描画、`usePathname()` でアクティブ強調、`collapsed` 時はアイコンのみ＋ホバーでツールチップ
- `app/_components/nav-items.ts`: `{ label, href, icon, match: 'exact' | 'prefix' }` の配列（純データ）
- `app/layout.tsx`: 改修（Header → AppShell）
- 既存 `header.tsx`: 撤去（AppShell に統合）。`sign-out-button.tsx` は流用

> すべて `apps/candidate` 内。依存方向 apps→packages を維持。

## 挙動

- **デスクトップ（≥ `md`）**: サイドバー常時表示。☰ で「展開（アイコン＋ラベル）↔ アイコンのみレール」をトグル。レール時はホバーでラベルをツールチップ表示。
- **モバイル（< `md`）**: サイドバーは隠れ、☰ でオーバーレイ drawer＋半透明背景。リンク選択 / 背景タップ / Esc で閉じる。
- **アクティブ強調**: `usePathname()`。`/` は完全一致、他は前方一致（ネスト配下も点灯）。
- **状態永続化**: 展開/レールの選択を `localStorage`（キー例 `bulr.nav.collapsed`）に保存。既定＝展開。`mobileOpen` は揮発。
- **CSP**: 現状 `script-src 'self' 'unsafe-inline'`（dev は `unsafe-eval`）で問題なし（eval 不使用、localStorage は許容）。

## データフロー / エラー

純クライアント UI 状態（`collapsed` / `mobileOpen`）＋ `usePathname` のみ。DB アクセス・新規サーバーコードなし。`userEmail` は layout から props。認証/リダイレクトは各ページの既存ガードが担当（本シェルは表示制御のみ）。

## アクセシビリティ

- 上部バーの ☰ は `aria-label` 付きボタン、`aria-expanded` を反映。
- サイドバーは `<nav aria-label="メインナビゲーション">`、アクティブ項目に `aria-current="page"`。
- モバイル drawer は開時にフォーカストラップ不要の軽量実装でよいが、Esc と背景クリックで閉じる。

## テスト（Stage 1 方針：手動 smoke ＋ typecheck ＋ build）

1. 認証済みページ（`/`, `/skill-survey`, `/self-analysis`, `/resume`, `/mock-interview`, `/entries`）で枠＋ナビが表示される
2. `/sign-in`・`/onboarding` では枠が表示されない（children のみ）
3. 各ナビリンクが正しく遷移し、現在地が強調される（ネスト配下でも親項目が点灯）
4. デスクトップで ☰ により展開↔レールが切替わり、リロード後も状態が保持される（localStorage）
5. モバイル幅で drawer が開閉する（リンク選択・背景・Esc で閉じる）
6. `pnpm --filter candidate typecheck` ＋ `pnpm --filter candidate build` が成功
7. ログアウトが従来どおり機能する

## 影響を受けるファイル

- 改修: `apps/candidate/app/layout.tsx`
- 新規: `apps/candidate/app/_components/app-shell.tsx`, `sidebar.tsx`, `nav-items.ts`
- 撤去: `apps/candidate/app/_components/header.tsx`（AppShell へ統合）
- 流用: `apps/candidate/app/_components/sign-out-button.tsx`
