# Implementation Plan: multi-env-infrastructure

> 本タスクリストは、bulr Stage 1 MVP の本番デプロイ・PR Preview デプロイ・ローカル開発接続を成立させるため、`monorepo-foundation` 完了後の状態に対し (1) 環境変数規約 (`.env.example`)、(2) 外部サービスセットアップ手順書 (`docs/setup/`)、(3) GitHub Actions 最小 CI、(4) `README.md` への setup ポインタ追記、(5) Owner による Vercel/Neon/Resend/Anthropic の手動セットアップを順に整備する。
> ファイルパスはすべてリポジトリルート `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/` を起点とした相対パスで記載する。
> Owner 手動セットアップ (Vercel/Neon/Resend/Anthropic アカウント作成等) は Claude Code から自動実行できないため、Validation フェーズの「Owner Manual Setup」群として明示する。

## Foundation: 環境変数規約とテンプレート整備

- [ ] 1. リポジトリルートの環境変数テンプレートを整備
- [ ] 1.1 リポジトリルート `.env.example` を作成
  - `DATABASE_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`RESEND_API_KEY`、`NEXT_PUBLIC_APP_URL`、`ANTHROPIC_API_KEY`、`ADMIN_ALLOWED_EMAILS`、`ADMIN_BASIC_AUTH_USER`、`ADMIN_BASIC_AUTH_PASSWORD` の 9 変数をすべて含める
  - 各変数の前に 1-3 行コメントで (a) 用途、(b) 生成コマンドまたは例 (例: `BETTER_AUTH_SECRET` は `openssl rand -hex 32`、`ADMIN_BASIC_AUTH_PASSWORD` は `openssl rand -base64 24`)、(c) Production / Preview / Development の各 scope での値方針を記述
  - `NEXT_PUBLIC_APP_URL` のコメントで「`NEXT_PUBLIC_` プレフィックスはクライアント公開可、サーバー専用シークレットには絶対付けない」を明記
  - `ANTHROPIC_API_KEY` のコメントで「server-only、`NEXT_PUBLIC_` 禁止」を明記
  - 実シークレット値は絶対に書かず、placeholder (例: `re_xxxxxxxxxxxxxxxx`、`replace-me-with-...`) のみで埋める
  - 各 setup ドキュメントへの参照リンク (例: `# 取得手順: docs/setup/neon.md`) を該当変数のコメントに含める
  - 観測完了条件: ファイルがリポジトリルートに存在し、`grep -c '^[A-Z_]*=' .env.example` の結果が 9 となる (環境変数行が 9 行ある)
  - _Requirements: 1.1, 1.2, 1.4, 1.7, 6.1, 10.2_
  - _Boundary: EnvExampleRoot_

- [ ] 1.2 (P) `apps/web/.env.local.example` を作成
  - リポジトリルート `.env.example` と同一内容 (9 変数 + コメント) を配置する
  - ファイルヘッダコメントで「リポジトリルート `.env.example` と同期。新変数追加時は両方更新する」を明記
  - placeholder のみ、実シークレットは含めない
  - 観測完了条件: `apps/web/.env.local.example` が存在し、`diff .env.example apps/web/.env.local.example` で差分がパス記述以外ほぼゼロ (またはヘッダコメントの差分のみ)
  - _Requirements: 1.3, 1.4, 8.1_
  - _Boundary: EnvExampleWeb_
  - _Depends: 1.1_

- [ ] 1.3 (P) `.gitignore` の `.env*.local` 除外を確認
  - `monorepo-foundation` で導入された `.gitignore` に `.env.local` および `.env*.local` が含まれていることを `grep` で確認
  - 含まれていない場合のみ追記する (含まれていれば変更不要)
  - 観測完了条件: `grep -E '^\.env(\.\*)?\.local$' .gitignore` が両パターンにヒットする
  - _Requirements: 1.6, 10.4_
  - _Boundary: (existing GitignoreConfig — confirm only)_
  - _Depends: 1.1_

## Core: セットアップドキュメント整備

> 1.x 完了後、2.x のセットアップドキュメント群は内容が独立しているため (P) で並列作成可能。`docs/setup/README.md` (2.1) は他 setup ドキュメントへのリンクを持つため最後に作成または最初に作成して後でリンクを補完する。本タスクでは 2.1 を最初に骨組みだけ作り、各 setup md 完了後にリンクを追記する方針を採る。

- [ ] 2. `docs/setup/` 配下のセットアップ手順書を整備
- [ ] 2.1 `docs/setup/README.md` の骨組みを作成
  - タイトル「bulr Stage 1 セットアップ手順」と冒頭で「Owner および新規開発者向けの初期セットアップガイド」を記述
  - 推奨実施順を 1-6 で列挙: (1) Vercel → (2) Neon → (3) Resend → (4) Anthropic → (5) GitHub Actions / ブランチ保護 → (6) ローカル `.env.local` 整備
  - Owner 用チェックリスト (Markdown チェックボックス) を含める:
    - `- [ ] Vercel アカウント作成 + bulr-web プロジェクト作成 (Root Dir = apps/web)`
    - `- [ ] Neon プロジェクト作成 + production branch DATABASE_URL 取得`
    - `- [ ] Neon dev branch 作成 + DATABASE_URL 取得`
    - `- [ ] Vercel に DATABASE_URL を Production / Preview の各 scope に登録`
    - `- [ ] Resend アカウント + RESEND_API_KEY 取得 + Vercel 全 scope に登録`
    - `- [ ] Anthropic Console + ANTHROPIC_API_KEY 取得 + 月額予算アラート設定 + Vercel 全 scope に登録`
    - `- [ ] BETTER_AUTH_SECRET (openssl rand -hex 32) 生成 + Vercel に登録`
    - `- [ ] ADMIN_ALLOWED_EMAILS / ADMIN_BASIC_AUTH_USER / ADMIN_BASIC_AUTH_PASSWORD (openssl rand -base64 24) を Vercel に登録`
    - `- [ ] GitHub ブランチ保護ルール設定 (main + CI 必須)`
    - `- [ ] ローカル apps/web/.env.local 整備 + pnpm dev 動作確認`
  - 各 setup ドキュメントへのリンク (vercel.md / neon.md / resend.md / anthropic.md / github.md / local.md / env-vars.md) を「目次」として配置
  - 末尾に「後続 spec が新外部サービスを導入する際は、本 README に新 setup md と checklist 項目を追加する」規約を記述
  - 観測完了条件: ファイルが存在し、推奨実施順 6 ステップとチェックリストが含まれる
  - _Requirements: 9.1, 9.2, 9.6_
  - _Boundary: SetupReadme_
  - _Depends: 1.1_

- [ ] 2.2 (P) `docs/setup/vercel.md` を作成
  - 章構成:
    1. 前提 (Vercel Hobby プラン無料、GitHub アカウント必要)
    2. アカウント作成 + GitHub リポジトリ連携手順
    3. プロジェクト作成 (`bulr-web`、Root Directory = `apps/web`、Framework Preset = Next.js)
    4. Build 設定 (Build Command: `cd ../.. && pnpm turbo build --filter=web`、Install Command: `cd ../.. && pnpm install --frozen-lockfile`、Output Directory: `.next` (デフォルト))
    5. Production Branch を `main` に設定
    6. 環境変数登録 (Production / Preview / Development の 3 scope と各変数の対応表を Markdown table で提示):
       - `DATABASE_URL` (Production = production branch、Preview = dev branch、Development = dev branch 任意)
       - `BETTER_AUTH_SECRET` (全 scope 同値)
       - `BETTER_AUTH_URL` (Production = `https://<vercel-prod>.vercel.app`、Preview = `${VERCEL_URL}` または preview 動的 URL、Development = `http://localhost:3000`)
       - `RESEND_API_KEY` (全 scope 同 Free key)
       - `NEXT_PUBLIC_APP_URL` (各 scope の URL に合わせる)
       - `ANTHROPIC_API_KEY` (全 scope 同キー)
       - `ADMIN_ALLOWED_EMAILS` / `ADMIN_BASIC_AUTH_USER` / `ADMIN_BASIC_AUTH_PASSWORD` (全 scope 同値、強パスワード)
    7. 動作確認 (PR を立てて Preview URL がコメントされること、main マージで本番デプロイが起動すること)
    8. `vercel.json` 不要の判断と理由 (Stage 1 はダッシュボード設定で完結)
    9. カスタムドメイン (`bulr.net` 等) は Stage 1 末期 / Stage 2 で追加する旨と Vercel 公式ドキュメントへのリンク
  - 観測完了条件: ファイルが存在し、上記 9 章がすべて含まれる
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.4, 3.5, 6.4, 10.3_
  - _Boundary: VercelDoc_
  - _Depends: 1.1_

- [ ] 2.3 (P) `docs/setup/neon.md` を作成
  - 章構成:
    1. 前提 (Neon Free プラン、1 プロジェクト + 複数ブランチ可、storage 0.5 GB / compute 100 hours/月)
    2. アカウント作成 + `bulr` プロジェクト作成
    3. production branch (デフォルト) DATABASE_URL 取得手順 (Connection Details ページから `?sslmode=require` 付き接続文字列をコピー)
    4. dev branch 作成手順 (Branches ページで「Create branch」、parent = production branch、name = `dev`) + DATABASE_URL 取得
    5. ブランチ運用ルール (production = 本番真実、dev = 開発・スキーマ変更検証、Vercel Preview は dev DATABASE_URL を共有)
    6. Migration workflow:
       - ローカルで schema 変更 → `pnpm --filter @bulr/db generate` で migration ファイル生成
       - dev branch には `pnpm --filter @bulr/db push` で高速反映 (履歴なし、開発反復用)
       - production branch には `pnpm --filter @bulr/db migrate` で履歴付き反映 (PR レビュー後 main マージ前後に Owner が実施)
    7. **警告**: ローカル `.env.local` の `DATABASE_URL` を production branch に向けないこと
    8. Free プラン制限 (storage 0.5 GB、compute 100 hours/月) が Stage 1 規模で十分
  - 観測完了条件: ファイルが存在し、上記 8 章がすべて含まれる
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 8.3, 8.4_
  - _Boundary: NeonDoc_
  - _Depends: 1.1_

- [ ] 2.4 (P) `docs/setup/resend.md` を作成
  - 章構成:
    1. 前提 (Resend Free プラン、100 通/日、月 3,000 通)
    2. アカウント作成
    3. API キー生成手順 (`re_xxxxxxxx` 形式)
    4. Vercel 環境変数 (`RESEND_API_KEY`) + ローカル `.env.local` への登録 (全 scope 同じキー)
    5. Stage 1 では Resend テストドメイン (例: `onboarding@resend.dev`) を `from` に使う方針
    6. カスタムドメイン認証 (DNS SPF / DKIM) は Stage 2 で実施する旨
    7. Free プラン制限 (100 通/日、3000 通/月) が Stage 1 規模 (月数百通の Magic Link) に対して十分
    8. トラブルシューティング: API キー漏洩時のローテーション手順 (Resend ダッシュボードで再発行 → Vercel 環境変数更新 → 再デプロイ)
  - 観測完了条件: ファイルが存在し、上記 8 章がすべて含まれる
  - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_
  - _Boundary: ResendDoc_
  - _Depends: 1.1_

- [ ] 2.5 (P) `docs/setup/anthropic.md` を作成
  - 章構成:
    1. 前提 (Anthropic Console、Claude Sonnet 4.6 利用)
    2. アカウント作成
    3. API キー生成手順 (`sk-ant-xxxxxxxx` 形式)
    4. Vercel 環境変数 + ローカル `.env.local` への登録 (全 scope 同じキー)
    5. **必須手順**: 月額予算アラート設定 ($300 で警告、$500 で停止) を Anthropic Console の Usage / Billing から設定
    6. Stage 1 コスト目安 ($50-150/月、70 セッション × Sonnet 4.6) を提示
    7. **警告**: `ANTHROPIC_API_KEY` は server-only。`NEXT_PUBLIC_` を絶対に付けない、クライアントコードから絶対に参照しない
    8. トラブルシューティング: API キー漏洩時のローテーション + 予算超過時の挙動 (Stop on $500 で API が一時停止)
  - 観測完了条件: ファイルが存在し、上記 8 章がすべて含まれる
  - _Requirements: 5.1, 5.2, 5.4, 5.5, 10.1_
  - _Boundary: AnthropicDoc_
  - _Depends: 1.1_

- [ ] 2.6 (P) `docs/setup/github.md` を作成
  - 章構成:
    1. GitHub Actions は本リポジトリで自動有効 (`.github/workflows/ci.yml` 配置で起動)
    2. ブランチ保護ルール推奨設定手順 (Owner が GitHub UI で手動設定):
       - Settings → Branches → Add rule
       - Branch name pattern: `main`
       - 「Require a pull request before merging」を有効化
       - 「Require status checks to pass before merging」を有効化、必須 status check として `ci.yml` の job を指定 (typecheck / lint / audit を job 名で指定)
       - 「Require branches to be up to date before merging」を有効化 (推奨)
       - 「Do not allow bypassing the above settings」の扱いを Owner 判断 (Stage 1 は Owner 緊急 push を許容するか検討)
    3. CI 失敗時は merge 不可、これにより `pnpm audit` の moderate 以上 fail も merge ブロックされる
    4. Vercel との関係: Vercel デプロイの成否は branch protection には含めない (Vercel 側で Preview 失敗時に PR コメントで通知される)
  - 観測完了条件: ファイルが存在し、上記 4 章がすべて含まれる
  - _Requirements: 7.7, 10.6_
  - _Boundary: GithubDoc_
  - _Depends: 1.1_

- [ ] 2.7 (P) `docs/setup/local.md` を作成
  - 章構成:
    1. 前提 (`monorepo-foundation` 完了済み、Owner から Neon dev DATABASE_URL を共有済み)
    2. 手順:
       - `cp apps/web/.env.local.example apps/web/.env.local`
       - 各値を記入 (Owner から共有された DATABASE_URL / RESEND_API_KEY / ANTHROPIC_API_KEY、自分で生成する BETTER_AUTH_SECRET 等)
       - リポジトリルートで `pnpm install`
       - `pnpm dev` で `http://localhost:3000` 起動
       - `pnpm --filter @bulr/db push` で dev branch にスキーマ反映 (後続 spec が schema を追加した後)
    3. **警告**: `DATABASE_URL` を production branch に向けないこと
    4. トラブルシューティング: `DATABASE_URL is required` エラー → `apps/web/.env.local` の配置場所と内容を確認
  - 観測完了条件: ファイルが存在し、上記 4 章がすべて含まれる
  - _Requirements: 8.1, 8.5, 8.6_
  - _Boundary: LocalDoc_
  - _Depends: 1.1_

- [ ] 2.8 (P) `docs/setup/env-vars.md` を作成
  - 章構成:
    1. Stage 1 環境変数早見表 (Markdown table、列: 変数名 / 用途 / Production scope / Preview scope / Development scope / `NEXT_PUBLIC_` 可否 / 取得元 setup ドキュメント)
    2. `NEXT_PUBLIC_` 規約: クライアントバンドルに含まれるため公開可の値のみ。サーバー専用は絶対に付けない
    3. 後続 spec が新変数を追加する際の規約: ルート `.env.example` と `apps/web/.env.local.example` の両方を更新する
    4. シークレット強パスワード生成コマンド集:
       - `BETTER_AUTH_SECRET`: `openssl rand -hex 32`
       - `ADMIN_BASIC_AUTH_PASSWORD`: `openssl rand -base64 24`
    5. ローテーション手順 (各シークレットごとに):
       - Resend API キー: Resend ダッシュボードで再発行 → Vercel 環境変数更新 → 再デプロイ
       - Anthropic API キー: 同上 (Anthropic Console)
       - Better Auth Secret: ローテーション時は全セッション無効化される副作用を理解した上で実施
       - Admin Basic Auth Password: 同様に Vercel 環境変数を更新 → 再デプロイ
  - 観測完了条件: ファイルが存在し、上記 5 章がすべて含まれる
  - _Requirements: 1.5, 1.7, 6.2, 10.1, 10.2, 10.3, 10.5_
  - _Boundary: EnvVarsDoc_
  - _Depends: 1.1_

- [ ] 2.9 `docs/setup/README.md` の目次リンクを最終化
  - 2.2 〜 2.8 完了後、`docs/setup/README.md` から各 setup ドキュメント (vercel.md / neon.md / resend.md / anthropic.md / github.md / local.md / env-vars.md) への相対リンクが正しく機能することを確認
  - 必要に応じてリンクを修正 (拡張子・パス)
  - 観測完了条件: `docs/setup/README.md` 内の全リンクが正しいパスを指し、ローカルで Markdown ビューワで開くと各ファイルにジャンプできる
  - _Requirements: 9.1, 9.3_
  - _Boundary: SetupReadme_
  - _Depends: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

## Integration: CI ワークフローと README ポインタ追記

- [ ] 3. GitHub Actions の最小 CI を整備
- [ ] 3.1 `.github/workflows/ci.yml` を作成
  - トリガー: `pull_request` to `main` および `push` to `main`
  - `runs-on: ubuntu-latest`、単一 `ci` job 内で順次 step 実行 (本スペックでは並列 job 化せず単純構成)
  - step 構成:
    - `actions/checkout@v4`
    - `pnpm/action-setup@v4` (`version: 10`)
    - `actions/setup-node@v4` (`node-version: 22`、`cache: 'pnpm'`)
    - `pnpm install --frozen-lockfile`
    - `pnpm typecheck`
    - `pnpm lint`
    - `pnpm audit --audit-level=moderate`
  - `pnpm build` および test 実行は本スペックでは含めない (Vercel Preview と重複回避、テスト導入は別 spec)
  - 観測完了条件: ファイルが存在し、`yamllint` または手動 yaml parse でエラーがない、`gh workflow list` (Owner 確認) で表示される
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 10.6_
  - _Boundary: CiYml_
  - _Depends: 1.1_

- [ ] 4. リポジトリルート `README.md` に setup ポインタを追記
- [ ] 4.1 `README.md` への 1-2 行追記
  - `monorepo-foundation` で書かれた既存 `README.md` の内容を保ったまま、適切な位置 (例: 「セットアップ」または「Getting Started」セクション付近) に「初期セットアップ (Vercel / Neon / Resend / Anthropic) は [`docs/setup/README.md`](./docs/setup/README.md) を参照」の行を追加
  - 既存セクションの内容は変更せず、追加のみとする (重複文書化を避ける)
  - 観測完了条件: `grep -F 'docs/setup/README.md' README.md` がヒットし、既存内容が `git diff` で意図しない変更を含まない
  - _Requirements: 9.4, 9.5_
  - _Boundary: ReadmePointer_
  - _Depends: 2.1_

## Validation: 構成確認 + Owner 手動セットアップ

> Validation フェーズは大きく 2 群に分かれる:
> - **Repo Sanity Checks (5.x)**: Claude Code 実装者が確認可能な「リポジトリ内ファイルが正しく作られているか」のチェック
> - **Owner Manual Setup (6.x)**: Owner が外部サービスダッシュボードで手動実施するセットアップ。Claude Code は実行できないため、本スペック実装完了後に Owner が `docs/setup/README.md` のチェックリストに沿って実施する。タスクとして列挙し進捗管理を可能にする。

- [ ] 5. リポジトリ内ファイル構成の Sanity Checks
- [ ] 5.1 `.env.example` と `apps/web/.env.local.example` の Stage 1 変数を確認
  - 両ファイルがリポジトリルートおよび `apps/web/` に存在すること
  - 9 変数 (`DATABASE_URL` / `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` / `RESEND_API_KEY` / `NEXT_PUBLIC_APP_URL` / `ANTHROPIC_API_KEY` / `ADMIN_ALLOWED_EMAILS` / `ADMIN_BASIC_AUTH_USER` / `ADMIN_BASIC_AUTH_PASSWORD`) がいずれも 1 行ずつ記述されていること
  - placeholder のみで実シークレット値が含まれないこと (例: 値が `re_xxxxxxxxxxxxxxxx` 等のダミー、または `replace-me-...` 形式)
  - 観測完了条件: `grep -E '^DATABASE_URL=|^BETTER_AUTH_SECRET=|^BETTER_AUTH_URL=|^RESEND_API_KEY=|^NEXT_PUBLIC_APP_URL=|^ANTHROPIC_API_KEY=|^ADMIN_ALLOWED_EMAILS=|^ADMIN_BASIC_AUTH_USER=|^ADMIN_BASIC_AUTH_PASSWORD=' .env.example` が 9 行ヒット、同じく `apps/web/.env.local.example` でも 9 行ヒット
  - _Requirements: 1.1, 1.3, 1.4_
  - _Boundary: EnvExampleRoot, EnvExampleWeb_
  - _Depends: 1.1, 1.2_

- [ ] 5.2 (P) `docs/setup/` 配下の 8 ファイル存在確認
  - `docs/setup/{README,vercel,neon,resend,anthropic,github,local,env-vars}.md` の 8 ファイルがすべて存在すること
  - 各ファイルが空でなく、章見出し (`##` または `###`) を 1 つ以上含むこと
  - 観測完了条件: `ls docs/setup/*.md | wc -l` が 8、`grep -L '^##' docs/setup/*.md` が空 (全ファイルが章見出しを持つ)
  - _Requirements: 9.1, 9.3_
  - _Boundary: SetupReadme, VercelDoc, NeonDoc, ResendDoc, AnthropicDoc, GithubDoc, LocalDoc, EnvVarsDoc_
  - _Depends: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

- [ ] 5.3 (P) `.github/workflows/ci.yml` の構造確認
  - ファイルが存在すること
  - YAML として parse 可能であること (例: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` がエラーなし、または手動確認)
  - `pull_request` トリガーと `push` トリガーが存在
  - `pnpm typecheck`、`pnpm lint`、`pnpm audit --audit-level=moderate` の各 step が含まれる
  - Node.js 22 + pnpm 10 の指定が含まれる
  - 観測完了条件: 上記すべてを `cat .github/workflows/ci.yml` で目視確認
  - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - _Boundary: CiYml_
  - _Depends: 3.1_

- [ ] 5.4 (P) `README.md` の setup ポインタ追記確認
  - `grep -F 'docs/setup/README.md' README.md` がヒットすること
  - 既存 `README.md` の内容が `monorepo-foundation` 由来のセクションを保持していること (`git diff` で意図しない大幅変更がない)
  - 観測完了条件: `grep -c 'docs/setup' README.md` が 1 以上
  - _Requirements: 9.4, 9.5_
  - _Boundary: ReadmePointer_
  - _Depends: 4.1_

- [ ] 5.5 `monorepo-foundation` 由来の `packages/db/drizzle.config.ts` の `.env.local` 自動読込動作確認
  - `packages/db/drizzle.config.ts` の現在の実装が `.env.local` をルートまたは `apps/web/` から自動読込する経路を持つことを `cat packages/db/drizzle.config.ts` で確認
  - 経路が機能している場合は変更不要 (本スペックは構造変更しない)
  - 経路が機能していない場合のみ、最小修正 (例: `dotenv` の path 指定を `apps/web/.env.local` に向ける) を加える
  - 観測完了条件: 後続 5.6 タスクで `pnpm --filter @bulr/db generate` が `.env.local` から `DATABASE_URL` を解決して動作することで間接的に確認
  - _Requirements: 8.2_
  - _Boundary: (existing DrizzleConfig — confirm only, modify only if broken)_
  - _Depends: 1.2_

- [ ] 5.6 ローカルで `.env.local` を試験用に整備し `pnpm dev` 動作確認
  - `cp apps/web/.env.local.example apps/web/.env.local` を実行
  - `DATABASE_URL` に test 用 dummy 値 (例: `postgres://user:pass@localhost:5432/dummy`) を記入 (実 Neon 接続は 6.x の Owner Manual Setup 後に確認)
  - 他の必須環境変数にも placeholder を記入し `apps/web/.env.local` を完成させる
  - `pnpm install`、`pnpm typecheck`、`pnpm lint`、`pnpm dev` を順に実行し、`pnpm dev` で `http://localhost:3000` が起動することを確認 (DB アクセスを伴わないランディングページ表示で OK)
  - 確認後、`apps/web/.env.local` は git 管理外 (gitignore 済み) であることを `git status` で確認
  - 観測完了条件: `pnpm dev` が起動し `http://localhost:3000` でランディングページが表示される、`git status` で `apps/web/.env.local` が untracked or 表示されない
  - _Requirements: 1.6, 8.1, 10.4_
  - _Boundary: (existing WebApp + EnvExampleWeb)_
  - _Depends: 1.2, 1.3, 5.5_

- [ ] 5.7 GitHub Actions CI を test PR で起動確認
  - 一時ブランチを作成 (例: `chore/test-ci`)
  - 任意の小さな変更 (例: `README.md` のタイポ修正) を commit + push
  - `gh pr create` で PR を作成
  - GitHub Actions の `ci` ワークフローが起動し、`pnpm typecheck`、`pnpm lint`、`pnpm audit --audit-level=moderate` がすべて完了することを確認
  - 確認後、test PR は close、test ブランチは削除
  - 観測完了条件: PR ページで CI チェック (`ci / ci`) が緑、または既知の audit 警告のみで明示的な fail なし
  - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - _Boundary: CiYml_
  - _Depends: 3.1_

- [ ] 6. Owner Manual Setup (Vercel / Neon / Resend / Anthropic / GitHub / Local)
> 以下のタスクは Owner が `docs/setup/README.md` のチェックリストに沿って手動で実施する。Claude Code は実行できないため、進捗管理用に列挙する。各タスクは独立しており、Vercel → Neon → Resend → Anthropic → GitHub → Local の順を推奨するが、Vercel 環境変数登録 (6.4) は Neon (6.2)、Resend (6.5)、Anthropic (6.6) 完了後にまとめて実施する。

- [ ] 6.1 Owner: Vercel アカウント作成 + プロジェクト作成
  - `docs/setup/vercel.md` の手順 1-5 に従う:
    - Vercel Hobby アカウント作成
    - GitHub リポジトリ `bulr-app-mvp` を Vercel に連携
    - プロジェクト名 `bulr-web` で新規作成
    - Root Directory を `apps/web` に設定
    - Build Command / Install Command / Output Directory を `vercel.md` 通りに設定
    - Production Branch を `main` に設定
  - 観測完了条件: Vercel ダッシュボードで `bulr-web` プロジェクトが表示され、Production URL (`*.vercel.app`) が発行されている
  - _Requirements: 2.1, 2.2, 2.4, 2.7_
  - _Boundary: VercelDoc (Owner 実行)_
  - _Depends: 2.2_

- [ ] 6.2 Owner: Neon プロジェクト作成 + production / dev ブランチ整備
  - `docs/setup/neon.md` の手順 1-4 に従う:
    - Neon Free アカウント作成
    - プロジェクト `bulr` 作成 (production branch がデフォルト発行される)
    - Connection Details ページから production branch DATABASE_URL をコピー
    - Branches ページで `dev` branch を production からブランチして作成、DATABASE_URL をコピー
  - 観測完了条件: Neon ダッシュボードで `bulr` プロジェクトに `production` と `dev` の 2 ブランチが存在し、各々の DATABASE_URL が手元にある
  - _Requirements: 3.1, 3.2_
  - _Boundary: NeonDoc (Owner 実行)_
  - _Depends: 2.3_

- [ ] 6.3 (P) Owner: Anthropic API キー取得 + 月額予算アラート設定
  - `docs/setup/anthropic.md` の手順 1-5 に従う:
    - Anthropic Console アカウント作成
    - API キー生成 (`sk-ant-xxxxxxxx`) し手元に保存
    - **必須**: Console の Usage / Billing から月額予算アラート ($300 で警告、$500 で停止) を設定
  - 観測完了条件: Anthropic Console で API キーが発行済み、Budget Alerts が $300/$500 に設定済み
  - _Requirements: 5.1, 5.2, 5.4_
  - _Boundary: AnthropicDoc (Owner 実行)_
  - _Depends: 2.5_

- [ ] 6.4 Owner: Vercel 環境変数を全 scope に登録
  - `docs/setup/vercel.md` の章 6 「環境変数登録」表に従い、Production / Preview / Development の各 scope に以下を登録:
    - `DATABASE_URL` (Production = production branch URL [from 6.2]、Preview = dev branch URL [from 6.2]、Development = dev branch URL 任意)
    - `BETTER_AUTH_SECRET` (`openssl rand -hex 32` で生成、全 scope 同値)
    - `BETTER_AUTH_URL` (Production = `https://<vercel-prod>.vercel.app`、Preview = preview URL、Development = `http://localhost:3000`)
    - `RESEND_API_KEY` (from 6.5)
    - `NEXT_PUBLIC_APP_URL` (各 scope の URL)
    - `ANTHROPIC_API_KEY` (from 6.3、全 scope 同値)
    - `ADMIN_ALLOWED_EMAILS` (Owner email + 必要な reviewer、全 scope)
    - `ADMIN_BASIC_AUTH_USER` (例: `admin`、全 scope)
    - `ADMIN_BASIC_AUTH_PASSWORD` (`openssl rand -base64 24` で生成、全 scope 同値)
  - 観測完了条件: Vercel ダッシュボードの Settings → Environment Variables で 9 変数 × 3 scope = 最大 27 エントリ (一部 scope 共有)が登録されている
  - _Requirements: 1.1, 2.3, 3.4, 3.5, 6.4, 10.3_
  - _Boundary: VercelDoc, EnvExampleRoot (Owner 実行)_
  - _Depends: 6.1, 6.2, 6.3, 6.5_

- [ ] 6.5 (P) Owner: Resend アカウント作成 + API キー取得
  - `docs/setup/resend.md` の手順 1-4 に従う:
    - Resend Free アカウント作成
    - API キー生成 (`re_xxxxxxxx`)
  - 観測完了条件: Resend ダッシュボードで API キーが発行済み、手元にコピー済み
  - _Requirements: 4.1, 4.3_
  - _Boundary: ResendDoc (Owner 実行)_
  - _Depends: 2.4_

- [ ] 6.6 Owner: GitHub ブランチ保護ルール設定
  - `docs/setup/github.md` の手順 2 に従う:
    - Settings → Branches → Add rule
    - Branch name pattern: `main`
    - 「Require a pull request before merging」を有効化
    - 「Require status checks to pass before merging」を有効化、必須 status check として `ci` (`.github/workflows/ci.yml` の job 名) を指定
    - その他推奨オプションを Owner 判断で有効化
  - 観測完了条件: GitHub Settings → Branches で `main` の保護ルールが表示され、CI が必須 check として登録されている
  - _Requirements: 7.7, 10.6_
  - _Boundary: GithubDoc (Owner 実行)_
  - _Depends: 2.6, 5.7_

- [ ] 6.7 Owner: ローカル `.env.local` 整備 + `pnpm dev` 動作確認 (本接続)
  - `docs/setup/local.md` の手順に従う:
    - `cp apps/web/.env.local.example apps/web/.env.local`
    - 6.4 で Vercel に登録した値と同じ環境変数値を `apps/web/.env.local` に記入 (`DATABASE_URL` は dev branch の URL を使う)
    - `pnpm install` (リポジトリルート)
    - `pnpm dev` で `http://localhost:3000` が起動し、ランディングページが表示されること
  - 観測完了条件: `http://localhost:3000` でランディングページが表示、`git status` で `apps/web/.env.local` が gitignore で除外されている
  - _Requirements: 8.1, 8.5, 8.6, 10.4_
  - _Boundary: LocalDoc (Owner 実行)_
  - _Depends: 6.2, 6.4_

- [ ] 6.8 Owner: PR Preview デプロイ + main 本番デプロイの自動実行を確認
  - 試験用ブランチ (例: `chore/test-deploy`) で軽微な変更を commit + push し PR を作成
  - Vercel が PR コメントで Preview URL を自動投稿することを確認
  - Preview URL を開き、ランディングページが表示されることを確認 (DB を使わないため空 schema でも表示される)
  - PR を main にマージし、Vercel が本番デプロイを起動して Production URL が更新されることを確認
  - 確認後、試験用ブランチは削除
  - 観測完了条件: Vercel ダッシュボードに Preview デプロイと Production デプロイの履歴が記録されている、Production URL でランディングページが表示される
  - _Requirements: 2.4, 2.5_
  - _Boundary: VercelDoc (Owner 実行)_
  - _Depends: 6.1, 6.4_
