# Project Structure

## 組織方針

- **Stage 1 はモノレポ + 単一アプリ**：apps/web 1 つに受験者 UI・管理画面・API・問診ロジックを同居
- **Server-First**：データフェッチ・DB アクセスは Server Component / Server Action / API Route で完結。クライアント境界を最小化
- **packages 切り出しは「2 アプリ以上で共有する瞬間」まで遅延**：Stage 1 で apps/admin を切り出す予定がないため、UI / auth / i18n は apps/web 内に直書き
- **DB スキーマの単一の真実は packages/db**：他パッケージ・アプリは必ず packages/db 経由で参照

## モノレポ ディレクトリ構造（Stage 1）

```
bulr-app-mvp/
├── apps/
│   └── web/                        # 受験者 + 管理画面同居 (bulr.net)
│       ├── app/
│       │   ├── (assessment)/       # 受験者向けルート
│       │   │   ├── assessments/
│       │   │   │   ├── start/      # 問診開始（メール入力 → Magic Link）
│       │   │   │   └── [sessionId]/ # 進行中の問診（対話型 UI）
│       │   │   └── done/           # 完了画面
│       │   ├── admin/              # 管理画面（Basic 認証 + 許可メール二重チェック）
│       │   │   ├── sessions/       # 受験セッション一覧
│       │   │   ├── sessions/[id]/  # 回答全文 + LLM 評価 + 手動評価
│       │   │   └── login/
│       │   ├── api/
│       │   │   ├── chat/           # 問診の対話 API（SSE ストリーミング）
│       │   │   ├── auth/           # Better Auth エンドポイント
│       │   │   ├── admin/          # 管理 API
│       │   │   └── sessions/       # セッション CRUD
│       │   ├── layout.tsx
│       │   └── page.tsx            # ランディング（ベータの説明）
│       ├── components/             # apps/web 専用コンポーネント
│       └── lib/                    # apps/web 専用ユーティリティ（Better Auth 設定含む）
│
├── packages/
│   ├── db/                         # Drizzle スキーマ + クエリ関数（DB スキーマの唯一の真実）
│   ├── types/                      # 共通型定義
│   ├── lib/                        # 共通ユーティリティ
│   └── ai/                         # 問診プロンプト、ツール定義、評価ロジック
│
├── docs/                           # プロダクト仕様・問診設計ドキュメント
│   └── (handoff / patterns / probe-logic / architecture-mvp 等)
│
├── scripts/                        # 開発スクリプト、データシード（57 パターン投入等）
│
├── .github/workflows/              # CI/CD（Stage 1 は最小限：型チェック・lint）
│
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

### Stage 1 で作らないパッケージ（Stage 2 以降）

- `packages/auth` — Better Auth 設定。Stage 1 は apps/web/lib/ に直書き、apps/admin 分離時に切り出し
- `packages/ui` — 共通 UI コンポーネント。Stage 1 は apps/web/components/ で十分
- `packages/i18n` — 国際化。Stage 1 は日本語のみで不要

切り出し基準: **「2 アプリ以上で参照する瞬間」**。3 回現れたら共通化、を判断軸とする。

## ルートグループのパターン

- `(assessment)/` — 受験者向けメインフロー。受験者識別後にアクセス（Magic Link 認証）
- `admin/` — 創業者向け管理画面。Basic 認証 + `ADMIN_ALLOWED_EMAILS` の二重チェック

## App Router のコード分離原則

- **Server Components**: データフェッチ・DB アクセス（Drizzle）・SEO メタデータ生成
- **Client Components** (`'use client'`): インタラクション・`useChat` フック・状態管理
- **API Routes** (`app/api/`): チャットストリーミング・認証コールバック・管理 API

データは Server Component で取得して props で渡す。クライアント境界を最小化。

## 命名規則

- **ファイル**: kebab-case (`pattern-card.tsx`, `select-next-pattern.ts`)
- **コンポーネント**: PascalCase (`PatternCard`, `AssessmentChat`)
- **関数・変数**: camelCase (`selectNextPattern`, `currentSession`)
- **DB テーブル**: snake_case (`assessment_session`, `assessment_pattern`)
- **DB カラム**: snake_case (`level_reached`, `created_at`)
- **状況パターン ID**: `<カテゴリ>-<連番>` (`D-01`, `T-12`, `A-06`)。カテゴリ = D / T / P / S / O / A
- **URL スラッグ**: 英語 kebab-case

## インポートパターン

```typescript
// パッケージ参照（workspace）
import { db } from '@bulr/db';
import { tools } from '@bulr/ai';

// Next.js 絶対パス
import { PatternCard } from '@/components/pattern-card';

// ローカル相対
import { formatDuration } from './utils';
```

## URL 設計（Stage 1）

```
受験者向け:
  /                              ランディング（ベータの説明）
  /assessments/start             問診開始（メール入力 → Magic Link）
  /assessments/[sessionId]       進行中の問診（対話型 UI）
  /assessments/done              完了画面

管理画面（Basic 認証 + 許可メール二重チェック）:
  /admin/sessions                受験セッション一覧
  /admin/sessions/[id]           セッション詳細（回答全文 + 評価）
  /admin/login                   管理者ログイン

API:
  /api/chat                      問診の対話 API（SSE ストリーミング）
  /api/auth/*                    Better Auth エンドポイント
  /api/admin/*                   管理 API
  /api/sessions/*                セッション CRUD
```

## データモデル

### 設計原則

1. **Better Auth テーブルに独自カラムを追加しない** — `user`, `session`, `account`, `verification` は Better Auth 管理。bulr 固有データは `user_profile` 等の別テーブルで 1:1 参照
2. **状況パターンはマスタ + 4 段階質問テンプレを 1 行に保持** — `assessment_pattern` 1 テーブルでパターン定義と段階別質問を完結
3. **回答は段階別カラム + JSONB 評価結果** — `assessment_answer` で 4 段階の自由テキスト回答 + LLM 評価 + 手動評価を 1 レコードに集約
4. **チャット履歴は別テーブル** — `chat_message` で会話全体を時系列保存（後でデバッグ・問診改善に使う素材）
5. **物理削除基本** — 論理削除なし。削除は GDPR 対応で 30 日猶予（受験者削除リクエスト時のみ）

### エンティティ関係（Stage 1 最小構成）

```
user (Better Auth 管理)
  └── user_profile (1:1: 受験プロファイル — 経験年数、扱った言語等)

assessment_session
  ├── assessment_answer (1:N: パターン別回答)
  └── chat_message (1:N: 対話履歴)

assessment_pattern (マスタ: 57 パターン × 4 段階質問テンプレ、創業者が手動シード)
  └── assessment_answer.pattern_id で参照
```

### 主要テーブル概要

| テーブル | 用途 | オーナー |
|---|---|---|
| `user_profile` | bulr 固有受験者設定（経験年数・扱った言語・関わったシステム種別） | user |
| `assessment_session` | 受験セッション（status / role / profile_input / 開始終了時刻） | user |
| `assessment_pattern` | 状況パターンマスタ（code / category / 4 段階質問テンプレ） | admin（創業者シード） |
| `assessment_answer` | パターン別回答（level_reached + 段階別回答 + LLM 評価 JSONB + 手動評価 JSONB） | session |
| `chat_message` | 対話履歴（role / content / tool_calls JSONB） | session |

### Stage 1 で作らないテーブル（Stage 2 以降）

- `workspace` / `workspace_user`（マルチテナント不要）
- `job` / `application`（求人・応募管理は Stage 2 以降）
- `skill_heatmap`（ヒートマップ可視化は Stage 2 以降）
- `anon_session`（bulr は Magic Link 必須、匿名セッション概念なし）

### データ保持ポリシー

- **受験セッション**: 永続保持（検証データとして使うため）
- **アカウント削除**: 削除リクエスト → `deletion_scheduled_at = now() + 30 日` → 30 日後に物理削除（GDPR 準拠）
- **チャット履歴**: 1 セッション最大 200 メッセージ（4 段階 × 50 パターン想定）

## packages 依存ルール

```
apps/web ─→ packages/{db, types, lib, ai}
packages/ai ─→ packages/{db, types, lib}
packages/db ─→ packages/types
packages/lib ─→ packages/types
packages/types ─→ なし
```

- 循環参照は禁止
- packages/db が DB スキーマの唯一の真実
- packages 間で互いに参照する場合は types のみが純粋な依存先

## Stage 2 への移行で起きる構造変化（参考）

3 ヶ月の検証で「いける」と判断したら、以下の順序で構造を変える：

1. **apps/admin の分離** → 管理画面を別 Next.js アプリに切り出し、`admin.bulr.net` サブドメインへ
2. **packages/auth の切り出し** → Better Auth 設定を packages 化、apps/web と apps/admin で共有
3. **packages/ui の切り出し** → 共通 UI コンポーネントを apps/web から抽出
4. **packages/i18n の追加** → next-intl で日本語・英語対応
5. **追加職種** → フロントエンド・SRE/インフラ・PdM 領域の状況パターン追加
6. **マルチテナント機能** → ワークスペース・求人管理・応募管理（bz.bulr.net）
