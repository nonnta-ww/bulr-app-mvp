# Implementation Plan — monorepo-foundation

> 本スペックは bulr Stage 1 のモノレポ基盤を確立する。すべての作業は `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/` 配下で行う。完了条件は `pnpm install` → `pnpm dev` で apps/web (port 3000) が起動し、`pnpm typecheck` / `pnpm lint` がエラーなく通ること。
>
> パッケージ実装（DB schema 実体、LLM 関数、Whisper、認証、UI、CI/CD）は **本スペックで扱わない**。後続 5 spec の責務。

## Foundation: ルート設定とビルド基盤

- [ ] 1. ルート設定ファイル一式の作成
- [x] 1.1 `package.json` をルートに作成
  - `name: "bulr-app-mvp"`、`private: true`、`packageManager: "pnpm@10.x.x"`、`engines: { node: ">=22.0.0", pnpm: ">=10" }` を設定
  - `scripts.dev: "turbo run dev"`、`scripts.build: "turbo run build"`、`scripts.typecheck: "turbo run typecheck"`、`scripts.lint: "turbo run lint"` を定義
  - `devDependencies` に `turbo` ^2.9、`typescript` ^5.4、`eslint` ^9.39、`prettier` ^3.8、`typescript-eslint` ^8.59、`@typescript-eslint/eslint-plugin` ^8、`@typescript-eslint/parser` ^8 を宣言
  - 観測可能な完了状態: `bulr-app-mvp/package.json` が存在し、`engines` と `scripts` が要求どおりの値で定義されている
  - _Requirements: 1.1, 1.2, 1.3, 7.1_
- [x] 1.2 `pnpm-workspace.yaml` を作成
  - `packages: ["apps/*", "packages/*"]` を定義
  - 観測可能な完了状態: `bulr-app-mvp/pnpm-workspace.yaml` が存在し、apps と packages のグロブが定義されている
  - _Requirements: 1.2_
- [x] 1.3 `tsconfig.base.json` を作成
  - `compilerOptions` に `strict: true`、`noUncheckedIndexedAccess: true`、`module: "ESNext"`、`moduleResolution: "bundler"`、`target: "ES2022"`、`skipLibCheck: true`、`esModuleInterop: true`、`allowSyntheticDefaultImports: true`、`resolveJsonModule: true`、`isolatedModules: true`、`noEmit: true`、`incremental: true` を設定
  - `exclude: ["node_modules"]` を設定
  - 観測可能な完了状態: ファイル単独で `npx tsc --noEmit -p tsconfig.base.json` 相当の構文チェックが通る
  - _Requirements: 1.4, 4.5_
- [x] 1.4 `turbo.json` を作成
  - `$schema: "https://turbo.build/schema.json"` を含める
  - `tasks.build`: `dependsOn: ["^build"]`、`outputs: [".next/**", "!.next/cache/**", "dist/**"]`
  - `tasks.dev`: `cache: false`、`persistent: true`
  - `tasks.typecheck`: `dependsOn: ["^typecheck"]`
  - `tasks.lint`: `dependsOn: ["^lint"]`
  - 観測可能な完了状態: `turbo.json` 内に 4 タスク（build / dev / typecheck / lint）が定義されている
  - _Requirements: 7.1, 7.2, 7.3_
- [x] 1.5 `.gitignore` を作成
  - `node_modules`、`.next`、`.turbo`、`dist`、`.vercel`、`coverage`、`.env*.local`、`*.tsbuildinfo`、`.DS_Store` を除外対象に含める
  - 観測可能な完了状態: 上記すべてのパターンが `.gitignore` に列挙されている
  - _Requirements: 1.7_
- [x] 1.6 `.npmrc` を作成
  - `link-workspace-packages=true`、`prefer-workspace-packages=true`、`auto-install-peers=true`、`strict-peer-dependencies=false`、`shamefully-hoist=false` を設定（本プロジェクトのインストール時に余計な警告を抑制）
  - 観測可能な完了状態: `.npmrc` ファイルが存在し、`pnpm install` 時に strict-peer-dependencies の警告が抑えられる設定になっている
  - _Requirements: 1.8_
- [x] 1.7 `eslint.config.mjs` を作成（Flat Config）
  - `typescript-eslint` の `recommended` を spread
  - `ignores`: `**/node_modules/**`、`**/.next/**`、`**/dist/**`、`**/.turbo/**`、`**/coverage/**`、`**/.vercel/**`
  - ルール追加: `@typescript-eslint/no-unused-vars: ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]`、`@typescript-eslint/no-explicit-any: "warn"`
  - 観測可能な完了状態: `npx eslint --print-config app/page.tsx` 相当でルール一覧が表示される（apps/web 作成後に検証）
  - _Requirements: 8.1, 8.2, 8.3_
- [x] 1.8 `prettier.config.mjs` を作成
  - `singleQuote: true`、`semi: true`、`trailingComma: "all"`、`printWidth: 100`、`tabWidth: 2`、`useTabs: false`、`bracketSpacing: true`、`bracketSameLine: false`、`arrowParens: "always"`、`endOfLine: "lf"` を設定
  - 観測可能な完了状態: `npx prettier --check prettier.config.mjs` がエラーなく完了
  - _Requirements: 1.5, 8.4_

## Core: ワークスペース パッケージのスケルトン作成

> 1.x 完了後、2.x の各サブタスクは別ディレクトリ・別 package.json を作るため `(P)` で並列実行可能。互いに依存しないファイル群を独立に作成する。

- [ ] 2. ワークスペース パッケージのスケルトン作成
- [x] 2.1 (P) `packages/types` スケルトンを作成
  - `packages/types/package.json` に `name: "@bulr/types"`、`private: true`、`version: "0.0.1"`、`exports: { ".": "./src/index.ts", "./profile": "./src/profile.ts", "./evaluation": "./src/evaluation.ts" }`、`main: "./src/index.ts"`、`scripts: { typecheck: "tsc --noEmit", lint: "eslint ." }` を定義
  - `dependencies` フィールドは含めない（runtime 依存ゼロ）。`devDependencies` に `typescript` ^5.4 のみ
  - `packages/types/tsconfig.json` で `extends: "../../tsconfig.base.json"`、`include: ["src/**/*"]` を設定
  - `packages/types/src/index.ts`、`packages/types/src/profile.ts`、`packages/types/src/evaluation.ts` を `export {};` 一行のみで作成（後続 spec で実体追加）
  - 観測可能な完了状態: `pnpm --filter @bulr/types typecheck` がエラーなく完了し、`@bulr/types` の `package.json` が `exports` map に 3 サブパス（`.` / `./profile` / `./evaluation`）を宣言している
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 6.4_
  - _Boundary: TypesPackage_
- [x] 2.2 (P) `packages/db` スケルトンと Drizzle 初期化
  - `packages/db/package.json` に `name: "@bulr/db"`、`private: true`、`version: "0.0.1"`、`exports: { ".": "./src/index.ts" }`、`main: "./src/index.ts"`、`scripts: { typecheck: "tsc --noEmit", lint: "eslint .", generate: "drizzle-kit generate", push: "drizzle-kit push", migrate: "drizzle-kit migrate" }` を定義
  - `dependencies`: `drizzle-orm` ^0.45.0、`pg` ^8、`nanoid` ^5。`devDependencies`: `drizzle-kit` ^0.31.0、`tsx` ^4、`@types/pg` ^8、`typescript` ^5.4。`peerDependencies`: `@bulr/types` `workspace:*`
  - `packages/db/tsconfig.json` で `extends: "../../tsconfig.base.json"`、`include: ["src/**/*", "drizzle.config.ts"]` を設定
  - `packages/db/drizzle.config.ts` を作成: `defineConfig({ schema: "./src/schema/*.ts", out: "./drizzle", dialect: "postgresql", dbCredentials: { url: process.env.DATABASE_URL ?? "" } })`
  - `packages/db/src/client.ts` を作成: `pg.Pool` で接続、`drizzle(pool, { schema })` を返す。`DATABASE_URL` 未定義時は throw
  - `packages/db/src/schema/index.ts` を空バレル（コメント `// Tables are added by downstream specs (assessment-pattern-seed / authentication / assessment-engine)` のみ）として作成
  - `packages/db/src/queries/index.ts` を空バレル（コメントのみ）として作成
  - `packages/db/src/index.ts` で `export { db } from './client';` と `export * as schema from './schema';` を再エクスポート
  - 観測可能な完了状態: `pnpm --filter @bulr/db typecheck` がエラーなく完了し、`@bulr/db` を import 可能（実 DB 接続は不要、型のみで OK）
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_
  - _Boundary: DbPackage_
  - _Depends: 2.1_
- [x] 2.3 (P) `packages/lib` スケルトンを作成
  - `packages/lib/package.json` に `name: "@bulr/lib"`、`private: true`、`version: "0.0.1"`、`exports: { ".": "./src/index.ts" }`、`main: "./src/index.ts"`、`scripts: { typecheck: "tsc --noEmit", lint: "eslint ." }` を定義
  - `dependencies`: `@bulr/types` `workspace:*`、`zod` ^4.0.0。`devDependencies`: `typescript` ^5.4
  - `packages/lib/tsconfig.json` で `extends: "../../tsconfig.base.json"`、`include: ["src/**/*"]`
  - `packages/lib/src/index.ts` を空バレル（コメント `// Shared utilities are added by downstream specs` のみ）として作成
  - 観測可能な完了状態: `pnpm --filter @bulr/lib typecheck` がエラーなく完了
  - _Requirements: 5.1, 5.2_
  - _Boundary: LibPackage_
  - _Depends: 2.1_
- [x] 2.4 (P) `packages/ai` スケルトンと AI/Whisper SDK 依存追加
  - `packages/ai/package.json` に `name: "@bulr/ai"`、`private: true`、`version: "0.0.1"`、`exports: { ".": "./src/index.ts" }`、`main: "./src/index.ts"`、`scripts: { typecheck: "tsc --noEmit", lint: "eslint ." }` を定義
  - `dependencies`: `ai` ^6.0.0（Vercel AI SDK 6）、`@ai-sdk/anthropic` ^3.0.0、`openai` ^4.0.0、`zod` ^4.0.0、`@bulr/db` `workspace:*`、`@bulr/types` `workspace:*`、`@bulr/lib` `workspace:*`。`devDependencies`: `typescript` ^5.4、`@types/node` ^22
  - `packages/ai/tsconfig.json` で `extends: "../../tsconfig.base.json"`、`include: ["src/**/*"]`
  - `packages/ai/src/index.ts` を空バレル（コメント `// LLM functions and Whisper wrapper are added by assessment-engine spec` のみ）として作成
  - `packages/ai/src/client.ts` を空ファイル（コメント `// Anthropic Claude Sonnet 4.6 client is added by assessment-engine spec` のみ）として作成
  - `packages/ai/src/functions/.gitkeep`、`packages/ai/src/prompts/.gitkeep`、`packages/ai/src/whisper/.gitkeep` を作成しディレクトリを git 登録
  - 観測可能な完了状態: `pnpm --filter @bulr/ai typecheck` がエラーなく完了し、`packages/ai/package.json` の `dependencies` に `ai` / `@ai-sdk/anthropic` / `openai` / `zod` の 4 SDK が宣言されている
  - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 6.6_
  - _Boundary: AiPackage_
  - _Depends: 2.1, 2.2, 2.3_

- [ ] 3. apps/web スケルトンの構築
- [x] 3.1 `apps/web/package.json` を作成
  - `name: "@bulr/web"`、`private: true`、`version: "0.0.1"` を設定
  - `scripts`: `dev: "next dev --turbopack -p 3000"`、`build: "next build"`、`start: "next start -p 3000"`、`typecheck: "tsc --noEmit"`、`lint: "eslint ."`
  - `dependencies`: `next` ^16.0.0、`react` ^19.0.0、`react-dom` ^19.0.0、`@bulr/db` `workspace:*`、`@bulr/types` `workspace:*`、`@bulr/lib` `workspace:*`、`@bulr/ai` `workspace:*`、`tailwindcss` ^4.0.0、`@tailwindcss/postcss` ^4.0.0
  - `devDependencies`: `@types/react` ^19、`@types/react-dom` ^19、`@types/node` ^22、`typescript` ^5.4
  - 観測可能な完了状態: `apps/web/package.json` が存在し、`@bulr/*` の 4 workspace 依存が `workspace:*` で宣言されている
  - _Requirements: 2.1, 2.3, 2.8, 6.1, 6.5_
- [x] 3.2 apps/web の Next.js / Tailwind / TypeScript 設定ファイルを作成
  - `apps/web/tsconfig.json`: `extends: "../../tsconfig.base.json"`、`compilerOptions: { jsx: "preserve", noEmit: true, plugins: [{ name: "next" }], paths: { "@/*": ["./*"] } }`、`include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]`、`exclude: ["node_modules"]`
  - `apps/web/next.config.ts`: `import type { NextConfig } from 'next'; const nextConfig: NextConfig = { reactCompiler: true }; export default nextConfig;`
  - `apps/web/postcss.config.mjs`: `export default { plugins: { '@tailwindcss/postcss': {} } };`
  - `apps/web/tailwind.config.ts`: `content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"]` を含む最小設定
  - `apps/web/components.json`（shadcn/ui）: `style: "default"`、`tailwind: { config: "tailwind.config.ts", css: "app/globals.css", baseColor: "neutral", cssVariables: true }`、`aliases: { components: "@/components", utils: "@/lib/utils" }`
  - 観測可能な完了状態: 上記 5 設定ファイルが apps/web に存在し、`pnpm --filter @bulr/web typecheck` がエラーなく完了
  - _Requirements: 2.1, 2.3, 2.4, 2.5_
  - _Depends: 1.3, 3.1_
- [x] 3.3 apps/web の App Router 最小ページを作成
  - `apps/web/app/globals.css` に `@import "tailwindcss";` を含める
  - `apps/web/app/layout.tsx` で `<html lang="ja"><body>{children}</body></html>` のルートレイアウトを定義し、`globals.css` を import
  - `apps/web/app/page.tsx` で空ランディング（例: `<main className="p-8"><h1 className="text-2xl font-bold">bulr</h1><p className="text-neutral-600">AI 面接アシスタント (準備中)</p></main>`）を返す Server Component を定義
  - `apps/web/components/.gitkeep` と `apps/web/lib/.gitkeep` を作成しディレクトリ予約
  - 観測可能な完了状態: `pnpm --filter @bulr/web build` がエラーなく完了し、`apps/web/.next/` 配下に build 成果物が生成される
  - _Requirements: 2.2, 2.4, 2.7, 2.9_
  - _Depends: 3.2_

## Integration: 統合検証

- [ ] 4. ルートレベルでの統合検証
- [x] 4.1 `pnpm install` 統合実行と lockfile 生成
  - クリーン状態（`node_modules` / `pnpm-lock.yaml` 削除後）からルートで `pnpm install` を実行
  - すべての workspace 依存（`@bulr/db`、`@bulr/types`、`@bulr/lib`、`@bulr/ai`）が解決され、`pnpm-lock.yaml` が生成されることを確認
  - 観測可能な完了状態: `pnpm install` がエラーなく完了し、`pnpm-lock.yaml` が repo ルートに存在する
  - _Requirements: 1.6, 6.1, 6.2_
  - _Depends: 1.1, 1.2, 1.6, 2.1, 2.2, 2.3, 2.4, 3.1_
- [ ] 4.2 `pnpm typecheck` 全 workspace 並列実行
  - ルートで `pnpm typecheck` を実行し、5 workspace（apps/web + packages/{db,types,lib,ai}）すべてで `tsc --noEmit` がエラーなく完了することを確認
  - Turborepo の依存解決により `packages/types` → `packages/{db,lib}` → `packages/ai` → `apps/web` の順で実行される
  - 観測可能な完了状態: `pnpm typecheck` の終了コードが 0 で、全 5 workspace が SUCCESS と表示される
  - _Requirements: 3.7, 4.6, 5.8, 7.4, 7.6_
  - _Depends: 4.1_
- [ ] 4.3 `pnpm lint` 全 workspace 並列実行
  - ルートで `pnpm lint` を実行し、5 workspace すべてで ESLint がエラーなく完了することを確認
  - Flat Config がルートから自動適用されること、ignores が機能すること（`.next` / `.turbo` 等が無視される）を確認
  - 観測可能な完了状態: `pnpm lint` の終了コードが 0 で、全 5 workspace が SUCCESS と表示される
  - _Requirements: 7.5, 7.7, 8.1, 8.2, 8.3, 8.6_
  - _Depends: 4.1_
- [ ] 4.4 `pnpm dev` で apps/web (port 3000) 起動確認
  - ルートで `pnpm dev` を実行し、Next.js dev server が port 3000 で起動することを確認
  - 別ターミナルから `curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/` を実行し、HTTP 200 を確認
  - ブラウザで `http://localhost:3000/` を開き、ランディングページのテキスト（"bulr" / "AI 面接アシスタント"）が表示されることを目視確認
  - 観測可能な完了状態: `curl http://localhost:3000/` が HTTP 200 を返し、空ランディングが表示される
  - _Requirements: 2.6_
  - _Depends: 4.2_
- [ ] 4.5 `pnpm build` 全 workspace 並列実行
  - ルートで `pnpm build` を実行し、apps/web の Next.js ビルドが成功することを確認
  - `apps/web/.next/` 配下に build 成果物（`build-manifest.json`、`server/`、`static/` 等）が生成されることを確認
  - 観測可能な完了状態: `pnpm build` の終了コードが 0 で、`apps/web/.next/build-manifest.json` が存在する
  - _Requirements: 2.7_
  - _Depends: 4.2_
- [ ] 4.6 サブパス export 解決の動作確認
  - `apps/web/app/page.tsx` に一時的に `import type {} from '@bulr/types/profile';` および `import type {} from '@bulr/types/evaluation';` の 2 行を追加
  - `pnpm typecheck` がエラーなく通ることを確認
  - 確認後、追加した 2 行を削除
  - 観測可能な完了状態: `@bulr/types/profile` と `@bulr/types/evaluation` のサブパス import が型チェックを通過することを 1 回確認し、その後コードを元に戻す
  - _Requirements: 4.2, 4.7, 6.5_
  - _Depends: 4.2_
- [ ] 4.7 Prettier 整形安定の確認
  - ルートで `npx prettier --check .` を実行し、既存ファイル（`package.json` 等を除く `.ts` / `.tsx` / `.mjs` / `.json` / `.md`）に対してエラーなく完了することを確認
  - 観測可能な完了状態: `npx prettier --check .` の終了コードが 0 で、全ファイルが "matched" と表示される
  - _Requirements: 1.5, 8.4, 8.5_
  - _Depends: 4.1_

> **完了の最終条件**: 4.1〜4.7 のすべてが SUCCESS で完了し、`git status` でコミット可能な状態になっていること。後続 5 spec はこの状態を upstream として実装を開始できる。
