# Implementation Plan: monorepo-foundation

> 本タスクリストは、bulr Stage 1 MVP の最小モノレポ基盤を 0 から構築する作業を、Foundation → Core → Integration → Validation の順で並べる。
> ファイルパスはすべてリポジトリルート `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/` を起点とする相対パスで記載する。

## Foundation: ルート設定とワークスペース骨格

- [ ] 1. リポジトリルートの設定ファイル一式を整備
- [ ] 1.1 ルート `package.json` を作成
  - `private: true`、`packageManager: "pnpm@10.x"`、`engines.node >= 22`、`engines.pnpm >= 10` を宣言する
  - `scripts` に `dev: "turbo run dev"`、`build: "turbo run build"`、`typecheck: "turbo run typecheck"`、`lint: "turbo run lint"` を定義する
  - `devDependencies` に `turbo@^2.9`、`typescript@^5.4`、`eslint@^9`、`typescript-eslint@^8`、`@typescript-eslint/eslint-plugin@^8`、`@typescript-eslint/parser@^8`、`prettier@^3.8` を含める
  - 観測完了条件: `package.json` がリポジトリルートに存在し、`cat package.json` で上記フィールドが確認できる
  - _Requirements: 1.1_
- [ ] 1.2 `pnpm-workspace.yaml` を作成
  - `apps/*` と `packages/*` を workspace パターンとして登録する
  - 観測完了条件: ファイルがルートに存在し、`pnpm install` が `apps/*` と `packages/*` を認識する
  - _Requirements: 1.2_
- [ ] 1.3 `turbo.json` を作成
  - `$schema` を turbo.build に向ける
  - `tasks.build` に `dependsOn: ["^build"]` と `outputs: [".next/**", "!.next/cache/**", "dist/**"]` を設定
  - `tasks.dev` に `cache: false`、`persistent: true` を設定
  - `tasks.typecheck` に `dependsOn: ["^typecheck"]` を設定
  - `tasks.lint` に `dependsOn: ["^lint"]` を設定
  - 観測完了条件: `pnpm exec turbo run --help` が成功し、`turbo.json` が parse される
  - _Requirements: 1.3, 7.6_
- [ ] 1.4 `tsconfig.base.json` を作成
  - `strict: true`、`noUncheckedIndexedAccess: true`、`module: "ESNext"`、`moduleResolution: "bundler"`、`target: "ES2022"`、`isolatedModules: true`、`skipLibCheck: true`、`esModuleInterop: true`、`allowSyntheticDefaultImports: true`、`resolveJsonModule: true`、`noEmit: true`、`incremental: true` を含める
  - `exclude: ["node_modules"]` を含める
  - 観測完了条件: ファイルがルートに存在し、後続の `apps/web/tsconfig.json` および各 package の `tsconfig.json` から `"extends": "../../tsconfig.base.json"` で読み込める
  - _Requirements: 1.4_
- [ ] 1.5 `.npmrc` を作成
  - `auto-install-peers=true`、`strict-peer-dependencies=false`、`shamefully-hoist=false` を設定する
  - 観測完了条件: ルートに `.npmrc` が存在し、`pnpm install` が peer 依存を自動解決する
  - _Requirements: 1.6_
- [ ] 1.6 `.gitignore` を作成
  - `node_modules`、`.next/`、`out/`、`build`、`dist`、`.turbo`、`.vercel`、`*.tsbuildinfo`、`next-env.d.ts`、`.env.local`、`.env*.local`、`.DS_Store`、`coverage`、`.serena/cache/`、`.serena/project.local.yml`、`.claude/settings.local.json` を含める
  - 観測完了条件: `git status` で `node_modules` や `.turbo` が untracked に出ない
  - _Requirements: 2.4, 8.5_

- [ ] 2. ルートのコード品質ツール設定を整備
- [ ] 2.1 ルート `eslint.config.mjs` を作成
  - `typescript-eslint` の `tseslint.config(...)` で flat config を構築
  - `tseslint.configs.recommended` を spread で含める
  - `@typescript-eslint/no-unused-vars` を `error` レベルで設定し、`argsIgnorePattern: '^_'`、`varsIgnorePattern: '^_'` を許容
  - `@typescript-eslint/no-explicit-any` を `warn` で設定
  - `ignores`: `**/node_modules/**`、`**/.next/**`、`**/dist/**`、`**/.turbo/**`、`**/coverage/**`、`**/.vercel/**`
  - 観測完了条件: `pnpm exec eslint --print-config eslint.config.mjs` が成功する
  - _Requirements: 2.1, 2.4, 2.5_
- [ ] 2.2 ルート `prettier.config.mjs` を作成
  - `semi: true`、`singleQuote: true`、`trailingComma: 'all'`、`printWidth: 100`、`tabWidth: 2`、`useTabs: false`、`bracketSpacing: true`、`bracketSameLine: false`、`arrowParens: 'always'`、`endOfLine: 'lf'` を設定
  - 観測完了条件: `pnpm exec prettier --check prettier.config.mjs` が成功する
  - _Requirements: 2.2_

## Core: 4 つの workspace パッケージスケルトン構築

> 2.x 完了後、3 〜 6 のパッケージ作成タスクは依存方向（types → lib/db → ai）を守る限り並列実行可能。`(P)` は依存先がすでに揃っていることを前提とする。

- [ ] 3. `packages/types` のスケルトンを作成
- [ ] 3.1 `packages/types/package.json` を作成
  - `name: "@bulr/types"`、`private: true`、`version: "0.0.1"`、`exports: { ".": "./src/index.ts" }`、`main: "./src/index.ts"` を設定
  - `scripts.typecheck: "tsc --noEmit"` を含める
  - dependencies は空（純粋型の頂点として他 workspace に依存しない）
  - 観測完了条件: `pnpm install` 後、`pnpm --filter @bulr/types typecheck` がエラーなく完了する
  - _Requirements: 4.1, 4.2, 4.3_
- [ ] 3.2 `packages/types/tsconfig.json` と `packages/types/src/index.ts` を作成
  - `tsconfig.json`: `extends: "../../tsconfig.base.json"`、`include: ["src/**/*"]`
  - `src/index.ts`: `export {};`（後続 spec が型を追加）
  - 観測完了条件: `packages/types/src/index.ts` が空バレルとして存在し、TS コンパイラが解釈できる
  - _Requirements: 4.1, 6.3_

- [ ] 4. `packages/lib` のスケルトンを作成
- [ ] 4.1 (P) `packages/lib/package.json` を作成
  - `name: "@bulr/lib"`、`private: true`、`exports: { ".": "./src/index.ts" }`、`main: "./src/index.ts"` を設定
  - `scripts.typecheck: "tsc --noEmit"` を含める
  - dependencies は空（types のみに依存可能だが、スケルトン段階では import 無し）
  - 観測完了条件: `pnpm --filter @bulr/lib typecheck` がエラーなく完了する
  - _Requirements: 4.1, 4.2, 4.3_
  - _Boundary: LibPkg_
  - _Depends: 3.2_
- [ ] 4.2 (P) `packages/lib/tsconfig.json` と `packages/lib/src/index.ts` を作成
  - `tsconfig.json`: `extends: "../../tsconfig.base.json"`、`include: ["src/**/*"]`
  - `src/index.ts`: `export {};`
  - 観測完了条件: 空バレルとして存在し、TS コンパイラが解釈できる
  - _Requirements: 4.1, 6.3_
  - _Boundary: LibPkg_
  - _Depends: 3.2_

- [ ] 5. `packages/db` のスケルトンを作成
- [ ] 5.1 (P) `packages/db/package.json` を作成
  - `name: "@bulr/db"`、`private: true`、`exports: { ".": "./src/index.ts" }`、`main: "./src/index.ts"` を設定
  - dependencies: `drizzle-orm@^0.45.0`、`pg@^8`、`nanoid@^5`
  - devDependencies: `drizzle-kit@^0.31.0`、`@types/pg@^8`、`tsx@^4`
  - peerDependencies: `@bulr/types: workspace:*` (optional)
  - scripts: `typecheck: "tsc --noEmit"`、`generate: "drizzle-kit generate"`、`push: "drizzle-kit push"`、`migrate: "drizzle-kit migrate"`
  - 観測完了条件: `pnpm install` 後、`packages/db/node_modules` に drizzle-orm と pg が解決される
  - _Requirements: 4.1, 4.2, 4.3, 5.4, 7.5_
  - _Boundary: DbPkg_
  - _Depends: 3.2_
- [ ] 5.2 `packages/db/tsconfig.json` を作成
  - `extends: "../../tsconfig.base.json"`、`include: ["src/**/*", "drizzle.config.ts"]`、`compilerOptions.outDir: "./dist"`
  - 観測完了条件: 設定が後続の typecheck で使われる
  - _Requirements: 4.1_
  - _Boundary: DbPkg_
- [ ] 5.3 `packages/db/src/client.ts` を作成
  - `pg.Pool` で `process.env.DATABASE_URL` を読み込み、未設定なら `throw new Error('DATABASE_URL is required')`
  - `drizzle()` を `node-postgres` driver で初期化、`schema` と `casing: 'snake_case'` を渡す
  - `db` インスタンスと `DB` 型エイリアスを export する
  - 観測完了条件: `import { db, type DB } from './client'` が型として解決し、`DATABASE_URL` 未設定時のテスト import で `Error: DATABASE_URL is required` が throw される
  - _Requirements: 5.3, 5.5_
  - _Boundary: DbPkg_
- [ ] 5.4 `packages/db/src/schema/index.ts` を作成（空バレル）
  - `export {};` のみを記述（後続 spec が テーブル定義を追加）
  - 観測完了条件: 空バレルとして存在し、後続 spec が安全に追加できる
  - _Requirements: 5.2, 5.7, 8.3_
  - _Boundary: DbPkg_
- [ ] 5.5 `packages/db/src/index.ts` を作成
  - `export { db, type DB } from './client';` と `export * from './schema';` を含める
  - 観測完了条件: `import { db } from '@bulr/db'` が workspace 解決される
  - _Requirements: 5.3, 4.6_
  - _Boundary: DbPkg_
- [ ] 5.6 `packages/db/drizzle.config.ts` を作成
  - `dialect: 'postgresql'`、`schema: './src/schema/index.ts'`、`out: './drizzle'`、`casing: 'snake_case'`
  - `dbCredentials.url` に `process.env.DATABASE_URL` を渡す
  - dishxdish 由来の `.env.local` 自動読込ロジック（`existsSync` + `readFileSync` でルートから `.env.local` を読む）を含めて、後続 spec が `.env.local` を整えれば動作するようにする
  - `DATABASE_URL` が未設定なら `throw new Error('DATABASE_URL is required')`
  - 観測完了条件: ファイルが存在し、`pnpm --filter @bulr/db generate` が空スキーマで実行できる（`DATABASE_URL` が必要なので、validation phase で実行する）
  - _Requirements: 5.1, 5.6_
  - _Boundary: DbPkg_

- [ ] 6. `packages/ai` のスケルトンを作成
- [ ] 6.1 `packages/ai/package.json` を作成
  - `name: "@bulr/ai"`、`private: true`、`exports: { ".": "./src/index.ts" }`、`main: "./src/index.ts"` を設定
  - dependencies: `ai@^6`、`@ai-sdk/anthropic@^3`、`@ai-sdk/react@^3`、`zod@^4`、`drizzle-orm@^0.45`、`@bulr/db: workspace:*`、`@bulr/types: workspace:*`、`@bulr/lib: workspace:*`
  - devDependencies: `@types/node@^22`
  - scripts: `typecheck: "tsc --noEmit"`
  - 観測完了条件: `pnpm install` 後、`packages/ai/node_modules` に Vercel AI SDK と Anthropic SDK が解決される
  - _Requirements: 4.1, 4.2, 4.3, 6.1_
  - _Boundary: AiPkg_
  - _Depends: 3.2, 4.2, 5.5_
- [ ] 6.2 `packages/ai/tsconfig.json` と `packages/ai/src/index.ts` を作成
  - `tsconfig.json`: `extends: "../../tsconfig.base.json"`、`include: ["src/**/*"]`
  - `src/index.ts`: `export {};`（後続 spec が tools / prompts / 評価ロジックを追加）
  - 観測完了条件: `pnpm --filter @bulr/ai typecheck` がエラーなく完了する
  - _Requirements: 4.1, 6.2, 6.4_
  - _Boundary: AiPkg_

## Core: apps/web Next.js アプリスケルトン構築

- [ ] 7. `apps/web` を Next.js 16 + React 19 + Tailwind 4 で初期化
- [ ] 7.1 `apps/web/package.json` を作成
  - `name: "web"`、`version: "0.0.1"`、`private: true`
  - dependencies: `next@^16.0.0`、`react@^19.0.0`、`react-dom@^19.0.0`、`@bulr/db: workspace:*`、`@bulr/types: workspace:*`、`@bulr/lib: workspace:*`、`@bulr/ai: workspace:*`、`zod@^4`
  - devDependencies: `@types/node@^22`、`@types/react@^19`、`@types/react-dom@^19`、`tailwindcss@^4`、`@tailwindcss/postcss@^4`、`babel-plugin-react-compiler@^1`、`eslint@^9`、`eslint-config-next@^16`、`typescript@^5.4`
  - scripts: `dev: "next dev --port 3000"`、`build: "next build"`、`start: "next start --port 3000"`、`typecheck: "tsc --noEmit"`、`lint: "eslint ."`
  - 観測完了条件: `pnpm install` 後、`apps/web/node_modules` に next と react が解決される
  - _Requirements: 3.1, 4.5, 4.6_
  - _Depends: 3.2, 4.2, 5.5, 6.2_
- [ ] 7.2 `apps/web/tsconfig.json` を作成
  - `extends: "../../tsconfig.base.json"`
  - `compilerOptions`: `lib: ["dom", "dom.iterable", "esnext"]`、`allowJs: true`、`noEmit: true`、`incremental: true`、`module: "esnext"`、`moduleResolution: "bundler"`、`jsx: "preserve"`、`plugins: [{ "name": "next" }]`、`paths: { "@/*": ["./src/*"] }`
  - `include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]`、`exclude: ["node_modules"]`
  - 観測完了条件: `pnpm --filter web typecheck` がエラーなく完了する
  - _Requirements: 3.6_
- [ ] 7.3 `apps/web/next.config.ts` を作成
  - `reactCompiler: true` を有効化
  - `transpilePackages: ['@bulr/db', '@bulr/types', '@bulr/lib', '@bulr/ai']` を設定
  - 観測完了条件: `next dev` 起動時に React Compiler が有効化されるログが出る
  - _Requirements: 3.1, 4.6_
- [ ] 7.4 `apps/web/postcss.config.mjs` と `apps/web/src/app/globals.css` を作成
  - `postcss.config.mjs`: `@tailwindcss/postcss` を plugin に登録
  - `globals.css`: `@import "tailwindcss";` を含め、shadcn/ui 用の CSS variables（`--background`、`--foreground` 等）を定義する
  - 観測完了条件: `pnpm --filter web build` 時に Tailwind の utility class が解決される
  - _Requirements: 3.4_
- [ ] 7.5 `apps/web/components.json` と `apps/web/src/lib/utils.ts` を作成
  - `components.json`: shadcn/ui 規約の最小構成（`style: "default"`、`tailwind.config: ""`、`tailwind.css: "src/app/globals.css"`、`tailwind.baseColor: "neutral"`、`aliases.utils: "@/lib/utils"`、`aliases.components: "@/components"`）
  - `src/lib/utils.ts`: `cn()` 関数を `clsx` と `tailwind-merge` の最小実装で提供（依存追加が必要なら 7.1 に `clsx@^2`、`tailwind-merge@^2` を含める）
  - 観測完了条件: 後続 spec が `npx shadcn@latest add button` を実行できる準備が整う
  - _Requirements: 3.5_
- [ ] 7.6 `apps/web/src/app/layout.tsx` と `apps/web/src/app/page.tsx` を作成
  - `layout.tsx`: `<html lang="ja">` と `<body>{children}</body>` のみの最小構成、`globals.css` を import、`metadata` で title「bulr — Visualize judgment, not output.」を設定
  - `page.tsx`: bulr ベータプロトタイプの説明テキスト（1〜2 段落）と「対話型問診ベータ受付中」の見出しを含む静的ページ
  - 観測完了条件: `pnpm dev` 起動後、http://localhost:3000 でランディングページが表示される
  - _Requirements: 3.2, 3.3, 8.2_
- [ ] 7.7 `apps/web/eslint.config.mjs` を作成
  - ルート `eslint.config.mjs` を import して spread で再利用
  - `ignores: ['.next/**', 'node_modules/**']` を追加
  - 観測完了条件: `pnpm --filter web lint` がエラーなく完了する
  - _Requirements: 2.3, 2.4_

## Integration: ドキュメント整備と最終配線

- [ ] 8. ルート `README.md` を作成
  - プロジェクト概要（bulr Stage 1 MVP プロトタイプ、Visualize judgment, not output.）
  - 前提（Node.js 22 LTS+、pnpm 10+）
  - 初期セットアップ手順（`corepack enable`、`pnpm install`）
  - 主要コマンド一覧（`pnpm dev`、`pnpm build`、`pnpm typecheck`、`pnpm lint`、`pnpm --filter @bulr/db generate`）
  - ディレクトリ構造の概要（apps/web + packages/{db, types, lib, ai}）
  - steering ドキュメントへのポインタ（`.kiro/steering/`）と spec ディレクトリ（`.kiro/specs/`）の所在のみ示し、内容は重複させない
  - 観測完了条件: `README.md` がリポジトリルートに存在し、上記項目が記載されている
  - _Requirements: 9.1, 9.2, 9.3_

## Validation: 動作確認とスモークテスト

- [ ] 9. リポジトリ全体の動作確認スモークテストを実施
- [ ] 9.1 `pnpm install` が成功することを確認
  - リポジトリルートで `pnpm install` を実行
  - 観測完了条件: exit code 0 で完了し、`pnpm-lock.yaml` が生成され、`apps/web/node_modules` および `packages/*/node_modules` が解決される
  - _Requirements: 1.5_
- [ ] 9.2 `pnpm typecheck` が全 workspace でエラーなく通ることを確認
  - リポジトリルートで `pnpm typecheck` を実行
  - 観測完了条件: Turbo が `types` → `lib`/`db` → `ai` → `web` のトポロジで実行し、全 task が exit code 0 で終わる
  - _Requirements: 4.7, 6.5, 7.3_
- [ ] 9.3 `pnpm lint` が全 workspace でエラーなく通ることを確認
  - リポジトリルートで `pnpm lint` を実行
  - 観測完了条件: 全 workspace で ESLint が実行され、エラー 0 件で完了する（warning は許容）
  - _Requirements: 2.3, 7.4_
- [ ] 9.4 `pnpm build` が全 workspace でエラーなく通ることを確認
  - リポジトリルートで `pnpm build` を実行
  - 観測完了条件: `apps/web/.next/` が生成され、Next.js のビルドが成功する
  - _Requirements: 3.7, 7.2_
- [ ] 9.5 `pnpm dev` で apps/web が port 3000 で起動することを確認
  - リポジトリルートで `pnpm dev` を実行し、ブラウザで http://localhost:3000 を開く
  - 観測完了条件: ランディングページ（bulr ベータの説明）が表示され、コンソールに React Compiler 有効化のログが出る
  - _Requirements: 3.3, 7.1_
- [ ] 9.6 `pnpm --filter @bulr/db generate` が空スキーマでも実行できることを確認
  - 一時的に `.env.local` に `DATABASE_URL=postgres://placeholder@localhost:5432/placeholder` 等を設定（`multi-env-infrastructure` spec が正式な `.env.local` を整える前のスタブ）
  - `pnpm --filter @bulr/db generate` を実行
  - 観測完了条件: `packages/db/drizzle/` ディレクトリが生成され、空スキーマに対応する最小マイグレーションファイル（または「No schema changes」相当のメッセージ）が出力される。実行後、テスト用に追加した `.env.local` の placeholder 行は削除して clean state に戻す
  - _Requirements: 5.6, 7.5_
- [ ] 9.7 workspace alias の解決とコマンド境界を最終確認
  - `apps/web/src/app/page.tsx` で `import { db } from '@bulr/db'` を試験的に追加し、`pnpm typecheck` が成功することを確認した上で、import 文を削除して clean state に戻す
  - `packages/db/src/index.ts` から `packages/types` 以外の workspace package を import していないこと、`packages/types/src/index.ts` から他 workspace を import していないことを目視確認する（依存方向の遵守）
  - 観測完了条件: workspace alias が解決され、依存方向違反がないことを確認した記録（PR description 等）が残る
  - _Requirements: 4.3, 4.4, 4.6_
