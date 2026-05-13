# bulr-app-mvp

AI 面接アシスタント型 MVP プロトタイプ（Stage 1）

## Setup

詳細なセットアップ手順は [`docs/setup/README.md`](./docs/setup/README.md) を参照してください。

### クイックスタート（ローカル開発）

```bash
pnpm install
cp apps/web/.env.local.example apps/web/.env.local
# .env.local の各変数に値を埋める（docs/setup/README.md 参照）
pnpm dev
```

## Tech Stack

- **Frontend**: Next.js 16 + React 19 + Tailwind CSS 4
- **Database**: Neon Postgres + Drizzle ORM
- **AI**: Anthropic Claude Sonnet 4.6 + OpenAI Whisper
- **Hosting**: Vercel
- **Monorepo**: Turborepo + pnpm workspaces

## Project Structure

```
apps/web          # Next.js アプリ
packages/db       # Drizzle ORM スキーマ・クライアント
packages/types    # 共有型定義
packages/lib      # 共有ユーティリティ
packages/ai       # AI SDK ラッパー
docs/setup/       # セットアップ手順
```
