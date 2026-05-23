# Implementation Plan — monorepo-app-split

> 本 spec は Stage 2 再設計 Wave 1 の最初のスペック。`design.md` の 10 phase migration sequence を 7 major task / 24 sub-task に分解。`(P)` 並列実行可能マーカー付き。各 sub-task は 1〜3 時間目安。

## Foundation phase（共有 packages の整備）

- [ ] 1. packages/auth の新設と既存認証設定の集約

- [x] 1.1 packages/auth スケルトン作成
  - `packages/auth/` ディレクトリと `package.json`（`name: @bulr/auth`, dependencies: better-auth, zod, peer: react など既存 `apps/web` と同じバージョン）を作成
  - `tsconfig.json` を `packages/db` と同じパターンで作成（`extends: ../../tsconfig.base.json`）
  - `src/index.ts` を空バレルとして作成（後続タスクで埋める）
  - **観測可能**: `pnpm install` 後に `pnpm --filter @bulr/auth typecheck` がエラーなく完了する
  - _Requirements: 5.1_

- [x] 1.2 Better Auth 設定と関連ユーティリティの packages/auth ＋ packages/lib への移管
  - `apps/web/lib/auth/{server,client,schemas}.ts` を `packages/auth/src/` に物理移動
  - **`apps/web/lib/email/` 一式（`resend.ts` ＋ `templates/magic-link.ts`）を `packages/auth/src/email/` に物理移動**（Amendment: auth-bound、design.md `Boundary > This Spec Owns` 参照）
  - **`apps/web/lib/rate-limit.ts` を `packages/lib/src/rate-limit.ts` に物理移動**（Amendment: auth + business API で共有のため共通ユーティリティ層へ）
  - `packages/auth/src/server.ts` の内部相対 import を新階層に合わせる（`../email/resend` → `./email/resend` 等）
  - `packages/lib/src/index.ts` から `rate-limit` を re-export し、`@bulr/lib` の公開 API に追加
  - `packages/lib/package.json` に必要な依存（`@bulr/db` 等、rate-limit.ts の実態に応じて）を追加
  - **`apps/web` 配下の `@/lib/rate-limit` import を `@bulr/lib` に置換**（対象: `app/api/interview/turns/next/route.ts`・`app/api/interview/proposal/regenerate/route.ts`・`lib/actions/create-session.ts`）
  - **観測可能**:
    - `pnpm --filter @bulr/auth typecheck` が PASS
    - `pnpm --filter @bulr/lib typecheck` が PASS
    - `pnpm --filter @bulr/web typecheck` で残るのは `@/lib/auth/*`・`@/lib/guards`・`@/lib/safe-action` 関連エラーのみ（rate-limit と email 関連は解消、Task 3.3 で auth 系も解消予定）
  - _Requirements: 5.2, 5.3_

- [x] 1.3 認証ガードと safe-action の packages/auth への集約
  - `apps/web/lib/guards.ts` を `packages/auth/src/guards.ts` に物理移動
  - `apps/web/lib/safe-action.ts` を `packages/auth/src/safe-action.ts` に物理移動
  - `AuthError` 型を `packages/auth/src/errors.ts` として既存定義から集約（`UNAUTHORIZED` / `FORBIDDEN` / `SESSION_EXPIRED` の判別共用体）
  - 移動後の内部相対 import を整理
  - **観測可能**: `packages/auth/src/{guards,safe-action,errors}.ts` が存在し、`pnpm --filter @bulr/auth typecheck` が通る
  - _Requirements: 5.4, 5.5_

- [x] 1.4 packages/auth 公開 API の整備と build 通過
  - `packages/auth/src/index.ts` で `{ auth, authClient, requireUser, requireAdmin, requireSessionOwnership, authedAction, adminAction, AuthError, User, Session }` を再エクスポート（`design.md` セクション 6 の Service Interface に従う）
  - Better Auth サーバインスタンスの baseURL を env (`BETTER_AUTH_URL`) から読む構造になっていることを確認
  - **観測可能**: `pnpm --filter @bulr/auth build` と `typecheck` が成功、`packages/auth/src/index.ts` が指定の名前を全て export している
  - _Requirements: 5.1, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11_

- [ ] 2. packages/ui の新設と最小 UI プリミティブの導入

- [x] 2.1 (P) packages/ui スケルトンと共有 Tailwind preset
  - `packages/ui/` ディレクトリと `package.json`（`name: @bulr/ui`, dependencies: react, react-dom, class-variance-authority, tailwind-merge, clsx, lucide-react）を作成
  - `tsconfig.json`（`extends: ../../tsconfig.base.json`）
  - `src/lib/utils.ts` に `cn` を実装（clsx + tailwind-merge の標準パターン）
  - `src/tailwind-preset.ts` に共有 Tailwind preset（現行 `apps/web/tailwind.config.ts` の colors / fontFamily / animation などを抽出）
  - `components.json`（shadcn 設定、aliases を `packages/ui` スコープ）
  - **観測可能**: `pnpm --filter @bulr/ui typecheck` が成功し、外部から `cn` と `bulrTailwindPreset` が import 可能
  - _Requirements: 6.1, 6.5_
  - _Boundary: packages/ui_

- [x] 2.2 最小 shadcn プリミティブの導入
  - `packages/ui/src/components/` に `Button` / `Input` / `Label` / `Form` / `Card` を追加（shadcn CLI を `packages/ui` スコープで実行、または手書きで shadcn 標準ファイルを配置）
  - 必要な依存（`@radix-ui/react-label`・`@radix-ui/react-slot`・`react-hook-form` など）を `packages/ui/package.json` に追加
  - **観測可能**: `packages/ui/src/components/{button,input,label,form,card}.tsx` が存在し、`pnpm --filter @bulr/ui typecheck` が通る
  - _Requirements: 6.2_

- [x] 2.3 packages/ui 公開 API の整備と build 通過
  - `packages/ui/src/index.ts` で `{ Button, Input, Label, Form, FormField, FormItem, FormLabel, FormControl, FormMessage, Card, CardHeader, CardTitle, CardContent, CardFooter, cn, bulrTailwindPreset }` を再エクスポート
  - **観測可能**: `pnpm --filter @bulr/ui build` と `typecheck` が成功し、外部から `import { Button } from '@bulr/ui'` が解決できる
  - _Requirements: 6.6, 6.7_

## Core phase（アプリ分割と移設）

- [ ] 3. apps/web を apps/business にリネームと認証 import の切り替え

- [x] 3.1 apps/web を apps/business にリネーム
  - `git mv apps/web apps/business`（履歴保持）
  - **観測可能**: `apps/web/` が存在せず、`apps/business/` が同内容を持ち、`git status` でリネームが検出される
  - _Requirements: 1.2, 2.1, 2.2_
  - _Depends: 1.4, 2.3_

- [x] 3.2 apps/business の package.json と dev ポート更新
  - `apps/business/package.json` の `name` を `@bulr/web` → `@bulr/business` に変更
  - dev script のポートを `-p 3020` → `-p 3001` に変更
  - `pnpm install` で workspace 整合性を再構築
  - **観測可能**: `pnpm --filter @bulr/business --version` で `@bulr/business` が確認でき、`pnpm --filter @bulr/business dev` が `:3001` でリッスンする
  - _Requirements: 1.4, 1.6, 2.7_

- [x] 3.3 認証関連 import の @bulr/auth への一括置換
  - `apps/business/` 配下の全 `.ts`/`.tsx` で `@/lib/auth/*`・`@/lib/guards`・`@/lib/safe-action` の import を `@bulr/auth` に一括置換
  - 移管済みの旧ファイル（`apps/business/lib/auth/`・`lib/guards.ts`・`lib/safe-action.ts`）を削除
  - apps/business 内に shadcn プリミティブの重複実装がないことを確認（必要になったら `@bulr/ui` から import する方針を確立）
  - **観測可能**: `grep -rn '@/lib/auth\|@/lib/guards\|@/lib/safe-action' apps/business/` が空、`pnpm --filter @bulr/business typecheck` が通る
  - _Requirements: 2.6, 2.7, 5.6, 6.3, 8.1_

- [x] 3.4 apps/business の build/typecheck/lint 通過（@bulr/auth の server/client subpath 分離も含む）
  - `pnpm --filter @bulr/business build` `typecheck` `lint` を順に実行
  - **観測可能**: 3 コマンドすべてが成功し、`.next` ビルド成果物が生成される
  - _Requirements: 2.6_
  - **Amendment (Task 3.4 実装中に発見)**: 初版バレル単一エントリのままだと Client Component (`sign-in-form.tsx`) が `signIn` を import した時点で `packages/auth/src/server.ts`（`next/headers`・`pg`・`nodemailer`）が Client バンドルに巻き込まれ、Next.js ビルドが `Module not found: tls/fs/net` で失敗。本タスクで `@bulr/auth` を subpath exports（`./server` / `./client`）に分離し、メインバレルは isomorphic 専用（zod スキーマ・`AuthError`・型）に絞った。`server.ts` / `guards.ts` / `safe-action.ts` の冒頭に `import 'server-only';` を追加。apps/business 内の全 import 経路を `@bulr/auth/server` または `@bulr/auth/client` に切替。

- [ ] 4. apps/admin の新設と既存検証パネルの flat URL 移設

- [ ] 4.1 apps/admin スケルトン作成
  - `apps/admin/` と Next.js 16 最小構成（`next.config.ts`・`tsconfig.json`・`tailwind.config.ts`・`postcss.config.mjs`・`app/layout.tsx`・`app/page.tsx`・`public/`）を新規作成
  - `package.json`: `name: @bulr/admin`、dev port `3002`、dependencies は `@bulr/auth`・`@bulr/ui`・`@bulr/db`・`@bulr/types`・`@bulr/lib`・next・react
  - `tailwind.config.ts` に `presets: [bulrTailwindPreset]` と content に `'../../packages/ui/src/**/*.{ts,tsx}'` を含める
  - 運営拡張機能（企業管理・候補者管理・マスタ CMS・コスト監視）は本 spec で実装しない（後続 `admin-operations`）
  - **観測可能**: `pnpm --filter @bulr/admin build` が成功、`pnpm --filter @bulr/admin dev` で `:3002` が開ける
  - _Requirements: 3.1, 1.4, 1.6, 3.10, 6.4, 8.2, 10.2_
  - _Depends: 1.4, 2.3, 3.4_

- [ ] 4.2 apps/admin の認証配線（Better Auth handler とサインインページ）
  - `apps/admin/app/api/auth/[...all]/route.ts` に `@bulr/auth` の Better Auth handler をマウント
  - `apps/admin/app/sign-in/page.tsx` に Magic Link サインイン UI（`@bulr/ui` の Form / Input / Button / Label を使用）
  - 必要に応じて `apps/admin/app/layout.tsx` で provider を設定
  - `ADMIN_ALLOWED_EMAILS` 検査（`requireAdmin()`）を保護ルートで継続
  - **観測可能**: `:3002/sign-in` がブラウザで表示でき、許可外メールでサインインを試みると `requireAdmin` ガードで拒否される
  - _Requirements: 3.2, 3.3, 3.9, 6.4_

- [ ] 4.3 既存検証パネルの apps/admin への flat URL 移設
  - `apps/business/app/admin/sessions/**`（`_components/`・`_actions/`・`_lib/` 含む）を `apps/admin/app/sessions/**` に物理移動
  - `apps/business/app/admin/login/` を削除（`apps/admin/app/sign-in/` で置き換え済み）
  - 移動後の相対 import が壊れていないか確認、`@/lib/*` 等のパスエイリアスは `apps/admin` のエイリアスに沿って必要に応じて調整
  - `apps/admin/app/page.tsx` を `/sessions` へのリダイレクトに設定（または admin top）
  - **観測可能**: `apps/business/app/admin/` が存在しない、`apps/admin` で `/sessions`・`/sessions/[id]`・`/sessions/[id]/export` の各ルートが動作する
  - _Requirements: 3.4, 3.5, 3.6, 3.7, 3.8, 3.11, 3.12, 2.4_

- [ ] 4.4 apps/admin の build/typecheck/lint 通過
  - `pnpm --filter @bulr/admin build` `typecheck` `lint` を順に実行
  - **観測可能**: 3 コマンドすべてが成功する
  - _Requirements: 3.10_

- [ ] 5. apps/candidate の新設（Task 4 と並列実行可）

- [ ] 5.1 (P) apps/candidate スケルトン作成
  - `apps/candidate/` と Next.js 16 最小構成（4.1 と同じ骨格）を新規作成
  - `package.json`: `name: @bulr/candidate`、dev port `3000`、dependencies は `@bulr/auth`・`@bulr/ui`・`@bulr/db`・`@bulr/types`・`@bulr/lib`・next・react
  - `tailwind.config.ts` に `presets: [bulrTailwindPreset]` と content に `'../../packages/ui/src/**/*.{ts,tsx}'` を含める
  - 候補者向け業務機能（履歴書登録・スキルアンケート・自己診断・模擬面接・エントリー）は本 spec で実装しない（後続 Wave 2〜4）
  - **観測可能**: `pnpm --filter @bulr/candidate build` が成功、`pnpm --filter @bulr/candidate dev` で `:3000` が開ける
  - _Requirements: 4.1, 4.6, 1.4, 1.6, 8.3, 10.1_
  - _Boundary: apps/candidate_
  - _Depends: 1.4, 2.3, 3.4_

- [ ] 5.2 apps/candidate の認証配線とサインイン後フロー
  - `apps/candidate/app/api/auth/[...all]/route.ts` に `@bulr/auth` の Better Auth handler をマウント
  - `apps/candidate/app/sign-in/page.tsx` に Magic Link サインイン UI（`@bulr/ui` 使用）
  - `apps/candidate/app/page.tsx` にサインイン後のプレースホルダ画面（「Wave 2 で機能拡張予定」相当）
  - 候補者ロール判定（`candidate_profile` 必須化）は本 spec ではしない（サインイン済みのユーザを受け入れるだけ）
  - **観測可能**: `:3000/sign-in` でメール入力 → Magic Link 受信 → リンククリックで `:3000/` のプレースホルダ画面に到達できる
  - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.7, 6.4_

- [ ] 5.3 apps/candidate の build/typecheck/lint 通過
  - `pnpm --filter @bulr/candidate build` `typecheck` `lint` を順に実行
  - **観測可能**: 3 コマンドすべてが成功する
  - _Requirements: 4.6_

## Integration phase（モノレポ全体設定の整備）

- [ ] 6. モノレポ設定の更新と環境変数整理

- [ ] 6.1 tsconfig.base.json のパスエイリアス追加
  - `tsconfig.base.json` の `paths` に `"@bulr/auth": ["./packages/auth/src/index.ts"]` と `"@bulr/ui": ["./packages/ui/src/index.ts"]` を追加（既存 `@bulr/db` 等のパターンに合わせる）
  - **観測可能**: 3アプリすべてが `import { foo } from '@bulr/auth'` と `import { Button } from '@bulr/ui'` を解決でき、`pnpm typecheck` が全体で通る
  - _Requirements: 7.6_

- [ ] 6.2 .env.example の3アプリ対応化
  - 共有変数（`DATABASE_URL`・`BETTER_AUTH_SECRET`・`RESEND_API_KEY`・`ANTHROPIC_API_KEY`・`OPENAI_API_KEY`・Whisper provider 設定・`BLOB_READ_WRITE_TOKEN`・`CRON_SECRET`・`ADMIN_ALLOWED_EMAILS`）を整理
  - アプリ別 URL 変数（`NEXT_PUBLIC_APP_URL`・`BETTER_AUTH_URL`）の例値とコメントを3アプリ別に明示（各アプリの dev script で env を上書きする運用例も注記）
  - **観測可能**: `.env.example` を `.env.local` にコピーして3アプリすべてが dev 起動でき、各アプリの Better Auth コールバック URL が正しいポート（`:3000` / `:3001` / `:3002`）に向く
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 6.3 vercel.json を apps/business 配下に移動
  - ルートの `vercel.json` を `apps/business/vercel.json` に物理移動（内容は Cron `audio-purge` 定義のまま無変更）
  - **観測可能**: ルートに `vercel.json` がない、`apps/business/vercel.json` に同じ Cron 定義が存在する
  - _Requirements: 9.5, 10.5_

## Validation phase（全体ビルドと smoke test）

- [ ] 7. 統合検証

- [ ] 7.1 ルート pnpm install / build / typecheck / lint の全体通過
  - `rm -rf node_modules` でクリーン状態にして `pnpm install` から実行
  - ルートで `pnpm install` → `pnpm build` → `pnpm typecheck` → `pnpm lint` を順に実行
  - Turbo の依存グラフで `packages/*` が `apps/*` より先にビルドされること
  - 既存 `packages/{db,ai,types,lib}` の公開 API に破壊的変更がないこと
  - `packages/i18n` が存在しないこと、新規 DB スキーマが追加されていないこと、テストフレームワーク（Vitest / Playwright 等）が新規導入されていないことを確認
  - **観測可能**: 4 コマンドすべてが成功し、3アプリ＋全 packages の build 成果物が生成される
  - _Requirements: 7.3, 7.4, 7.5, 7.7, 8.4, 8.5, 10.3, 10.4, 11.1_

- [ ] 7.2 3アプリの dev 起動と各ポート到達確認
  - `pnpm --filter @bulr/candidate dev` で `:3000` が開ける
  - `pnpm --filter @bulr/business dev` で `:3001` が開ける
  - `pnpm --filter @bulr/admin dev` で `:3002` が開ける
  - ルートで `pnpm dev` を実行すると Turbo が3アプリを並列起動する
  - **観測可能**: 3つの dev サーバが同時起動でき、それぞれのトップ/サインインページがブラウザで開ける
  - _Requirements: 1.5, 1.6, 1.7_

- [ ] 7.3 apps/business の機能等価性 smoke test
  - 既存の面接官サインイン → セッション一覧 → 新規セッション作成 → 面接中 UI（状態A/B、録音→Whisper→LLM 分析→次質問候補生成）→ 面接後レポート（ヒートマップ・サマリー）の一連を手動で実行
  - 面接終了処理（finalize）まで通す
  - **観測可能**: 一連のフローが現行 `apps/web`（リネーム前）と同じく動作し、回帰がない
  - _Requirements: 2.5, 11.2, 10.6_

- [ ] 7.4 apps/admin の検証パネル動作 smoke test
  - 許可メールでサインイン → `/sessions` 一覧（フィルタ・ソート）→ `/sessions/[id]` 詳細 → 1 つの `pattern_coverage` に手動評価を入力・保存 → LLM vs 手動 並列表示と差分ハイライト → `/sessions/[id]/export?format=csv` と `?format=json` でダウンロード
  - 面接後レポートへのリンク（`apps/business` の `/interviews/[sessionId]/report` への外部リンク遷移）が動作することを確認
  - **観測可能**: 既存検証パネルの全機能が flat URL 構成で現行と同じく動作する
  - _Requirements: 3.12, 11.2_

- [ ] 7.5 apps/candidate のサインイン → プレースホルダ smoke test
  - `:3000/sign-in` でメール入力 → Magic Link 受信 → リンククリック → `:3000/` のプレースホルダ画面に到達
  - **観測可能**: 候補者がサインインを完了し、認証済みプレースホルダ画面に到達する（業務機能は未実装で OK）
  - _Requirements: 4.4, 11.2_
