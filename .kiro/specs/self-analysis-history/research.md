# Gap Analysis — self-analysis-history

> 既存コードベース（`candidate-self-analysis` / `skill-survey` 実装済み）に対し、回答・自己分析を版（バージョン）管理化し、履歴・成長推移・2版比較を加算するための実装ギャップ分析。design phase の意思決定材料。

## 1. 現状調査（Current State）

### 関連アセット

| 領域 | ファイル | 役割 |
|---|---|---|
| 回答提出 | `apps/candidate/app/skill-survey/[surveyId]/_actions/submit-survey.ts` | 回答 upsert + answer delete-reinsert（トランザクション） |
| 分析生成 | `apps/candidate/app/self-analysis/_actions/generate-self-analysis.ts` | 集計→LLM→upsert、`regenerateNarrative` も同居 |
| 集計（純関数） | `apps/candidate/app/self-analysis/_lib/aggregate.ts` | 決定論的 `AggregatedSnapshot` 生成 |
| 読み出し | `packages/db/src/queries/self-analysis/self-analysis-query.ts` | `getSelfAnalysis` / `upsertSelfAnalysis` / `checkRegenerationAllowed` / `updateNarrative` / `incrementRegenerationCount` |
| 読み出し補助 | `packages/db/src/queries/self-analysis/analysis-source-query.ts` | `getAnsweredSurveyForCandidate`（最新版を `ORDER BY submittedAt DESC LIMIT 1`）/ `getSurveyResponseForAnalysis` |
| スキーマ | `packages/db/src/schema/self-analysis.ts` / `skill-survey-response.ts` | 両者とも `UNIQUE(candidateProfileId, skillSurveyId)` |
| 表示 | `apps/candidate/app/self-analysis/_components/{self-analysis-view,coverage-bars,generate-button}.tsx` | Tailwind バーのみ（チャートライブラリ無し） |

### 規約・制約

- **DB マイグレーション**: `packages/db` に `drizzle-kit generate/migrate/push`。SQL は `packages/db/drizzle/`（最新 `0013_*.sql`）、journal は `drizzle/meta/_journal.json`。`drizzle.config.ts` は `schema: './src/schema/*.ts'`。
- **依存方向**: apps → packages の単方向（既存メモリ準拠）。クエリは `packages/db`、Server Action は `apps/candidate`。
- **relations() 未定義**: JOIN は明示記述スタイル。スキーマ変更は FK/インデックス中心で済む。
- **テスト基盤が存在しない**: ルート・`apps/candidate`・`packages/db` いずれも test スクリプト無し、`turbo.json` に test タスク無し、vitest/jest 設定無し、`*.test.ts` 無し。→ **自動テストでの受入検証手段が現状ゼロ**。

## 2. 要件→アセット対応マップ（gaps タグ付き）

| 要件 | 必要な技術要素 | 既存アセット | ギャップ |
|---|---|---|---|
| **R1 回答版の履歴保持** | 回答を追記型に。`submit` を upsert→insert、answer の delete-reinsert 撤廃 | `submit-survey.ts`（現 upsert）、`skill_survey_response`（現 UNIQUE） | **Constraint**: UNIQUE(candidate,survey) 撤廃が必要。撤廃により version 行が増える |
| **R2 再回答30日クールダウン** | (candidate,survey) の最新 `submittedAt` 取得＋30日判定＋UI拒否メッセージ（再開日提示） | `getAnsweredSurveyForCandidate`（候補者単位・survey 横断で最新を返す＝survey 指定不可） | **Missing**: survey 指定の「最新 submittedAt」クエリと cooldown 判定が無い |
| **R3 版ごとの自己分析保持／最新版表示** | 分析を版単位（`sourceResponseId`）保持。`getSelfAnalysis` を「最新回答版の分析」取得へ。`checkRegenerationAllowed` を版単位へ | `self_analysis`（現 UNIQUE(candidate,survey)）、`getSelfAnalysis`/`checkRegenerationAllowed`（いずれも (candidate,survey) で `LIMIT 1` 前提） | **Constraint(重要)**: 一意性前提のクエリが版複数化で破綻。UNIQUE を `sourceResponseId` へ変更し、両クエリを「最新版／指定版」へ書き換え必須 |
| **R4 成長推移可視化** | 履歴→時系列（全体・カテゴリ別網羅度）整形＋折れ線グラフ。viz_only 版も網羅度は表示。1件時は単点 | チャートライブラリ無し、`CoverageBars`（単一版） | **Missing**: 履歴取得クエリ・時系列整形（純関数）・recharts 導入・グラフ Client Component |
| **R5 2版比較** | 任意2版の網羅度差分＋強み/成長アクション新旧対比、片方 viz_only は差分のみ | `CoverageBars`/`NarrativeSection`（単一版表示） | **Missing**: 版選択 UI・差分計算・並置比較ビュー・`getSelfAnalysisByResponseId` |
| **R6 アクセス制御と所有** | 本人プロフィール限定、未認証はサインイン誘導 | `requireCandidate()`、各クエリの `candidateProfileId` フィルタ | **既存流用可**（履歴/比較クエリにも同フィルタを徹底） |
| **R7 既存データ移行・非破壊互換** | 既存1件を版1として保持、既存表示/生成/再生成/陳腐化の挙動維持 | 既存 upsert データ、`page.tsx` 流路 | **Constraint**: インデックス入替マイグレーションが必要。既存行は安全に版1へ（下記参照） |

### マイグレーション安全性（R7）

- 既存 `skill_survey_response` は (candidate,survey) で一意 → UNIQUE 撤廃後も各行がそのまま「版1」。データ損失なし。
- 既存 `self_analysis` も (candidate,survey) で一意、かつ各行は `sourceResponseId` を保持済み → 新 UNIQUE(`sourceResponseId`) は既存行で必ず成立（1 response = 1 分析）。安全。
- 必要マイグレーション: `self_analysis_candidate_survey_idx` を drop → `UNIQUE(source_response_id)` を add、`skill_survey_response_candidate_survey_idx` を drop。`drizzle-kit generate` で生成可能。

## 3. 実装アプローチ選択肢

### Option A: 既存テーブルを追記型化（新テーブルを作らない）★推奨

既存 `skill_survey_response` / `self_analysis` の UNIQUE 制約を外し／付け替え、行を増やすことで版管理する。`self_analysis` は既に `sourceResponseId`/`sourceSubmittedAt` を持つため、版の紐付けは既存カラムで成立。

- **拡張対象**: 上記2スキーマ、`submit-survey.ts`、`generate-self-analysis.ts`、`self-analysis-query.ts`、`analysis-source-query.ts`、`page.tsx`、`_components/*`。
- ✅ 新テーブル不要・データ移行が最小・既存集計/生成ロジックを再利用。`sourceResponseId` 軸が自然に版キーになる。
- ❌ 一意性前提のクエリ（`getSelfAnalysis`/`checkRegenerationAllowed`）の書き換えが必須。回帰リスクは中。

### Option B: 専用の履歴/バージョンテーブルを新設

`self_analysis_version` 等を追加し、現行 `self_analysis` は最新スナップショットとして温存。

- ✅ 既存 read 契約を一切変えずに履歴を別系統で持てる。
- ❌ 集計/サマリ/コストの二重管理、`sourceResponseId` という既存版キーを無視した重複設計、移行・整合コスト大。YAGNI 違反。

### Option C: ハイブリッド（段階導入）

Phase 1 で追記型化（A）＋履歴・推移グラフ、Phase 2 で2版比較 UI。

- ✅ リスク分割。グラフ（読み取り専用）で価値を先出しし、比較 UI を後追い。
- ❌ 計画分割の管理コスト。スキーマ変更は Phase 1 で一括必要なので分割効果は UI 側のみ。

## 4. 工数・リスク

| 区分 | 評価 | 根拠 |
|---|---|---|
| スキーマ＋マイグレーション | **S** / Low | インデックス入替のみ。既存データは安全に版1化 |
| 書き込み（submit cooldown / generate 版単位 upsert） | **S–M** / Medium | upsert→insert 化と一意性前提クエリの書き換えに回帰リスク |
| 読み出し（history / by-responseId / rate-limit 版単位化） | **M** / Medium | `getSelfAnalysis`・`checkRegenerationAllowed` の意味変更を含む |
| 推移グラフ（recharts 導入＋整形） | **M** / Medium | 依存追加＋バンドル肥大/Turbopack 警告リスク（既存メモリ） |
| 2版比較 UI | **M** / Low–Medium | 既存コンポーネント流用＋差分計算 |
| **全体** | **M（3–7日）** / **Medium** | 単独の大技術導入は無いが、既存契約変更の波及が広い |

## 5. design phase への申し送り

### 推奨アプローチ
**Option A（既存テーブル追記型化）**。`sourceResponseId` を版キーとし、新テーブルを作らない。比較 UI まで一括設計しつつ、実装は推移グラフ→比較の順で段階導入可（C の利点を取り込む）。

### 設計で決めるべき主要論点
1. **`getSelfAnalysis` の意味変更**: 「最新回答版に対応する分析（無ければ null）」を返す形へ。陳腐化判定（`answered.submittedAt > record.sourceSubmittedAt`）との整合を再定義。
2. **`checkRegenerationAllowed` の版単位化**: (candidate,survey) → `sourceResponseId`（または最新版行）基準へ。30日クールダウンと再生成上限（10/24h）は別軸である旨を明示。
3. **cooldown 判定クエリ**: (candidate,survey) の最新 `submittedAt` を取る新クエリ。`submit-survey` の insert 前に検証し、違反時は「再開可能日」を含むエラーコードを返す（既存 authedAction の二重ラップ/エラーコード規約に合わせる）。
4. **履歴・比較クエリ契約**: `getSelfAnalysisHistory(candidate,survey)` の戻り型（版配列：responseId / submittedAt / aggregatedSnapshot / llmOutput / 版番号）、`getSelfAnalysisByResponseId(responseId)`。本人フィルタ徹底。
5. **時系列整形は純関数**として `_lib` に置き、recharts は Client Component に隔離（バンドル境界）。
6. **マイグレーション**: index drop/add の生成順と本番適用手順（`drizzle-kit generate`→`migrate`）。

### Research Needed（design で要確定）
- **検証戦略**: テスト基盤が皆無。純関数（cooldown 計算・時系列整形・差分計算）に最小の vitest を導入するか、`/kiro-impl` 既存運用（local Docker Postgres＋手動確認＋typecheck/build）に委ねるか。受入基準の検証可能性に直結するため design で方針確定。
- **recharts 採用の最終確認**: バンドル肥大/Turbopack 警告（既存メモリ `feedback_bulr_ui_dist_build`）の実測影響。Client Component 隔離・dynamic import の要否。
- **クールダウン UI 文言と例外運用**: 30日未到達時の表示（残日数／再開日）と、運用上の例外（管理者リセット）が必要かは現時点スコープ外だが design で明記。

---

# Design Synthesis & Discovery (design phase)

## Light Discovery 追記

- **recharts × React 19 互換**: recharts は React 17/18/19 対応だが、React 19 では `react-is` の peer 解決問題があり、`package.json` の pnpm `overrides` で `react-is` を React 19 系に固定する必要がある。Next.js 16 は Turbopack が既定・安定。recharts は client 専用（`ResponsiveContainer`）のため Client Component に隔離し、SSR 回避に `dynamic(import, { ssr:false })` を用いる。出典: nextjs.org/blog/next-16, recharts GitHub discussion。
- **一意制約への暗黙依存は3クエリ**: `getSelfAnalysis` / `checkRegenerationAllowed` に加え、`getSurveyResponseForAnalysis`（analysis-source-query.ts:100 のコメント「DB UNIQUE 制約により最大1件」）も該当。版複数化で `LIMIT 1` が非決定的になるため、最新解決＋responseId 指定へ分離する。

## Synthesis 1: Generalization

- **版キー = `source_response_id` に統一**。回答版・自己分析・履歴・比較のすべてをこの単一キーで貫く。「最新版表示」は履歴（昇順配列）の末尾という特殊ケースとして扱える。`SelfAnalysisVersion` を履歴/比較の共通 DTO とし、`versionIndex` は `source_submitted_at` 昇順で導出（専用カラムを増やさない）。
- **rate-limit を responseId スコープへ一般化**: 「最新版の分析行」を対象にした再生成カウンタ。新版（新 response）は行が無いため初回生成として自然に許可され、版ごとに独立した 10/24h 窓を持つ。30日クールダウン（新版作成の抑止）と直交する2軸の制御として整理。

## Synthesis 2: Build vs Adopt

- **Adopt: recharts**（ユーザー選択）。自作チャートは退避案として保持（バンドル実測が許容外の場合）。
- **Build: cooldown / trend / diff の純関数**。外部ライブラリ不要の軽量ロジックのため自作。`now` を引数注入し決定論化（テスト容易性）。
- **Reuse: `CoverageBars` / `NarrativeSection`**。2版比較は既存表示コンポーネントの左右並置で実現し、新規描画ロジックを最小化。

## Synthesis 3: Simplification

- **新テーブルを作らない（Option A 確定）**。`self_analysis` の既存カラムで版管理が成立するため、履歴/バージョンテーブル（Option B）は YAGNI として却下。
- **`versionIndex` 専用カラムを持たない**。`source_submitted_at` 昇順から導出。
- **`getSurveyResponseForAnalysis` を `getSurveyResponseByResponseId` 中核へ再構成**し、最新版取得はその上の薄いラッパとする（重複ロジックを排除）。

## Boundary 決定の記録

- `@bulr/ai-self-analysis`・`aggregate`・`estimateUsd` の内部は本 spec の Out of Boundary。再利用のみ。
- `checkRegenerationAllowed` / `getSelfAnalysis` / `getSurveyResponseForAnalysis` の意味変更は Revalidation Trigger（呼び出し全箇所＝generate/regenerate/page を同時更新）。

## Open Risk（design→tasks 申し送り）

- vitest 最小導入の可否はユーザー確認待ち（Testing Strategy / Open Questions 1）。tasks 生成時に「テスト導入タスクを含めるか」を分岐させる。

---

# Design Validation 所見（kiro-validate-design・反映済み）

GO（条件付き）判定。以下3点を design.md にパッチ反映済み:

1. **消費クエリの列挙漏れ（Critical 1）**: 一意制約依存は3クエリではなく**4クエリ**。`getLatestResponseByCandidateProfileId`（`packages/db/src/queries/skill-survey/index.ts:23`）が `ORDER BY` 無し `.limit(1)` で、コメントも「ユニーク制約により最大1件」。名前に反し最新を非保証。`/skill-survey/[surveyId]/result` ページの consumer。→ `ORDER BY submitted_at DESC LIMIT 1` 修正＋**両テーブル全 consumer の grep 棚卸し**をタスク化。
2. **クールダウンUX露出（Critical 2）**: 提出時 `COOLDOWN` 拒否のみだと「入力し切ってから弾かれる」。result の「回答を編集する」リンク・フォーム入口で**先回り抑止＋再開日表示**（入口抑止＋提出拒否の二層）を design に明記。
3. **NarrativeSection 再利用不可（Critical 3）**: `NarrativeSection` は `self-analysis-view.tsx` 内のローカル関数（未export）。`CoverageBars` は export 済。→ `narrative-section.tsx` への抽出工程を Modified Files / File Structure Plan に追加。

残 Open Question: recharts バンドル実測（退避案=自作SVG）、クールダウン例外運用（スコープ外）。
