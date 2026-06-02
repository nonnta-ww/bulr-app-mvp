# Brief: admin-operations

## Problem
運営者（admin / 創業者）は、候補者・企業データの可視化と管理、マスタ（skill_survey / assessment_pattern）設定、LLM コスト監視の手段を持たない。マスタはシードスクリプト経由でしか投入できず、運営は UI から編集・トラブルシュート・コスト暴走防止ができない。bulr が MVP からスケールするにつれ運営機能の欠如がボトルネックになる。

## Current State
- `apps/admin`（admin.bulr.net）は Wave 1（`monorepo-app-split`）でシェルとして作成され、`admin-review-panel` の成果（BtoB セッション一覧・詳細・手動評価入力・LLM 評価突合・CSV/JSON エクスポート）が移設済み。
- `requireAdmin`（`ADMIN_ALLOWED_EMAILS` 許可メール検査）ガードは整備済み。
- **欠如**: マスタ CMS、候補者/企業の管理 UI、LLM コスト監視、クォータ可視化。`session-from-entry` で admin セッション一覧/詳細は entry 対応済みだが、それ以外の運営機能は未着手。

## Desired Outcome
運営者が admin.bulr.net にログインし、(1) 候補者プロフィールの一覧/検索/閲覧/無効化/クォータリセット、(2) 企業の一覧/検索/閲覧/無効化/**新規作成**、(3) `skill_survey` 設問・選択肢の編集（CMS）、(4) `assessment_pattern` の閲覧、(5) LLM コスト（候補者別・パターン別・モデル別・日次トレンド）と模擬面接クォータ使用状況の監視——を行える。

## Approach
`apps/admin/app/` に運営タブ（companies / candidates / masters / monitoring）を追加。重いデータ取得は `packages/db/src/queries/admin/` の Server Component クエリ、変更系は Server Action。認可は既存 `requireAdmin` を踏襲。無効化はハードデリートではなく `is_active` ソフトフラグ。LLM コストは各 spec が API 呼び出し時点で推定記録した値を admin クエリが集計（Anthropic 課金 API は使わない）。

## Scope
- **In**:
  - **候補者タブ**: `/candidates`（一覧/検索/ページング、クォータ残・skill-survey 完了状況表示）、`/candidates/[id]`（詳細：履歴書・アンケート・模擬面接履歴）、Server Action `resetCandidateQuota` / `disableCandidateProfile`（is_active）
  - **企業タブ**: `/companies`（一覧/検索）、`/companies/[id]`（詳細：opening・所属ユーザー）、Server Action `disableCompany`（is_active）+ **`createCompany`（admin から企業レコード新規作成）**
  - **マスタ CMS**: `/masters/skill-survey/[surveyId]`（カテゴリ→設問→選択肢のツリー表示 + **編集 UI**）、Server Action `updateSkillSurveyQuestion` 等。`/masters/assessment-pattern`（**閲覧のみ**：57 パターン内容の参照ビュー）
  - **監視タブ**: `/monitoring`（LLM コストダッシュボード：合計・モデル別・機能別[mock-interview / interview]・候補者別 top・日次トレンド）、`/monitoring/quota`（候補者別クォータ使用状況）
  - `packages/db/src/queries/admin/`：`getCandidatesForAdmin` / `getCandidateProfileDetail` / `getCompaniesForAdmin` / `getCompanyDetail` / `getSkillSurveyMaster` / `getLlmCostMetrics` / `getCandidateQuotaUsage`
- **Out**:
  - `assessment_pattern` の**編集**（MVP は閲覧のみ。パターン authoring は Wave 5 の別 spec に defer）
  - 新規マスタ**テーブル作成**（既存 `skill_survey` / `assessment_pattern` への read+write のみ）
  - 運営者の self-signup（`ADMIN_ALLOWED_EMAILS` 手動追加を継続）
  - 面接セッションの削除（閲覧は `admin-review-panel`、削除はしない）
  - ハードデリート、監査ログ（誰がいつ何を変更したか）、大規模データエクスポート、予測/異常検知 ML、マルチテナント RBAC、複雑なクォータポリシー（per-pattern/per-model）
  - クォータの**enforcement 本体**（→ mock-interview が所有。admin はリセット・可視化のみ）

## Boundary Candidates
- 候補者管理（一覧/詳細クエリ + 無効化/クォータリセット Action）
- 企業管理（一覧/詳細クエリ + 無効化/**新規作成** Action）
- skill_survey CMS（マスタツリー取得 + 設問/選択肢編集 Action）
- assessment_pattern 閲覧ビュー（読み取りのみ）
- LLM コスト/クォータ監視（集計クエリ + ダッシュボード UI）

## Out of Boundary
- BtoB 面接エンジン（`assessment-engine`）・entry/セッション作成ロジック（`entry-flow` / `session-from-entry`）には触れない（読み取りのみ）
- mock-interview のクォータ enforcement・セッション実行ロジック（mock-interview が所有。admin は監視/リセットのみ）
- `admin-review-panel` の既存セッション検証 UI（維持・重複させない、タブ追加で拡張）

## Upstream / Downstream
- **Upstream**: `candidate-auth-onboarding`（`candidate_profile`）、`resume-registration`（`resume_document`）、`skill-survey`（マスタ + 回答、編集対象）、`assessment-pattern-seed`（`assessment_pattern`、閲覧対象）、`company-and-opening`（`company` / `opening`）、`entry-flow`（`entry` 活動の参照）、`mock-interview`（`mock_interview` のコスト/クォータを監視）、`packages/db`、既存 `requireAdmin`
- **Downstream**: Wave 5+ pattern-authoring（パターン編集 CMS）、分析ダッシュボード強化、マルチテナント RBAC（per-company admin）

## Existing Spec Touchpoints
- **Extends**: `admin-review-panel`（セッション検証 UI は維持しつつ candidates/companies/masters/monitoring タブを追加）、`apps/admin` シェル（`monorepo-app-split` 作成のシェルにルート追加）
- **Adjacent**: `assessment-engine` / `entry-flow` / `session-from-entry`（読み取りのみ・ロジック不変）、`mock-interview`（同 Wave だが別所有。`mock_interview` スキーマを参照する＝共有シーム、cross-spec で整合確認）

## Constraints
- Next.js 16、Server Component（重いクエリ）+ Server Action（変更系）、Drizzle で集計
- MVP 最小：基本 CRUD 相当。設問の drag-drop 並べ替え・パターンのバージョン管理・監査ログは持たない
- 無効化はソフト（`is_active` boolean、ハードデリートしない）
- LLM コストは呼び出し時点の**推定値**（各 spec が記録）を集計。Anthropic 課金 API は使わない
- データオーナーシップ：admin は全データへの god-mode 読み取り。変更はソフト
- **shared seam**: `mock_interview` スキーマは mock-interview が権威定義、admin-operations が監視のため参照（mock-interview を先に確定させる依存）
- `apps/* → packages/*` 単方向依存、`tech.md` / `security.md` / `structure.md` 準拠
