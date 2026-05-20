# AppShell サイドバー Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ログイン後の interviewer 画面（`/interviews/*` と新規 `/settings`）に共通の開閉式左サイドバーと、メールアドレス表示・ログアウト UI を備えたユーザーメニューを導入する。

**Architecture:** `(interviewer)/layout.tsx`（Server Component）で `getCurrentUser` + cookie 読取 → Client `AppShell` をレンダリングし、サイドバー（ロゴ・ナビ・ユーザーアイコン）と main 領域の 2 カラムを構成。`sign-in` は `(interviewer)/` グループの外に移動し、layout のガード対象から外す。

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, Better Auth (Magic Link), TypeScript

**Spec:** `docs/superpowers/specs/2026-05-20-app-shell-sidebar-design.md`

**注意 — テストについて:** apps/web には Vitest / Jest / Playwright などの単体テスト基盤が無い。本プランは TDD の代わりに **各タスク毎に「`pnpm --filter @bulr/web typecheck` + `pnpm --filter @bulr/web lint` + dev server で手動確認」** を検証ステップとする。

---

## Task 1: sign-in を `(interviewer)/` 外へ移動

**Files:**
- Move: `apps/web/app/(interviewer)/sign-in/page.tsx` → `apps/web/app/sign-in/page.tsx`
- Move: `apps/web/app/(interviewer)/sign-in/sign-in-form.tsx` → `apps/web/app/sign-in/sign-in-form.tsx`

**理由:** 次のタスクで追加する `(interviewer)/layout.tsx` が `getCurrentUser` を通すため、未認証ページの sign-in を同グループに置けない。URL `/sign-in` は route group の付け外しで変わらないので、proxy.ts・redirect・admin/login のリンクは無変更で動作する。

- [ ] **Step 1: 既存 `/sign-in` 参照を grep して URL ベースのみであることを確認**

Run:
```
rg "/sign-in" /Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/apps /Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/packages --type ts --type tsx --type md
```
Expected: `proxy.ts`, `app/admin/login/page.tsx`, 各 `app/(interviewer)/interviews/**/page.tsx` の `redirect('/sign-in')`、および sign-in 内部の `import './sign-in-form'` のみ。**ファイルパスインポート（`@/app/(interviewer)/sign-in/...`）が無いこと**を確認。

- [ ] **Step 2: ディレクトリ移動**

Run:
```
git mv "apps/web/app/(interviewer)/sign-in" "apps/web/app/sign-in"
```
Expected: ファイルが新しい場所に表示される。

- [ ] **Step 3: typecheck**

Run:
```
pnpm --filter @bulr/web typecheck
```
Expected: PASS（`./sign-in-form` 相対インポートは移動後も解決されるため）

- [ ] **Step 4: dev 起動 + sign-in 表示確認**

Run:
```
pnpm --filter @bulr/web dev
```
ブラウザで `http://localhost:3020/sign-in` を開く。
Expected: 既存と同じサインインフォームが表示される。

- [ ] **Step 5: コミット**

```bash
git add -A apps/web/app/sign-in apps/web/app/\(interviewer\)/sign-in
git commit -m "refactor(web): move sign-in route out of (interviewer) group"
```

---

## Task 2: `(interviewer)/layout.tsx` を追加（AppShell スタブ版）

**Files:**
- Create: `apps/web/app/(interviewer)/layout.tsx`
- Create: `apps/web/components/app-shell/app-shell.tsx`（スタブ）

このタスクは最小スケルトンのみ。本格的なサイドバー UI は後続タスクで肉付けする。

- [ ] **Step 1: AppShell スタブを作成**

Create `apps/web/components/app-shell/app-shell.tsx`:

```tsx
'use client';

/**
 * AppShell — interviewer 画面の共通シェル
 *
 * このタスク時点では最小スケルトン。サイドバー UI は後続タスクで実装。
 */

import { useState } from 'react';

type Props = {
  email: string;
  initialCollapsed: boolean;
  children: React.ReactNode;
};

export function AppShell({ email, initialCollapsed, children }: Props) {
  const [collapsed, _setCollapsed] = useState(initialCollapsed);
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside
        className={
          collapsed
            ? 'w-14 shrink-0 flex flex-col bg-white border-r border-gray-200'
            : 'w-56 shrink-0 flex flex-col bg-white border-r border-gray-200'
        }
        data-testid="app-shell-sidebar"
      >
        <div className="px-4 py-4 text-sm font-semibold">bulr</div>
        <div className="mt-auto px-3 py-3 text-xs text-gray-500 truncate" title={email}>
          {email}
        </div>
      </aside>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: `(interviewer)/layout.tsx` を作成**

Create `apps/web/app/(interviewer)/layout.tsx`:

```tsx
/**
 * Interviewer ルートグループのレイアウト
 *
 * - getCurrentUser で未ログインなら /sign-in へリダイレクト
 * - cookie から sidebar-collapsed を読み、AppShell に渡す
 * - 各ページの requireUser() 呼び出しは多層 fail-secure のため維持
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app-shell/app-shell';
import { getCurrentUser } from '@/lib/guards';

export default async function InterviewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }
  const cookieStore = await cookies();
  const collapsed = cookieStore.get('sidebar-collapsed')?.value === '1';
  return (
    <AppShell email={user.email} initialCollapsed={collapsed}>
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 3: typecheck + lint**

Run:
```
pnpm --filter @bulr/web typecheck && pnpm --filter @bulr/web lint
```
Expected: PASS

- [ ] **Step 4: dev で `/interviews` を開いて確認**

Run: dev server で `http://localhost:3020/interviews` を開く。
Expected:
- 未ログイン → `/sign-in` リダイレクト
- ログイン後 → 左に空のサイドバー枠（幅 224px、`bulr` ロゴ + 下端に email 表示）と既存のセッション一覧が表示される
- `/sign-in` ページではサイドバーが表示されないこと

- [ ] **Step 5: コミット**

```bash
git add apps/web/app/\(interviewer\)/layout.tsx apps/web/components/app-shell/app-shell.tsx
git commit -m "feat(app-shell): add interviewer layout with AppShell skeleton"
```

---

## Task 3: Sidebar コンポーネントを作成（ロゴ + トグルボタン）

**Files:**
- Create: `apps/web/components/app-shell/sidebar.tsx`
- Modify: `apps/web/components/app-shell/app-shell.tsx`

- [ ] **Step 1: Sidebar コンポーネントを作成**

Create `apps/web/components/app-shell/sidebar.tsx`:

```tsx
'use client';

/**
 * Sidebar — ロゴ・トグル・ナビ項目・ユーザーメニュー
 *
 * このタスクでは brand 行とトグルボタンのみ実装。
 * ナビ項目・UserMenu は後続タスク。
 */

type Props = {
  collapsed: boolean;
  onToggle: () => void;
};

export function Sidebar({ collapsed, onToggle }: Props) {
  return (
    <aside
      className={
        (collapsed
          ? 'w-14 items-center '
          : 'w-56 ') +
        'shrink-0 flex flex-col bg-white border-r border-gray-200 transition-[width] duration-200 ease-out'
      }
      data-testid="app-shell-sidebar"
    >
      <div
        className={
          (collapsed ? 'justify-center ' : 'justify-between ') +
          'flex items-center px-4 py-4 border-b border-gray-100 w-full'
        }
      >
        {!collapsed && (
          <span className="text-base font-semibold tracking-tight text-gray-900">bulr</span>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label="サイドバーを開閉"
          aria-expanded={!collapsed}
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <ChevronIcon direction={collapsed ? 'right' : 'left'} />
        </button>
      </div>
    </aside>
  );
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points={direction === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  );
}
```

- [ ] **Step 2: AppShell から Sidebar を呼ぶ + toggle 状態管理を追加**

Replace `apps/web/components/app-shell/app-shell.tsx` with:

```tsx
'use client';

/**
 * AppShell — interviewer 画面の共通シェル
 */

import { useState } from 'react';

import { Sidebar } from './sidebar';

type Props = {
  email: string;
  initialCollapsed: boolean;
  children: React.ReactNode;
};

export function AppShell({ email: _email, initialCollapsed, children }: Props) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
```

注: `email` はこのタスク時点で未使用。Task 5 で UserMenu に渡す。eslint の no-unused-vars を回避するため `_email` プレフィックスで分割代入する。

- [ ] **Step 3: typecheck + lint**

Run:
```
pnpm --filter @bulr/web typecheck && pnpm --filter @bulr/web lint
```
Expected: PASS

- [ ] **Step 4: dev で動作確認**

Open `http://localhost:3020/interviews`. Expected:
- サイドバー上端に `bulr` ロゴと `«` トグルボタン
- トグルボタンを押すと幅が 56px に縮み、ロゴが消えてトグルが `»` 形になる
- もう一度押すと開いた状態に戻る

- [ ] **Step 5: コミット**

```bash
git add apps/web/components/app-shell
git commit -m "feat(app-shell): add sidebar brand and toggle button"
```

---

## Task 4: ナビ項目（面接セッション / 設定）と active 判定を追加

**Files:**
- Modify: `apps/web/components/app-shell/sidebar.tsx`

- [ ] **Step 1: Sidebar にナビセクションを追加**

Replace `apps/web/components/app-shell/sidebar.tsx` with:

```tsx
'use client';

/**
 * Sidebar — ロゴ・トグル・ナビ項目・ユーザーメニュー
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Props = {
  collapsed: boolean;
  onToggle: () => void;
};

const NAV_ITEMS = [
  { href: '/interviews', label: '面接セッション', match: /^\/interviews(\/|$)/, icon: ClipboardIcon },
  { href: '/settings', label: '設定', match: /^\/settings(\/|$)/, icon: GearIcon },
] as const;

export function Sidebar({ collapsed, onToggle }: Props) {
  const pathname = usePathname();
  return (
    <aside
      className={
        (collapsed ? 'w-14 items-center ' : 'w-56 ') +
        'shrink-0 flex flex-col bg-white border-r border-gray-200 transition-[width] duration-200 ease-out'
      }
      data-testid="app-shell-sidebar"
    >
      <div
        className={
          (collapsed ? 'justify-center ' : 'justify-between ') +
          'flex items-center px-4 py-4 border-b border-gray-100 w-full'
        }
      >
        {!collapsed && (
          <span className="text-base font-semibold tracking-tight text-gray-900">bulr</span>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label="サイドバーを開閉"
          aria-expanded={!collapsed}
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <ChevronIcon direction={collapsed ? 'right' : 'left'} />
        </button>
      </div>

      <nav className={(collapsed ? 'px-1 ' : 'px-2 ') + 'flex flex-col gap-1 py-3 w-full'}>
        {NAV_ITEMS.map((item) => {
          const active = item.match.test(pathname ?? '');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-current={active ? 'page' : undefined}
              className={
                (collapsed ? 'justify-center ' : '') +
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ' +
                (active
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100')
              }
            >
              <Icon />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points={direction === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="8" y="4" width="8" height="3" rx="1" />
      <path d="M16 6h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
      <path d="M9 14h6" />
      <path d="M9 17h4" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
```

- [ ] **Step 2: typecheck + lint**

Run:
```
pnpm --filter @bulr/web typecheck && pnpm --filter @bulr/web lint
```
Expected: PASS

- [ ] **Step 3: dev で確認**

Open `http://localhost:3020/interviews`. Expected:
- ナビに「面接セッション」「設定」の 2 項目（クリップボード / 歯車アイコン付き）
- `/interviews` 表示中は「面接セッション」が青背景 (active)
- 「設定」をクリック → `/settings` に遷移（404 ページが出る — `/settings/page.tsx` は Task 6 で作成）
- 一旦 `/interviews/new` 等にも遷移して、`/interviews` 配下は常に「面接セッション」が active のままになることを確認
- collapsed 時はアイコンのみが中央寄せで残り、hover で `title` ツールチップが出る

- [ ] **Step 4: コミット**

```bash
git add apps/web/components/app-shell/sidebar.tsx
git commit -m "feat(app-shell): add sidebar nav items with active state"
```

---

## Task 5: UserMenu（メール + ログアウト popover）を追加

**Files:**
- Create: `apps/web/components/app-shell/user-menu.tsx`
- Modify: `apps/web/components/app-shell/sidebar.tsx`
- Modify: `apps/web/components/app-shell/app-shell.tsx`

- [ ] **Step 1: UserMenu コンポーネントを作成**

Create `apps/web/components/app-shell/user-menu.tsx`:

```tsx
'use client';

/**
 * UserMenu — サイドバー下端のユーザーアイコン + ポップオーバー
 *
 * クリックで上方向にポップオーバーを開き、メールアドレスと
 * ログアウトボタンを表示する。
 */

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { signOut } from '@/lib/auth/client';

type Props = {
  email: string;
  collapsed: boolean;
};

export function UserMenu({ email, collapsed }: Props) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setOpen(false);
      router.push('/sign-in');
      router.refresh();
    }
  }

  const initial = email.charAt(0).toUpperCase();

  return (
    <div ref={containerRef} className="relative mt-auto border-t border-gray-100 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="ユーザーメニュー"
        className={
          (collapsed ? 'justify-center ' : '') +
          'flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-gray-100'
        }
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white">
          {initial}
        </span>
        {!collapsed && (
          <span className="truncate text-sm text-gray-700" title={email}>
            {email}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-14 left-3 z-30 w-56 rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          <div className="border-b border-gray-100 px-3 py-2 text-xs text-gray-500 truncate" title={email}>
            {email}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <LogoutIcon />
            <span>{signingOut ? 'ログアウト中...' : 'ログアウト'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function LogoutIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
```

- [ ] **Step 2: Sidebar に email prop を追加し UserMenu をマウント**

Replace `apps/web/components/app-shell/sidebar.tsx` 内の `Props` と `Sidebar` 関数を更新（差分のみ抜粋。完全な置換は以下）:

```tsx
'use client';

/**
 * Sidebar — ロゴ・トグル・ナビ項目・ユーザーメニュー
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { UserMenu } from './user-menu';

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  email: string;
};

const NAV_ITEMS = [
  { href: '/interviews', label: '面接セッション', match: /^\/interviews(\/|$)/, icon: ClipboardIcon },
  { href: '/settings', label: '設定', match: /^\/settings(\/|$)/, icon: GearIcon },
] as const;

export function Sidebar({ collapsed, onToggle, email }: Props) {
  const pathname = usePathname();
  return (
    <aside
      className={
        (collapsed ? 'w-14 items-center ' : 'w-56 ') +
        'shrink-0 flex flex-col bg-white border-r border-gray-200 transition-[width] duration-200 ease-out'
      }
      data-testid="app-shell-sidebar"
    >
      <div
        className={
          (collapsed ? 'justify-center ' : 'justify-between ') +
          'flex items-center px-4 py-4 border-b border-gray-100 w-full'
        }
      >
        {!collapsed && (
          <span className="text-base font-semibold tracking-tight text-gray-900">bulr</span>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label="サイドバーを開閉"
          aria-expanded={!collapsed}
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <ChevronIcon direction={collapsed ? 'right' : 'left'} />
        </button>
      </div>

      <nav className={(collapsed ? 'px-1 ' : 'px-2 ') + 'flex flex-col gap-1 py-3 w-full'}>
        {NAV_ITEMS.map((item) => {
          const active = item.match.test(pathname ?? '');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-current={active ? 'page' : undefined}
              className={
                (collapsed ? 'justify-center ' : '') +
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ' +
                (active
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100')
              }
            >
              <Icon />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <UserMenu email={email} collapsed={collapsed} />
    </aside>
  );
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points={direction === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="8" y="4" width="8" height="3" rx="1" />
      <path d="M16 6h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
      <path d="M9 14h6" />
      <path d="M9 17h4" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
```

- [ ] **Step 3: AppShell から email を Sidebar に渡す**

Replace `apps/web/components/app-shell/app-shell.tsx`:

```tsx
'use client';

/**
 * AppShell — interviewer 画面の共通シェル
 */

import { useState } from 'react';

import { Sidebar } from './sidebar';

type Props = {
  email: string;
  initialCollapsed: boolean;
  children: React.ReactNode;
};

export function AppShell({ email, initialCollapsed, children }: Props) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        email={email}
      />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: typecheck + lint**

Run:
```
pnpm --filter @bulr/web typecheck && pnpm --filter @bulr/web lint
```
Expected: PASS

- [ ] **Step 5: dev で動作確認**

Open `http://localhost:3020/interviews`. Expected:
- サイドバー下端に丸いユーザーアイコン（メールアドレス先頭 1 文字を白文字で表示）+ メールアドレス
- アイコンクリック → 上にポップオーバーが開き、メールアドレスと「ログアウト」が表示される
- ポップオーバー外をクリック → 閉じる
- `Escape` キー → 閉じる
- 「ログアウト」をクリック → セッション破棄 + `/sign-in` リダイレクト
- 再度 `/interviews` にアクセスすると未ログインで `/sign-in` に再リダイレクトされる

- [ ] **Step 6: コミット**

```bash
git add apps/web/components/app-shell
git commit -m "feat(app-shell): add user menu with email and logout"
```

---

## Task 6: 設定ページ（プレースホルダー）を作成

**Files:**
- Create: `apps/web/app/(interviewer)/settings/page.tsx`

- [ ] **Step 1: settings/page.tsx を作成**

Create `apps/web/app/(interviewer)/settings/page.tsx`:

```tsx
/**
 * 設定ページ（プレースホルダー）
 *
 * 現時点では中身なし。将来の設定項目（プロファイル、通知等）の入れ物。
 */

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

- [ ] **Step 2: typecheck + lint**

Run:
```
pnpm --filter @bulr/web typecheck && pnpm --filter @bulr/web lint
```
Expected: PASS

- [ ] **Step 3: dev で動作確認**

Open `http://localhost:3020/settings`. Expected:
- 「設定」見出しと「準備中です。」テキスト
- サイドバーで「設定」が active（青背景）になる
- `/interviews` クリックで戻ると「面接セッション」が active に切り替わる

- [ ] **Step 4: コミット**

```bash
git add apps/web/app/\(interviewer\)/settings/page.tsx
git commit -m "feat(settings): add placeholder settings page"
```

---

## Task 7: collapsed 状態を cookie で永続化

**Files:**
- Modify: `apps/web/components/app-shell/app-shell.tsx`

- [ ] **Step 1: トグル時に cookie を書き込む**

Replace `apps/web/components/app-shell/app-shell.tsx`:

```tsx
'use client';

/**
 * AppShell — interviewer 画面の共通シェル
 *
 * collapsed 状態は document.cookie で永続化（SSR 側で next/headers cookies() から読む）。
 */

import { useState } from 'react';

import { Sidebar } from './sidebar';

type Props = {
  email: string;
  initialCollapsed: boolean;
  children: React.ReactNode;
};

const COOKIE_NAME = 'sidebar-collapsed';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function persistCollapsed(collapsed: boolean) {
  if (typeof document === 'undefined') return;
  if (collapsed) {
    document.cookie = `${COOKIE_NAME}=1; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  } else {
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
  }
}

export function AppShell({ email, initialCollapsed, children }: Props) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function handleToggle() {
    setCollapsed((prev) => {
      const next = !prev;
      persistCollapsed(next);
      return next;
    });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar collapsed={collapsed} onToggle={handleToggle} email={email} />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: typecheck + lint**

Run:
```
pnpm --filter @bulr/web typecheck && pnpm --filter @bulr/web lint
```
Expected: PASS

- [ ] **Step 3: dev で永続化確認**

Open `http://localhost:3020/interviews`:
- サイドバーをトグルして閉じる
- ページをリロード → 閉じた状態で表示される
- DevTools の Application > Cookies で `sidebar-collapsed=1` が存在することを確認
- 再度トグルで開く → リロード → 開いた状態
- cookie が削除されていることも確認

- [ ] **Step 4: コミット**

```bash
git add apps/web/components/app-shell/app-shell.tsx
git commit -m "feat(app-shell): persist sidebar collapsed state in cookie"
```

---

## Task 8: モバイル（< 768px）オーバーレイ挙動

**Files:**
- Modify: `apps/web/components/app-shell/app-shell.tsx`
- Modify: `apps/web/components/app-shell/sidebar.tsx`

デスクトップ：open ↔ icon-only。モバイル：icon-only ↔ overlay-drawer。

- [ ] **Step 1: AppShell に matchMedia + mobileOpen 状態を追加**

Replace `apps/web/components/app-shell/app-shell.tsx`:

```tsx
'use client';

/**
 * AppShell — interviewer 画面の共通シェル
 *
 * - デスクトップ (>= 768px): collapsed (icon-only 56px) ↔ expanded (224px)
 * - モバイル (< 768px): 常に icon-only。トグルで overlay-drawer が前面に出現
 * - collapsed 状態は cookie で永続化（デスクトップ表示時のみ）
 */

import { useEffect, useState } from 'react';

import { Sidebar } from './sidebar';

type Props = {
  email: string;
  initialCollapsed: boolean;
  children: React.ReactNode;
};

const COOKIE_NAME = 'sidebar-collapsed';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const MOBILE_QUERY = '(max-width: 767px)';

function persistCollapsed(collapsed: boolean) {
  if (typeof document === 'undefined') return;
  if (collapsed) {
    document.cookie = `${COOKIE_NAME}=1; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  } else {
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
  }
}

export function AppShell({ email, initialCollapsed, children }: Props) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isMobile, mobileOpen]);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isMobile, mobileOpen]);

  function handleToggle() {
    if (isMobile) {
      setMobileOpen((v) => !v);
      return;
    }
    setCollapsed((prev) => {
      const next = !prev;
      persistCollapsed(next);
      return next;
    });
  }

  // モバイル時はベース表示を常に icon-only に固定し、overlay は別レイヤーで描画する
  const baseCollapsed = isMobile ? true : collapsed;
  const overlayExpanded = isMobile && mobileOpen;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar collapsed={baseCollapsed} onToggle={handleToggle} email={email} />
      {overlayExpanded && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl">
            <Sidebar collapsed={false} onToggle={handleToggle} email={email} />
          </div>
        </>
      )}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: typecheck + lint**

Run:
```
pnpm --filter @bulr/web typecheck && pnpm --filter @bulr/web lint
```
Expected: PASS

- [ ] **Step 3: dev で確認（デスクトップ + モバイル）**

デスクトップ（既定）:
- 既存挙動が壊れていない（トグルで 56 ↔ 224、cookie 永続化）

モバイル（DevTools で viewport 375px）:
- ベースのサイドバーは icon-only 固定
- トグルボタンを押すと右側に半透明背景 + 幅 264px のドロワー（ラベル付き）が前面に出る
- ドロワー内のトグルボタン or 背景クリック or `Escape` でドロワーが閉じる
- ドロワー表示中は body スクロールがロックされる
- 「設定」をタップ → 遷移後ドロワーは閉じる（再レンダリングで mobileOpen が true のままなのを確認 — もしオープン継続が望ましくない場合は次のステップで対応）

注: ドロワー内のリンクをタップした際に閉じたい場合、Sidebar 側で各 Link に `onClick` を渡す必要があるが、本タスク時点では未対応で良い。ドロワーは Escape / 背景 / トグルで明示的に閉じる仕様。

- [ ] **Step 4: コミット**

```bash
git add apps/web/components/app-shell/app-shell.tsx
git commit -m "feat(app-shell): add mobile overlay drawer behavior"
```

---

## Task 9: 既存 interviewer ページの `<main>` から `min-h-screen` を外す

**Files:**
- Modify: `apps/web/app/(interviewer)/interviews/page.tsx`
- Modify: `apps/web/app/(interviewer)/interviews/new/page.tsx`
- Modify: `apps/web/app/(interviewer)/interviews/[sessionId]/page.tsx`
- Modify: `apps/web/app/(interviewer)/interviews/[sessionId]/report/page.tsx`

AppShell の `<div className="flex-1 overflow-y-auto">` が高さを担当するため、子ページ側の `min-h-screen` は不要・有害（無限スクロールの内側にもう一つフルハイトが挟まる）。

- [ ] **Step 1: 各ファイルの `<main className="min-h-screen ...">` を `<main className="...">` に置換**

各ファイルで `min-h-screen ` を削除（前後に空白がある場合は空白も整理）。例: `apps/web/app/(interviewer)/interviews/page.tsx:82`:

Before:
```tsx
<main className="min-h-screen bg-gray-50 px-4 py-8">
```

After:
```tsx
<main className="bg-gray-50 px-4 py-8">
```

同様の置換を 4 ファイル全てで行う。grep で漏れを確認:

```
rg "min-h-screen" apps/web/app/\(interviewer\)
```
Expected: 結果なし（sign-in は (interviewer) 外なので対象外）。

- [ ] **Step 2: typecheck + lint**

Run:
```
pnpm --filter @bulr/web typecheck && pnpm --filter @bulr/web lint
```
Expected: PASS

- [ ] **Step 3: dev で各ページのスクロール挙動確認**

`/interviews`, `/interviews/new`, `/interviews/[sessionId]`（既存セッションがあれば）, `/interviews/[sessionId]/report` を順に開く。Expected:
- 各ページのコンテンツが想定通り表示される
- スクロール時にサイドバーは固定で、main 領域のみがスクロールする
- ページ末尾までスクロールしても二重スクロールバーが出ない

- [ ] **Step 4: コミット**

```bash
git add apps/web/app/\(interviewer\)/interviews
git commit -m "refactor(interviews): drop min-h-screen now that AppShell owns viewport"
```

---

## Task 10: 全体動作の最終検証

すべてのタスクが終わったら、Spec の「検証」セクションを順番に手動確認する。

- [ ] **Step 1: typecheck + lint final**

Run:
```
pnpm --filter @bulr/web typecheck && pnpm --filter @bulr/web lint
```
Expected: PASS

- [ ] **Step 2: 検証チェックリスト**

dev server を起動して以下を順に確認:

1. 未ログインで `/interviews` 直アクセス → `/sign-in` リダイレクト ✓
2. Magic link ログイン後 → `/interviews` でサイドバー表示、面接セッション active ✓
3. `/settings` クリック → 「準備中です。」表示、設定 active ✓
4. サイドバートグル → アイコンのみ幅 56px、リロード後も状態保持（`sidebar-collapsed` cookie 確認） ✓
5. UserMenu クリック → email と ログアウト 表示、外クリック / Escape で閉じる ✓
6. ログアウト → `/sign-in` リダイレクト、再度 `/interviews` アクセスで再びリダイレクト ✓
7. DevTools で viewport を 375px → サイドバーが icon-only、ハンバーガータップでオーバーレイ展開 ✓
8. Escape キーでオーバーレイが閉じる ✓
9. `/interviews/[sessionId]`, `/interviews/[sessionId]/report`, `/interviews/new` でもサイドバーが正しく表示・スクロール正常 ✓
10. `/sign-in` ではサイドバーが表示されない ✓
11. `/admin/*` ではサイドバーが表示されない（影響範囲外） ✓
12. ランディング `/` ではサイドバーが表示されない ✓

- [ ] **Step 3: 残コミット確認**

Run:
```
git status
```
Expected: clean working tree（前のタスクで全てコミット済み）。差分が残っていれば内容を確認してコミット。
