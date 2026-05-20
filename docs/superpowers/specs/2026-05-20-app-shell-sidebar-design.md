# AppShell サイドバー設計

ログイン後の interviewer 画面に共通の左サイドバーと、メールアドレス表示・ログアウト UI を備えたユーザーメニューを導入する。

## 背景と目的

現状の問題：

- ログイン後にどの画面でも他ページへ遷移するナビゲーションが無い
- 誰がログインしているか UI 上で分からない
- ログアウト操作がブラウザから提供されていない（`signOut` は `lib/auth/client.ts` で export 済みだが未使用）

今後 interviewer 向けの機能追加が予定されているため、開閉可能な左サイドバーを土台として用意する。

## スコープ

対象：

- `(interviewer)/` ルートグループ配下の全認証ページ（`/interviews`, `/interviews/new`, `/interviews/[sessionId]`, `/interviews/[sessionId]/report`、新規追加の `/settings`）

対象外（Stage 1 では実装しない）：

- 管理画面 `/admin/*` — admin 側は Basic 認証 + 別ナビ要件があるため、将来 admin-review-panel スペックを進めるタイミングで別途設計
- ランディング `/`、サインイン `/sign-in`

## 構成方針

`apps/web/app/(interviewer)/layout.tsx` を新規追加し、サーバーコンポーネントで認証ガード + cookie 読取を行った上で、クライアントコンポーネントの `AppShell` をレンダリングする。`AppShell` がサイドバーと main 領域の 2 カラムレイアウトを担当する。

サイドバー、ユーザーメニュー等の共通コンポーネントは `apps/web/components/app-shell/` に配置する（`apps/web/components/` 直下は現在空。`structure.md` の「2 アプリ以上で参照する瞬間まで packages 化遅延」方針に沿い、当面 apps/web 内に直書き）。

## ファイル構成

### 新規

```
apps/web/
├── app/(interviewer)/
│   ├── layout.tsx                   # AppShell をラップ、未ログインなら /sign-in
│   └── settings/
│       └── page.tsx                 # 空のプレースホルダー（requireUser）
├── components/app-shell/
│   ├── app-shell.tsx                # Client。collapsed 状態管理 + レイアウト
│   ├── sidebar.tsx                  # Client。ロゴ・ナビ・ユーザーアイコン
│   └── user-menu.tsx                # Client。ポップオーバー（email + ログアウト）
```

### 移動

```
app/(interviewer)/sign-in/page.tsx          → app/sign-in/page.tsx
app/(interviewer)/sign-in/sign-in-form.tsx  → app/sign-in/sign-in-form.tsx
```

URL `/sign-in` 自体は route group の付け外しで変わらないため、Better Auth コールバック・既存リンク・redirect に影響なし。実装時に `rg "/sign-in"` で全参照が URL ベースであることを確認する。

### 修正

`app/(interviewer)/interviews/page.tsx` ほか既存の interviewer ページ：

- `<main className="min-h-screen ...">` の `min-h-screen` を外す（AppShell の `<div className="flex h-screen overflow-hidden">` が枠を担当するため）
- `<main>` タグはページ側に残す（layout 側では `<div>` で包み、ネスト `<main>` を回避）

対象ファイル：

- `app/(interviewer)/interviews/page.tsx`
- `app/(interviewer)/interviews/new/page.tsx`
- `app/(interviewer)/interviews/[sessionId]/page.tsx`
- `app/(interviewer)/interviews/[sessionId]/report/page.tsx`

## サーバーレイアウト

`apps/web/app/(interviewer)/layout.tsx`（Server Component）：

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/guards';
import { AppShell } from '@/components/app-shell/app-shell';

export default async function InterviewerLayout({
  children,
}: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const collapsed = (await cookies()).get('sidebar-collapsed')?.value === '1';
  return (
    <AppShell email={user.email} initialCollapsed={collapsed}>
      {children}
    </AppShell>
  );
}
```

- 認証ガードは layout で 1 回、ただし各ページの `requireUser()` 呼び出しは `CVE-2025-29927` 教訓を踏まえて維持（fail-secure を多層で保つ）
- cookie で `sidebar-collapsed` を読み、SSR で初期状態を確定（チラつき防止）

## クライアント側 AppShell

`apps/web/components/app-shell/app-shell.tsx`：

- `useState(initialCollapsed)` で開閉状態を管理
- トグル時に `document.cookie = 'sidebar-collapsed=1; path=/; max-age=31536000; samesite=lax'`（1 年間）／オープン時は `max-age=0` で削除
- `window.matchMedia('(max-width: 767px)')` を `useEffect` で購読し、モバイル時は別 state（`mobileOpen`）でオーバーレイ切替
- レイアウト：

  ```tsx
  <div className="flex h-screen overflow-hidden bg-gray-50">
    <Sidebar ... />
    <div className="flex-1 overflow-y-auto">{children}</div>
  </div>
  ```

### 動作モード

| ブレークポイント | 状態 A | 状態 B |
| --- | --- | --- |
| デスクトップ（≥ 768px） | open（幅 224px / `w-56`） | icon-only（幅 56px / `w-14`） |
| モバイル（< 768px） | icon-only（幅 56px、常駐） | overlay-drawer（幅 256px、`fixed` で前面に） |

モバイルでオーバーレイを閉じるトリガー：

- 背景 (`fixed inset-0 bg-black/30`) クリック
- 同じトグルボタン再押下
- `Escape` キー

## Sidebar

`apps/web/components/app-shell/sidebar.tsx`：

- 上端：bulr ロゴ（小さい `font-semibold`）+ トグルボタン（`«` / `»` を inline SVG）
- ナビ項目：
  - `面接セッション` → `/interviews`
  - `設定` → `/settings`
- 各項目は inline SVG アイコン（24x24、stroke-width 1.5、`currentColor`）+ ラベル
- `usePathname()` で active 判定：
  - `/interviews` 配下 → 面接セッション active
  - `/settings` 配下 → 設定 active
- collapsed 時はラベル `<span>` を `hidden` に切り替え、`title` 属性でツールチップを提供（外部ライブラリ非依存）
- 下端：`UserMenu`

## UserMenu

`apps/web/components/app-shell/user-menu.tsx`：

- 円形アイコン（email 先頭 1 文字 大文字、`h-8 w-8 rounded-full bg-blue-600 text-white`）
- collapsed=false の時はアバター右に email を末尾省略（`truncate`）で表示
- クリックで上方向にポップオーバー：

  ```
  ┌──────────────────┐
  │ user@example.com │
  ├──────────────────┤
  │ ログアウト         │
  └──────────────────┘
  ```

- 外クリック / `Escape` キーで閉じる（`useEffect` で document に listener）
- `ログアウト` クリック → `signOut()`（`@/lib/auth/client`）→ `router.push('/sign-in')` + `router.refresh()`

### アクセシビリティ

- トグル：`aria-label="サイドバーを開閉"` + `aria-expanded={!collapsed}`
- UserMenu：`aria-haspopup="menu"` + `aria-expanded={open}`、popover 内ボタンに `role="menuitem"`
- ログアウトは `<button type="button">`

## 設定ページ

`apps/web/app/(interviewer)/settings/page.tsx`：

```tsx
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/guards';

export default async function SettingsPage() {
  try {
    await requireUser();
  } catch {
    redirect('/sign-in');
  }
  return (
    <main className="bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-900">設定</h1>
        <p className="mt-6 text-gray-500">準備中です。</p>
      </div>
    </main>
  );
}
```

## スタイル一覧（Tailwind v4）

| 要素 | クラス |
| --- | --- |
| Shell 外枠 | `flex h-screen overflow-hidden bg-gray-50` |
| Main 領域 | `flex-1 overflow-y-auto` |
| Sidebar 開 | `w-56 shrink-0 flex flex-col bg-white border-r border-gray-200 transition-[width] duration-200 ease-out` |
| Sidebar 閉 | `w-14 shrink-0 flex flex-col bg-white border-r border-gray-200 items-center transition-[width] duration-200 ease-out` |
| Brand 行 | `flex items-center justify-between px-4 py-4 border-b border-gray-100` |
| Nav 項目 | `flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100` |
| Nav active | `bg-blue-50 text-blue-700 font-medium` |
| User 行 | `mt-auto border-t border-gray-100 p-3` |
| User アバター | `flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white` |
| Popover | `absolute bottom-14 left-3 w-56 rounded-lg border border-gray-200 bg-white shadow-lg` |
| Popover ログアウト | `flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50` |
| Mobile 背景 | `fixed inset-0 z-40 bg-black/30` |
| Mobile ドロワー | `fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl` |

## 検証

実装後、`pnpm --filter @bulr/web dev` で dev server を起動して以下を手動確認：

1. 未ログイン状態で `/interviews` 直アクセス → `/sign-in` リダイレクト
2. Magic link ログイン後 → `/interviews` でサイドバー表示、面接セッション active
3. `/settings` クリック → 「準備中です。」表示、設定 active
4. サイドバートグル → アイコンのみ幅 56px に縮む、リロード後も状態保持（DevTools で `sidebar-collapsed` cookie 確認）
5. UserMenu クリック → email と ログアウト 表示、外クリックで閉じる
6. ログアウト → `/sign-in` リダイレクト、再度 `/interviews` アクセスで再びリダイレクト
7. DevTools で viewport を 375px に → サイドバーが icon-only、ハンバーガータップでオーバーレイ展開
8. `Escape` キーでオーバーレイが閉じる
9. 既存の `/interviews/[sessionId]`, `/interviews/[sessionId]/report`, `/interviews/new` でもサイドバーが正しく表示・スクロール正常

加えて：

- `pnpm --filter @bulr/web typecheck` が pass
- `pnpm --filter @bulr/web lint` が pass

## 想定リスク / 注意点

- **sign-in 移動時の参照漏れ**：実装前に `rg "/sign-in"` で全参照をリストアップ、URL ベース参照のみであることを確認
- **既存ページの `min-h-screen` 削除**：高さ計算がズレないよう、AppShell の `h-screen overflow-hidden` + main の `overflow-y-auto` で吸収
- **モバイル overlay のスクロールロック**：オーバーレイ表示中は body の overflow を hidden に（`useEffect` で `document.body.style.overflow` を切替）
- **アイコンライブラリ追加なし**：lucide-react 等を入れる選択肢もあるが、Stage 1 のミニマル方針に沿って inline SVG を 3〜5 個直書きで済ませる
