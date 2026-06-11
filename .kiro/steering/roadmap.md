# Roadmap

> 本ファイルは Kiro spec 依存関係トラッキング用のロードマップ。プロダクト全体のロードマップは `product.md` を参照。
> このファイルは `/kiro-spec-batch` が読む dependency-order list として機能する。
>
> **更新 2026-05-23**: Stage 1 MVP（7 spec）完了。Stage 2 再設計（候補者/企業/運営の3アプリ化）を追加。Stage 2 の詳細設計は `docs/superpowers/specs/2026-05-23-bulr-candidate-business-split-design.md` を参照。

## Overview

bulr は2フェーズで進行する。

- **Stage 1 MVP（実装済み）** — 面接アシスタント型で実務判断力を可視化するシステムを 0 から構築。単一アプリ `apps/web`（面接官UI＋管理画面同居）。
- **Stage 2 再設計（進行中）** — 候補者向け bulr（bulr.net）・企業向け bulr business（bz.bulr.net）・運営（admin.bulr.net）の3アプリに分割。候補者側を「履歴書＋スキルアンケートでエントリーし、自己診断・模擬面接で単独価値を持つプロダクト」に再定義。既存モノレポを拡張する（全体はまだ MVP の認識）。

## Stage 2 再設計 Specs（dependency order）

`/kiro-spec-batch` はこの節を dependency-order list として読む。各 spec の詳細仕様は上記の設計メモを参照。

### Wave 1 — 基盤分割

- [x] monorepo-app-split — `apps/web`→`apps/business` リネーム、`apps/candidate` スケルトン作成、`apps/admin` シェル作成＋既存検証パネル（admin-review-panel の成果）の移設、`packages/auth`＋`packages/ui` 切り出し、turbo/pnpm 設定更新。ゴール: 3アプリが build/typecheck/lint 通過。Dependencies: none（Stage 1 完了が前提）
- [x] multi-app-deployment — Vercel 3プロジェクト化、ドメイン（bulr.net / bz.bulr.net / admin.bulr.net）、`.env` 分割、Preview 自動デプロイ。Dependencies: monorepo-app-split

### Wave 2 — 候補者プロダクト基盤

- [x] candidate-auth-onboarding — 候補者 Magic Link、`candidate_profile` テーブル、招待リンク受け取り動線。**追加スコープ (2026-05-25)**: `packages/auth` を singleton から factory (`createAuth({ sendMagicLink })`) に refactor し、Magic Link メールテンプレートをアプリごとに分離（candidate / business / admin がそれぞれ自分の `lib/magic-link-template.ts` を所有）。背景: Wave 1 monorepo-app-split 完了時点で 3アプリすべてが共有 template を使っており、候補者にも business 向けコピー「bulr — AI 面接アシスタント」が届く。Dependencies: monorepo-app-split
- [x] resume-registration — `resume_document` テーブル、履歴書・職務経歴書・CV・レジュメのアップロード・管理（Vercel Blob）。Dependencies: candidate-auth-onboarding
- [x] skill-survey — `skill_survey` マスタ（職種別・`docs/backend-skills.csv` をシード素材に）＋`skill_survey_response`＋静的構造化フォーム UI＋L1 棚卸し結果表示。Dependencies: candidate-auth-onboarding

### Wave 3 — エントリー連携

- [x] company-and-opening — `company` エンティティ、`opening`（募集）、`invitation` 発行（企業側 UI）。Dependencies: monorepo-app-split
- [x] entry-flow — `entry` エンティティ、候補者のエントリー完了フロー、企業側エントリー一覧（履歴書＋アンケート確認）。Dependencies: company-and-opening, resume-registration, skill-survey
- [x] session-from-entry — 面接セッション作成を `entry` から引き継ぐよう assessment-engine を改修（候補者情報の手入力を廃止）＋スキルアンケート結果からのパターン選定支援。Dependencies: entry-flow

### Wave 4 — 候補者 engagement hook ＋ 運営機能

- [x] mock-interview — L4 AI 模擬面接。`mock_interview` テーブル、`packages/ai/mock` の候補者向け関数（面接官役＋形成的フィードバック）、テキストチャット UI、LLM クォータ。Dependencies: candidate-auth-onboarding, skill-survey
- [x] admin-operations — `apps/admin` の機能拡張：企業管理（閲覧/無効化/新規作成）・候補者管理（閲覧/無効化/クォータリセット）・skill_survey CMS（編集）＋ assessment_pattern 閲覧・LLM コスト/クォータ監視。Dependencies: company-and-opening, skill-survey, mock-interview

### Wave 5 — 候補者 自己分析（self-diagnosis 中核）

候補者プロダクトの中核「自己診断」を実装する Wave。skill-survey 回答を入力に、強み・弱みの可視化＋自然言語サマリ＋成長アクション提案を返す。並走で skill-survey の回答 UX 洗練（既存 spec 拡張、`## Existing Spec Updates` 参照）を行う。

- [x] candidate-self-analysis — skill-survey 回答をもとに候補者の強み・弱みを可視化し、自然言語サマリ＋成長アクション提案を返す自己分析機能。集計は決定論的（構造化）、要約・成長アクションは LLM（ハイブリッド）。入力は skill-survey 回答のみ（mock-interview は含めない）。数値スコア・他者比較は出さない。Dependencies: skill-survey, candidate-auth-onboarding

### Wave 7 — B2B コア回帰（リアルタイム面接キャプチャ）

競合（BrightHire / Metaview）比較で判明したキャプチャ層のギャップ解消。面接中の面接官操作をゼロにし、Stage 1 検証（実面接利用）を可能にする。

> Wave 7 着手前の MVP は tag `v0-mvp` / branch `legacy/mvp-v0` として保存（フォークはしない）。経緯と方針は `docs/superpowers/specs/2026-06-11-wave7-inplace-evolution-and-mvp-snapshot.md` を参照。

- [ ] realtime-interview-capture — ミーティングボット（Zoom / Meet / Teams 自動参加、対面はブラウザ連続録音）＋リアルタイム文字起こし・話者分離＋操作不要サイドパネル（カバレッジ進捗＋質問候補 3 件の自動更新）。状態A/B ターン録音 UI を廃止し、評価パイプライン（5次元・pattern_coverage・session_report）の入力をライブトランスクリプトに差し替える。Dependencies: session-from-entry

### Wave 6+ — Later（保留・spec 化は時期到来時に判断）

スカウト層（候補者プール検索＋企業のスカウト課金）／L3 年収査定（bulr 自身のデータ蓄積後）／マッチング／模擬面接の音声対応／マルチテナント本格化。

## Existing Spec Updates

> Wave 5 と並走する既存 spec の拡張。新規 spec ではないため `/kiro-spec-batch` の波形実行対象には含めず、`/kiro-spec-requirements {feature}` で既存 spec を更新する。

- [x] skill-survey — アンケート回答 UX の洗練：多段ステップ/進捗表示、選択肢レンダリングの改善、入力検証の強化、L1 結果表示のビジュアル向上。新テーブルは追加せず、既存の回答フォーム/結果 UI（`apps/candidate/app/skill-survey/*`）を改善する。`candidate-self-analysis` の入力となる回答スキーマ/読み出し query は変更しない（変える場合は candidate-self-analysis の再検証が必要）。Dependencies: none（既存 skill-survey 拡張）。**実装完了 2026-06-06**: 要件8〜12、`is_required` 加算列（migration 0013）＋必須9問 seed＋カテゴリ名単位ウィザード＋サーバ必須検証＋結果ビジュアル＋自己診断導線。検証: typecheck 11/11・build 5/5・boot smoke（routes 307→sign-in）・共有ロジック実データスモーク。回答スキーマ/読み出し query 不変（is_required 加算のみ）。

## Stage 2 の制約・方針

- 既存モノレポ（`bulr-app-mvp`）を拡張。候補者側を含め全体がまだ MVP の認識。「将来像は見据えるが実装は最小」。本格マルチテナント／本番スケール対応は後回し。
- Wave 3 と Wave 4 はどちらも Wave 2 のみに依存し並列可能。推奨順は Wave 3（エントリー連携）→ Wave 4。優先順位の選択で入れ替え可。
- マスタ（skill_survey / assessment_pattern）は admin CMS を待たずシードスクリプトで投入できる。
- 収益モデル: コア＝企業向け SaaS（席数課金）→ 企業向けスカウト課金。エージェント成功報酬はコアから外す。C 直接課金は賭けない。
- データオーナーシップ2層: 候補者プロフィール・履歴書・アンケート・模擬面接＝候補者所有／エントリー・面接セッション・本番面接データ＝企業側。
- `tech.md` / `security.md` / `structure.md` 準拠。current-state の steering（単一アプリ前提の記述）は各 Wave 実装時に同期更新する。

## Stage 1 MVP Specs（実装済み）

依存順。すべて実装完了（`apps/web` 単一アプリ）。

- [x] monorepo-foundation — Turborepo + pnpm + Next.js 16 + apps/web + packages/{db,types,lib,ai} の最小骨組み
- [x] multi-env-infrastructure — Vercel + Neon dev/prod ブランチ + Resend + Vercel Blob + Vercel Cron + .env.example
- [x] authentication — Better Auth Magic Link（面接官）+ ADMIN_ALLOWED_EMAILS 許可メール検査 + 多層認証ガード + user_profile
- [x] assessment-pattern-seed — assessment_pattern スキーマ + 57 パターン × 4 段階質問テンプレ + シードスクリプト
- [x] assessment-engine — 面接アシスタント中核。candidate / interview_session / question_proposal / interview_turn / pattern_coverage / session_report + 5 LLM 関数 + 状態A/B UI + 面接後レポート + 音声削除 Cron
- [x] interview-sse-progress — 面接ターン処理の SSE 進捗表示（Stage 1 完了後に追加）
- [x] admin-review-panel — apps/web/admin 配下のセッション一覧・詳細 + 手動評価入力 + LLM 評価突合 + CSV/JSON エクスポート

## Stage 1 詳細（参考・履歴）

> 以下は Stage 1 MVP 着手時の Approach / Scope / Boundary。Stage 1 は完了済みのため履歴として残す。

### Approach Decision

- **Chosen**: Path D（multi-spec decomposition）— 基盤 → インフラ → 認証 → データ → 中核機能 → 管理画面 の 6 spec で水平分割
- **Why**:
  - greenfield のため全領域が新規。各 spec の境界が明確（基盤 / インフラ / 認証 / データ / 面接エンジン / 管理画面）
  - 依存関係が線形に近く（DAG が単純）、`/kiro-spec-batch` の波形並列実行に適する
  - 各 spec は 5〜35 タスク程度に収まる規模感で、レビューゲートを挟みやすい
  - v1 の spec 構成（同一 6 spec）の境界をそのまま流用、内容のみを v2 用に書き直す
- **Rejected alternatives**:
  - **5 spec に統合（assessment-pattern-seed を assessment-engine に内包）**: シードと面接エンジンは関心が異なり、シード変更時に engine spec の review が巻き込まれる
  - **7 spec に分割（admin を answer-storage-schema + review-ui に分割）**: Stage 1 の管理画面は最小機能で 5〜8 タスク規模、分割するとタスク不平衡
  - **vertical slice（最初に end-to-end の 1 ターンだけ動かす spec）**: greenfield かつ全パッケージ未作成のため、horizontal layer の方が依存関係明示と並列レビューに適する

### Boundary Strategy

- **Why this split**:
  - `monorepo-foundation` は **モノレポ初期化** のみが関心
  - `multi-env-infrastructure` は **デプロイ環境** のみが関心
  - `authentication` は **誰がアクセスできるか** のみが関心
  - `assessment-pattern-seed` は **問診の素材投入** のみが関心
  - `assessment-engine` は **面接アシスタント型の中核機能** が関心
  - `admin-review-panel` は **創業者の検証作業支援** が関心
- **Shared seams（Stage 1）**: `interview_session` / `interview_turn` / `pattern_coverage` / `session_report` スキーマは `assessment-engine` が権威定義、`admin-review-panel` が参照。認証ヘルパー（requireUser / requireAdmin / requireSessionOwnership）は `authentication` が定義。
