# 01. アーキテクチャ - 完全版 (Stage 2 以降の青写真)

> **このドキュメントの位置づけ**
> 3ヶ月のプロトタイプ検証フェーズ（Stage 1）が成功した後の、本格的なプロダクト化フェーズ（Stage 2 以降）における目標アーキテクチャ。
> Stage 1 の実装範囲は別ドキュメント `01-architecture-mvp.md` を参照。
> このドキュメントは「最終的にここを目指す」という青写真であり、最初から全部作るものではない。

## 全体構成

```
┌─────────────────────────────────────────────────────┐
│  受験者 / 採用担当者 / 管理者の Browser              │
│  - Next.js Frontend (React, PWA-ready)               │
│  - Vercel AI SDK (useChat hook)                      │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS / SSE Streaming
                   ▼
┌─────────────────────────────────────────────────────┐
│  apps/web (Vercel) - bulr.net                       │
│  - 受験者向け（個人ユーザー）                        │
│  - 対話型問診、結果閲覧、履歴                       │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────────┐
│  apps/business (Vercel) - bz.bulr.net               │
│  - 企業向け（採用担当・面接官）                     │
│  - ワークスペース別 UI                              │
│  - 求人管理、応募管理、ヒートマップ閲覧             │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────────┐
│  apps/admin (Vercel) - admin.bulr.net               │
│  - 運営管理者向け                                   │
│  - 問診パターン管理、受験者管理、ワークスペース管理 │
└────┬───────────────────┬────────────────────────────┘
     │                   │
     ▼                   ▼
┌─────────────┐   ┌─────────────────────────────────┐
│ Anthropic   │   │ Neon Postgres                   │
│ Claude API  │   │  + pgvector                     │
│ (Sonnet)    │   │  (セマンティック検索、Phase 2+) │
└─────────────┘   └─────────────────────────────────┘

外部サービス:
  - Resend: メール配信（マジックリンク、通知、招待）
  - Cloudflare R2: ファイルストレージ（CV、ポートフォリオ、画像）
  - PostHog: イベント計測、ファネル分析
  - Sentry: エラー監視
  - Helicone: LLMコスト・レイテンシ監視
  - BetterStack: 死活監視
```

## 技術スタック

### フロントエンド + バックエンド

| 層                 | 技術                    | 役割                                                  |
| ------------------ | ----------------------- | ----------------------------------------------------- |
| Framework          | Next.js 16 (App Router) | フロント+API両対応 (Turbopack stable, React Compiler) |
| UI                 | React 19                | UIライブラリ (React Compiler 対応)                    |
| Styling            | Tailwind CSS 4          | ユーティリティCSS                                     |
| UI Components      | shadcn/ui ベース        | カスタマイズ可能なUI                                  |
| Data Visualization | Recharts / D3           | ヒートマップ、レーダーチャート                        |
| AI Streaming       | Vercel AI SDK 6         | useChat hook、streamText、ToolLoopAgent               |
| LLM Client         | Anthropic SDK           | Claude API                                            |
| Type Safety        | TypeScript              | 全層で使用                                            |
| Validation         | Zod                     | スキーマ検証、Tool Use                                |
| Data Fetching      | TanStack Query          | クライアントサイドのデータキャッシュ                  |

### データベース

| 層        | 技術              | 役割                                                 |
| --------- | ----------------- | ---------------------------------------------------- |
| DB        | Neon Postgres     | サーバーレスPostgres                                 |
| ORM       | Drizzle ORM       | 型安全なクエリ                                       |
| Migration | drizzle-kit       | スキーマ管理                                         |
| Vector    | pgvector          | 経験パターン・スキルプロファイルのセマンティック検索 |
| Cache     | Vercel KV (Redis) | セッションキャッシュ、レート制限                     |

### 認証・ユーザー管理

| 層     | 技術                 | 役割                                     |
| ------ | -------------------- | ---------------------------------------- |
| Auth   | Better Auth (1.6.x)  | OSS認証ライブラリ                        |
| Method | Magic Link           | パスワードレス（個人向け、企業向け共通） |
| Method | Google OAuth         | ソーシャルログイン                       |
| Method | GitHub OAuth         | エンジニア向け                           |
| Method | SSO (SAML/OIDC)      | エンタープライズ企業向け                 |
| Method | ID/Password          | 一部の企業要件で必要                     |
| Email  | Resend + React Email | メール配信・テンプレート                 |

### マルチテナント

| 層             | 技術                  | 役割                                         |
| -------------- | --------------------- | -------------------------------------------- |
| Workspace      | bz.bulr.net/{slug}/\* | URL ベースのワークスペース分離               |
| Authorization  | Workspace × Role      | RBAC（owner / admin / member / interviewer） |
| Data Isolation | workspace_id スコープ | 全テーブルに workspace_id を持つ             |

### 国際化

| 層          | 技術        | 役割                                              |
| ----------- | ----------- | ------------------------------------------------- |
| i18n        | next-intl 4 | App Router 対応                                   |
| Translation | JSON        | 日本語・英語（Phase 2）、その他言語は需要に応じて |

### インフラ

| 層      | 技術                            | 役割                         |
| ------- | ------------------------------- | ---------------------------- |
| Hosting | Vercel (Pro)                    | フロント + API ホスティング  |
| Storage | Cloudflare R2                   | CV、ポートフォリオ、画像配信 |
| CDN     | Vercel Edge Network             | 静的アセット配信             |
| Domain  | bulr.net (Cloudflare Registrar) | 本番ドメイン                 |

### 監視・分析

| 層                | 技術             | 役割                                  |
| ----------------- | ---------------- | ------------------------------------- |
| Web Analytics     | Vercel Analytics | パフォーマンス計測                    |
| Product Analytics | PostHog          | イベント・ファネル分析                |
| Error Tracking    | Sentry           | フロント+バック エラー                |
| LLM Monitoring    | Helicone         | LLMコスト・レイテンシ・プロンプト履歴 |
| Uptime            | BetterStack      | 死活監視                              |

## モノレポ構成

### ディレクトリ構造

```
bulr/
├── apps/
│   ├── web/                        # 個人向け（受験者）
│   │   ├── app/
│   │   │   ├── (marketing)/        # LP, About, FAQ
│   │   │   ├── (assessment)/       # 問診関連
│   │   │   │   ├── assessments/
│   │   │   │   └── results/
│   │   │   ├── my/                 # マイページ（要認証）
│   │   │   │   ├── profile/
│   │   │   │   ├── history/
│   │   │   │   ├── insights/
│   │   │   │   └── settings/
│   │   │   ├── api/
│   │   │   ├── [locale]/           # i18n routing
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   ├── lib/
│   │   └── package.json
│   │
│   ├── business/                   # 企業向け（採用担当）
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/
│   │   │   │   └── signup/
│   │   │   ├── [workspaceSlug]/    # ワークスペース別
│   │   │   │   ├── dashboard/
│   │   │   │   ├── jobs/
│   │   │   │   ├── candidates/
│   │   │   │   ├── applications/
│   │   │   │   ├── interviews/
│   │   │   │   ├── teams/          # ヒートマップ・パーティ編成
│   │   │   │   └── settings/
│   │   │   └── api/
│   │   ├── components/
│   │   └── package.json
│   │
│   └── admin/                      # 運営管理者向け
│       ├── app/
│       │   ├── (admin)/
│       │   │   ├── patterns/       # 問診パターン管理
│       │   │   ├── workspaces/     # ワークスペース管理
│       │   │   ├── users/          # ユーザー管理
│       │   │   ├── analytics/      # サービス全体の分析
│       │   │   └── ai-monitoring/  # LLM コスト監視
│       │   └── sign-in/
│       └── package.json
│
├── packages/
│   ├── db/                         # Drizzle schema + queries
│   ├── auth/                       # Better Auth config
│   ├── ui/                         # 共通UIコンポーネント
│   ├── types/                      # 共通型定義
│   ├── lib/                        # 共通ユーティリティ
│   ├── ai/                         # AIツール、プロンプト、評価ロジック
│   ├── i18n/                       # 翻訳ファイル
│   ├── analytics/                  # PostHog ラッパー
│   └── notifications/              # メール送信、テンプレート
│
├── docs/
│   ├── specs/                      # 仕様ドキュメント
│   └── interview-patterns/         # 問診パターン集
│
├── scripts/                        # 開発スクリプト
│
├── .github/workflows/              # CI/CD
│
├── .claude/                        # Claude Code 設定
│
├── package.json                    # ルート
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.json
```

### モノレポツール

- **Turborepo**: ビルドキャッシュ、タスク並列実行、Remote Cache
- **pnpm workspaces**: パッケージ管理

### デプロイ構成

```
Vercel プロジェクト1: bulr-web
  - Root Directory: apps/web
  - Domain: bulr.net

Vercel プロジェクト2: bulr-business
  - Root Directory: apps/business
  - Domain: bz.bulr.net

Vercel プロジェクト3: bulr-admin
  - Root Directory: apps/admin
  - Domain: admin.bulr.net

3プロジェクトとも同じ Git リポジトリを参照
Turborepo Remote Cache でビルド時間最適化
```

## URL設計

### 本番

```
個人向け（bulr.net）:
  https://bulr.net                       LP（日本語）
  https://bulr.net/en                    LP（英語）
  https://bulr.net/assessments           問診一覧
  https://bulr.net/assessments/[id]      問診進行中
  https://bulr.net/results/[id]          結果（自分の）
  https://bulr.net/my/history            受験履歴
  https://bulr.net/my/insights           キャリアインサイト

企業向け（bz.bulr.net）:
  https://bz.bulr.net/login              ログイン
  https://bz.bulr.net/signup             ワークスペース作成
  https://bz.bulr.net/{slug}/dashboard   ワークスペースダッシュボード
  https://bz.bulr.net/{slug}/jobs        求人一覧
  https://bz.bulr.net/{slug}/jobs/[id]   求人詳細・応募者
  https://bz.bulr.net/{slug}/candidates/[id]  候補者詳細・ヒートマップ
  https://bz.bulr.net/{slug}/teams       現有メンバーヒートマップ・パーティ編成
  https://bz.bulr.net/{slug}/interviews/[id]  面接アシスタント
  https://bz.bulr.net/{slug}/settings/members  メンバー管理

管理者向け（admin.bulr.net）:
  https://admin.bulr.net/patterns        問診パターン管理
  https://admin.bulr.net/workspaces      ワークスペース一覧
  https://admin.bulr.net/users           ユーザー一覧
  https://admin.bulr.net/analytics       サービス全体分析
```

### 開発・プレビュー

```
開発:
  http://localhost:3000               apps/web
  http://localhost:3001               apps/business
  http://localhost:3002               apps/admin

ステージング:
  https://staging.bulr.net
  https://staging-bz.bulr.net
  https://staging-admin.bulr.net
```

## AI 問診アーキテクチャ

### 設計原則

1. **対話型で4段階の深掘りをする**
   - 経験有無 → 真贋確認 → 判断力 → メタ認知
   - LLM が文脈に応じて深掘り質問を生成

2. **構造化された問診パターンに基づく**
   - 状況パターン40-60件以上（職種ごと）
   - 広さ × 深さ × 意思決定の射程の軸で網羅

3. **LLMにツール経由でしか書かせない**
   - Tool Use を強制し、構造化データとして保存
   - ハルシネーション防止

4. **ストリーミングで応答**
   - SSE で文字単位ストリーム
   - Vercel AI SDK でラップ

5. **回答の評価は二重で行う**
   - LLM による自動評価
   - 創業者・パートナーによる手動評価
   - 両者の相関を継続的にモニタリング

### 使用しないもの

- ❌ LangChain / LangGraph: Vercel AI SDK で十分
- ❌ MCP サーバー: 自社プロダクトには不要
- ❌ 独自ベクトルDB: pgvector で完結

### LLMツール (Tools)

```typescript
// 問診中に使うツール
const interviewTools = {
  selectNextPattern, // 次に質問する状況パターンを選択
  recordAnswer, // 回答を構造化保存
  evaluateAnswer, // 回答の深さを評価（4段階）
  generateFollowUp, // 深掘り質問を生成
  finalizeSession, // 問診完了処理
};

// レポート生成時に使うツール
const reportTools = {
  generateHeatmap, // スキルヒートマップ生成
  matchToJobRequirement, // 求人要件とのマッチング
  suggestGrowthAreas, // 成長領域の提案
  identifyPartyFit, // パーティ編成適性判定
  generateInterviewerNotes, // 面接時の確認ポイント生成
};

// パーティ編成時に使うツール
const partyTools = {
  analyzeCurrentTeam, // 現有チームの分析
  identifyGaps, // 不足役割の特定
  recommendCandidates, // 候補者の推薦
  simulateTeamComposition, // チーム編成シミュレーション
};
```

### システムプロンプト構造

```
1. ロール定義（経験豊富な技術面接官）
2. 問診の進め方（4段階の深掘り構造）
3. 評価軸（広さ × 深さ × 意思決定の射程）
4. ツール使用ルール
5. 受験者への態度（プレッシャーを与えず、経験を引き出す）
6. スコープ境界（技術判断の評価のみ、人物評価はしない）
7. 出力スタイル（一度に一つの質問、自然な対話）
8. 受験者固有のコンテキスト（プロフィール、選択した職種）
9. 進行状況の認識（残り時間、カバーすべきパターン数）
```

### 会話メモリ管理

```
短期記憶（会話履歴）:
  - useChat hook の messages 配列
  - 直近20-30ターンを API に送る

中期記憶（セッション内の事実）:
  - assessment_session.context_facts (JSONB)
  - 例：「メインの言語はGo」「直近2年は決済系」など
  - 問診の進行に応じて updateSessionContext ツールで AI が更新

長期記憶（過去の問診結果）:
  - 同一ユーザーの過去セッションを参照可能
  - 再受験時に「前回はここまでだったが、今回は伸びている」を検出
```

## ヒートマップ・レポート設計

### 候補者向けレポート

目的：自己理解＋成長ガイド

#### 構成

- 現在のレベル（文章で表現、数値スコアなし）
- あなたの強み Top3
- 今後6〜12ヶ月で伸ばすと良いポイント（最大3つ）
- 次のステップ（具体的アクション3ステップ）
- 相性が良さそうな環境タイプ
- 将来的なチャレンジ先
- 最後の一言メッセージ

#### 制約

- 数値スコア・点数は表示しない
- 他人との比較（偏差値・順位）は出さない
- 企業名や「この会社に受かる」などは書かない

### 企業向けレポート

目的：書類選考・面接での意思決定支援

#### 構成

- ヘッダー（想定ロールレベル、一言サマリー、任せられる仕事レベル）
- スキルバランスマップ（カテゴリ別レベル 0-4）
- 求人とのマッチ情報（必須スキルカバー率、要素別マッチ）
- 任せられる仕事の範囲（今すぐ / フォロー付き / 将来）
- マッチしやすい会社・案件タイプ
- 面接で聞くと良いフォロー質問例

### ヒートマップの軸

```
広さ軸:
  - システム種別（BtoC, BtoB SaaS, 業務系, 決済, 組み込み, データ基盤など）
  - 規模（トラフィック、データ）
  - フェーズ（0→1, 1→10, 10→100, レガシー再生）
  - 職能横断（企画、デザイン、ビジネス、データ）

深さ軸:
  - 設計判断（アーキ、DB、API、責務分離）
  - トラブル対応（障害、性能、セキュリティ、データ破損）
  - 負債との対峙（リファクタ、リプレイス、レガシー保守）
  - 組織判断（採用、評価、技術文化、プロセス）
  - AI活用判断

意思決定の射程:
  - タスク → 機能 → プロダクト → 事業 → 組織
```

## パーティ編成アーキテクチャ（Stage 3 以降）

### 設計原則

1. **クエスト × パーティの視点**
   - 事業フェーズに応じて必要な役割構成が変わる
   - 「新規事業0→1」「レガシー再生」「スケール期」などで必要な能力プロファイルが異なる

2. **現有メンバーのヒートマップ集約**
   - 企業内メンバーが bulr 問診を受けることで、組織全体のヒートマップが可視化

3. **ギャップ分析と推薦**
   - 必要な役割と現有メンバーのヒートマップを比較
   - 不足役割を埋める候補者を推薦

### データフロー

```
1. 企業がクエスト（プロジェクト目標）を定義
   - フェーズ、必要な役割、規模、期間
2. システムが必要なパーティ構成を提案
3. 現有メンバーのヒートマップとマッチング
4. ギャップを特定
5. 候補者プールから不足役割を埋める候補を推薦
```

## マルチテナントモデル

### 認可の基本ルール

- `{workspaceSlug}` から Workspace を特定
- JWT の `workspace_id` と一致することを確認
- `workspace_user.role` により操作権限を制御
- クライアントから `workspace_id` を直接渡さず、常にサーバー側で解決

### 役割（Role）

```
owner       ワークスペースの所有者、課金管理を含む全権限
admin       メンバー管理、設定変更を含む大半の権限
recruiter   求人管理、応募管理、候補者閲覧
interviewer 面接担当、自分が担当する候補者の閲覧
viewer      閲覧のみ
```

### データ分離

全テーブルに `workspace_id` を持たせ、クエリ時に必ず workspace_id でスコープする。Row Level Security (RLS) を Postgres で設定する選択肢も検討。

## セキュリティ方針

### 認証セキュリティ

- HttpOnly + Secure + SameSite=Lax cookies
- CSRF トークン (POST/PUT/DELETE)
- Magic Link は使い切り、有効期限15分
- proxy.ts (Next.js 16 で middleware.ts から rename) だけに依存しない多層防御
- セッション固定攻撃対策（ログイン時にセッション再生成）

### データセキュリティ

- 全 DB アクセスはサーバーサイドのみ
- ユーザーデータは user_id / workspace_id でスコープ
- 個人情報の最小化
- 候補者の問診結果は本人と、本人が応募した企業のみ閲覧可能
- GDPR / 個人情報保護法対応（データ削除リクエストの仕組み）

### LLM セキュリティ

- システムプロンプトの保護（ユーザー入力でオーバーライド不可）
- プロンプトインジェクション対策
- レート制限（受験者: 1日2セッション、API: 1分20リクエスト）
- ツール呼び出し回数上限（maxSteps: 10）
- 問診回答に PII が含まれた場合の検出と警告

### 通信セキュリティ

- HTTPS 強制（Vercel デフォルト）
- CSP (Content Security Policy) 設定
- CORS は許可ドメインのみ（bulr.net, bz.bulr.net）

## コスト構造（Stage 2 以降の試算）

### Stage 2（成長期）月額試算

```
Vercel Pro:                 $20
Neon Launch Plan:           $19
Resend Pro:                 $20
Cloudflare R2:              $5-10
PostHog:                    $0-50（イベント数次第）
Sentry:                     $26
Helicone:                   $50
BetterStack:                $0-29
Anthropic Claude API:       $500-2,000（受験者数次第）
Domain:                     $1.5
─────────────────────────────────────
合計:                       約 $640-2,200/月（10-30万円）
```

### Stage 3（拡大期）月額試算

```
Vercel Enterprise:          $400+
Neon Scale Plan:            $69+
LLM API:                    $5,000-20,000
その他:                     $200+
─────────────────────────────────────
合計:                       約 $5,700-20,700/月
```

## 環境変数

### 共通

```
DATABASE_URL=                     # Neon Postgres
BETTER_AUTH_SECRET=               # Auth 暗号化キー
BETTER_AUTH_URL=                  # 認証コールバックURL
RESEND_API_KEY=                   # メール配信
NEXT_PUBLIC_APP_URL=              # アプリのベースURL
ANTHROPIC_API_KEY=                # Claude API
HELICONE_API_KEY=                 # LLM監視
SENTRY_DSN=                       # エラー監視
NEXT_PUBLIC_POSTHOG_KEY=          # 分析
NEXT_PUBLIC_POSTHOG_HOST=
CLOUDFLARE_R2_ACCESS_KEY=         # ファイルストレージ
CLOUDFLARE_R2_SECRET_KEY=
CLOUDFLARE_R2_BUCKET=
```

### apps/web 固有

```
NEXT_PUBLIC_BUSINESS_URL=         # 企業向けへのリンク
```

### apps/business 固有

```
GOOGLE_OAUTH_CLIENT_ID=           # Google SSO
GOOGLE_OAUTH_CLIENT_SECRET=
SAML_CERT=                        # SAML SSO（エンタープライズ）
```

### apps/admin 固有

```
ADMIN_ALLOWED_EMAILS=             # 管理者メール許可リスト (CSV)
```

## デプロイフロー

```
1. ローカル開発
   $ pnpm dev (Turbo: web + business + admin 並列起動)

2. Pull Request
   → Vercel が自動でプレビュー環境を作成（3つ）
   → CI で型チェック・lint・テスト実行

3. main にマージ
   → 本番デプロイ自動実行（3プロジェクト並列）
   → Sentry にデプロイ通知

4. 本番モニタリング
   → Vercel Analytics
   → Sentry エラー監視
   → Helicone LLMコスト監視
   → BetterStack 死活監視
```

## 開発体験 (DX)

### 推奨開発環境

- Node.js 22 LTS or 24 LTS
- pnpm 10+
- VS Code (with extensions: ESLint, Prettier, Tailwind, Drizzle)
- Claude Code

### コーディング規約

- TypeScript strict mode
- ESLint + Prettier
- Conventional Commits (feat:, fix:, etc.)
- ファイル名は kebab-case
- コンポーネントは PascalCase
- 関数・変数は camelCase
- テスト：Vitest（ユニット）、Playwright（E2E）

### Stage 2 で導入する CI/CD

- 型チェック
- Lint
- ユニットテスト
- E2E テスト（重要パスのみ）
- Drizzle マイグレーションのドライラン
- Lighthouse パフォーマンス計測

## ロードマップとの対応

### Stage 1（Month 1-3）：MVP 検証

→ `01-architecture-mvp.md` に記載

### Stage 2（Month 4-12）：本格立ち上げ

- apps/admin の分離
- 監視・分析の本格導入（Sentry, PostHog, Helicone）
- Cloudflare R2 導入
- i18n 導入（日英）
- 追加職種（フロントエンド、SRE/インフラ、PdM）
- 最初の有料企業顧客（5-20社）

### Stage 3（Year 2）：マルチテナント本格化

- apps/business の分離（bz.bulr.net）
- ワークスペース機能、求人管理、応募管理
- ヒートマップ可視化の完成
- 業務委託マッチング
- API 公開（他サービスへの組み込み）

### Stage 4（Year 3-5）：パーティ編成 & 標準化

- 現有メンバーのヒートマップ集約
- パーティ編成シミュレーション
- 「bulr スコア」の業界標準化
- アトラクト・リテンション支援
- 人材流動性インフラへ

## 重要な原則

### Stage 1 では絶対にやらないこと（再掲）

- ❌ apps/admin の分離（同一アプリ内で十分）
- ❌ apps/business（マルチテナント不要）
- ❌ Better Auth の高度な機能（マジックリンクのみ）
- ❌ ヒートマップ可視化 UI
- ❌ パーティ編成シミュレーション
- ❌ pgvector
- ❌ 監視・分析ツール各種

### Stage 1 から Stage 2 への移行判断

3ヶ月後の検証結果次第。以下が揃った時点で Stage 2 に進む。

- ✅ 問診の妥当性が確認できた（受験結果と既知の実力の相関）
- ✅ 受験者の完走率が一定以上（70%目安）
- ✅ パートナー企業3社以上が「使い続けたい」と表明
- ✅ 創業者自身が継続意欲を持っている
