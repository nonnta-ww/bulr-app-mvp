# 候補者アプリ 左ナビゲーション（開閉式）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 認証済み候補者が、左サイドの開閉式ナビ（ミニレール）＋上部バーから全機能ページへ回遊できるようにする。

**Architecture:** `app/layout.tsx`（Server）が `getCurrentUser()` で email を取得し `<AppShell userEmail>` でラップ。`AppShell`（Client）が上部バー＋左サイドバー＋本文を配置し、`collapsed`（localStorage 永続のデスクトップ・レール）と `mobileOpen`（ドロワー）を管理。`/sign-in`・`/onboarding`・未認証では枠を出さず children のみ描画。

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS 4, lucide-react（candidate に導入済み）, next/navigation `usePathname`。

> **検証方針（重要）**: 本リポジトリは Stage 1 方針で**ユニットテストフレームワークを持たない**。各タスクの検証は `pnpm --filter candidate typecheck`（＋最終タスクで `build` と手動 smoke）で行う。TDD の「失敗するテストを先に書く」ステップは、この方針に合わせ「typecheck で型契約を確認」に置き換える。

**設計**: `docs/superpowers/specs/2026-06-07-candidate-left-nav-design.md`

---

## File Structure

- Create: `apps/candidate/app/_components/nav-items.ts` — ナビ項目データ＋`isActive` 純関数（責務: ナビの単一の真実）
- Create: `apps/candidate/app/_components/sidebar.tsx` — ナビ描画（Client, presentational）。`collapsed` でアイコンのみ表示
- Create: `apps/candidate/app/_components/app-shell.tsx` — アプリ枠（Client）。上部バー＋サイドバー＋ドロワー＋本文、state 管理
- Modify: `apps/candidate/app/layout.tsx` — `Header` → `AppShell` に差し替え、`getCurrentUser()` の email を渡す
- Delete: `apps/candidate/app/_components/header.tsx` — 上部バーは AppShell に統合（未使用化）
- Reuse: `apps/candidate/app/_components/sign-out-button.tsx` — 変更なし（`email: string` props）

---

## Task 1: ナビ項目データ（nav-items.ts）

**Files:**
- Create: `apps/candidate/app/_components/nav-items.ts`

- [ ] **Step 1: ファイルを作成し全コードを記述**

```ts
import {
  Home,
  ClipboardList,
  BarChart3,
  FileText,
  MessageSquare,
  Send,
  type LucideIcon,
} from 'lucide-react';

/** ナビ項目。match は現在地判定の方式（'/' のみ exact、他は prefix）。 */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  match: 'exact' | 'prefix';
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'ホーム', href: '/', icon: Home, match: 'exact' },
  { label: 'スキルアンケート', href: '/skill-survey', icon: ClipboardList, match: 'prefix' },
  { label: '自己分析', href: '/self-analysis', icon: BarChart3, match: 'prefix' },
  { label: '履歴書', href: '/resume', icon: FileText, match: 'prefix' },
  { label: '模擬面接', href: '/mock-interview', icon: MessageSquare, match: 'prefix' },
  { label: 'エントリー', href: '/entries', icon: Send, match: 'prefix' },
];

/**
 * 現在地がナビ項目に一致するか。
 * - exact: 完全一致のみ（'/' が全ページに一致しないように）
 * - prefix: 自身 or 配下（'/skill-survey/xxx' でも親が点灯）
 */
export function isActive(pathname: string, item: NavItem): boolean {
  if (item.match === 'exact') return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
```

- [ ] **Step 2: 型確認**

Run: `pnpm --filter candidate typecheck`
Expected: PASS（`lucide-react` の各アイコンと `LucideIcon` 型が解決する）

- [ ] **Step 3: コミット**

```bash
git add apps/candidate/app/_components/nav-items.ts
git commit -m "feat(candidate-nav): nav items data + isActive helper"
```

---

## Task 2: サイドバー（sidebar.tsx）

**Files:**
- Create: `apps/candidate/app/_components/sidebar.tsx`

- [ ] **Step 1: ファイルを作成し全コードを記述**

```tsx
'use client';

/**
 * Sidebar — ナビ項目を描画する presentational Client Component。
 * collapsed=true でアイコンのみ（ラベルは title 属性でツールチップ）。
 * onNavigate はモバイル drawer をリンク選択時に閉じるためのコールバック。
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV_ITEMS, isActive } from './nav-items';

interface SidebarProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="メインナビゲーション" className="flex flex-col gap-1 p-2">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? item.label : undefined}
            className={[
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              collapsed ? 'justify-center' : '',
              active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: 型確認**

Run: `pnpm --filter candidate typecheck`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add apps/candidate/app/_components/sidebar.tsx
git commit -m "feat(candidate-nav): sidebar nav component with active highlight"
```

---

## Task 3: アプリシェル（app-shell.tsx）＋ layout 配線 ＋ header 撤去

**Files:**
- Create: `apps/candidate/app/_components/app-shell.tsx`
- Modify: `apps/candidate/app/layout.tsx`
- Delete: `apps/candidate/app/_components/header.tsx`

- [ ] **Step 1: app-shell.tsx を作成し全コードを記述**

```tsx
'use client';

/**
 * AppShell — apps/candidate のアプリ枠（上部バー＋左サイドバー＋本文）。
 *
 * - userEmail === null（未認証）/ '/sign-in' / '/onboarding' では枠を描画せず children のみ返す。
 * - デスクトップ（md+）: サイドバー常時表示。☰ で展開↔アイコンレールをトグルし localStorage に保存。
 * - モバイル（<md）: サイドバーは隠れ、☰ でオーバーレイ drawer。リンク選択 / 背景 / Esc で閉じる。
 *
 * 注意: 各ページが独自の <main> を持つため、本シェルの本文ラッパは <div>（<main> の入れ子回避）。
 */

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

import { SignOutButton } from './sign-out-button';
import { Sidebar } from './sidebar';

const COLLAPSE_KEY = 'bulr.nav.collapsed';
const CHROMELESS_PATHS = ['/sign-in', '/onboarding'];

interface AppShellProps {
  userEmail: string | null;
  children: React.ReactNode;
}

export function AppShell({ userEmail, children }: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // 折りたたみ設定を復元（初回マウント時）
  useEffect(() => {
    if (window.localStorage.getItem(COLLAPSE_KEY) === '1') {
      setCollapsed(true);
    }
  }, []);

  // ルート変更でモバイル drawer を閉じる
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Esc でモバイル drawer を閉じる
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  // 未認証・サインイン・オンボーディングでは枠を出さない（userEmail を string に絞り込む）
  if (userEmail === null) return <>{children}</>;
  if (CHROMELESS_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return <>{children}</>;
  }

  function toggleDesktop() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* 上部バー */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          {/* モバイル: drawer を開く */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="メニューを開く"
            className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          {/* デスクトップ: 展開↔レール */}
          <button
            type="button"
            onClick={toggleDesktop}
            aria-label={collapsed ? 'メニューを展開' : 'メニューを折りたたむ'}
            aria-expanded={!collapsed}
            className="hidden rounded-md p-1.5 text-gray-600 hover:bg-gray-100 md:inline-flex"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-gray-800">bulr</span>
        </div>
        <SignOutButton email={userEmail} />
      </header>

      <div className="flex flex-1">
        {/* デスクトップ・サイドバー */}
        <aside
          className={[
            'hidden shrink-0 border-r border-gray-200 bg-white md:block',
            collapsed ? 'w-16' : 'w-56',
          ].join(' ')}
        >
          <Sidebar collapsed={collapsed} />
        </aside>

        {/* モバイル drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute left-0 top-0 flex h-full w-64 flex-col bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
                <span className="text-sm font-semibold text-gray-800">メニュー</span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="メニューを閉じる"
                  className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        {/* 本文（各ページが自前の <main> を持つため <div> ラッパ） */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: layout.tsx を全文書き換え**

```tsx
import type { Metadata } from 'next';

import { getCurrentUser } from '@bulr/auth/server';

import { AppShell } from './_components/app-shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'bulr',
  description: 'bulr 候補者ポータル',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="ja">
      <body>
        <AppShell userEmail={user?.email ?? null}>{children}</AppShell>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: 旧 header.tsx を削除**

```bash
git rm apps/candidate/app/_components/header.tsx
```

- [ ] **Step 4: 型確認＋未使用 import が無いことを確認**

Run: `pnpm --filter candidate typecheck`
Expected: PASS（`header.tsx` への参照が layout から消え、`AppShell` が解決する）

- [ ] **Step 5: コミット**

```bash
git add apps/candidate/app/_components/app-shell.tsx apps/candidate/app/layout.tsx
git commit -m "feat(candidate-nav): app shell with collapsible sidebar + top bar; retire header"
```

---

## Task 4: ビルド＋手動 smoke 検証

**Files:** なし（検証のみ）

- [ ] **Step 1: 本番ビルド**

Run: `rm -rf apps/candidate/.next && pnpm --filter candidate build`
Expected: `✓ Compiled successfully`、全ルートが出力される（`/`, `/skill-survey`, `/self-analysis`, `/resume`, `/mock-interview`, `/entries`, `/sign-in`, `/onboarding`）

- [ ] **Step 2: ローカル DB 起動＋サーバ起動（手動 smoke）**

```bash
pnpm db:up
pnpm --filter candidate dev   # http://localhost:3020
```

- [ ] **Step 3: 手動 smoke チェックリスト（ブラウザ）**

ローカル候補者でサインイン後、以下を確認:
- 認証済みページ（`/`, `/skill-survey`, `/self-analysis`, `/resume`, `/mock-interview`, `/entries`）で上部バー＋左ナビが表示される
- `/sign-in`・`/onboarding` ではナビ枠が出ず本文のみ
- 各ナビリンクが遷移し、現在地が強調される（例: `/skill-survey/<id>` でも「スキルアンケート」点灯）
- デスクトップで ☰ により展開↔アイコンレールが切替わり、リロード後も状態が保持される
- モバイル幅（DevTools）で ☰ により drawer が開閉する（リンク選択・背景クリック・Esc で閉じる）
- ログアウトが従来どおり機能する

- [ ] **Step 4: 完了コミット（必要なら）**

検証のみで変更が無ければコミット不要。設計/プランに追記が出た場合のみ:

```bash
git add docs/superpowers/
git commit -m "docs(candidate-nav): record smoke verification notes"
```

---

## 完了の定義

- 上記 4 タスク完了、`typecheck` ＋ `build` 成功
- 6 ナビ項目が全認証済みページで機能し、`/sign-in`・`/onboarding` では非表示
- 開閉（デスクトップ・レール永続 / モバイル drawer）が動作
- 既存ログアウトが機能（`SignOutButton` 流用）
