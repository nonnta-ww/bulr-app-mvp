# Gap Analysis: candidate-self-analysis

> `/kiro-validate-gap` による要件↔既存コードのギャップ分析（2026-06-05）。design フェーズの入力。決定は design で行う。

## Analysis Summary

- **既存資産は厚い**: skill-survey の回答スキーマ／読み出し query、`packages/ai/mock` の LLM 関数パターン（DI・structured output・usage 返却）、mock-interview のコスト記録・クォータ機構、`requireCandidate`／`authedAction`／候補者ページ規約がそのまま踏襲可能。新規性は「集計ロジック・自己分析 LLM 関数・self_analysis テーブル・自己分析 UI」に限定される。
- **最大のギャップ＝習熟度データ非存在**: `skill_survey_choice` に level/weight/score が無く、`displayOrder` は表示順（≠実力順）。習熟度は選択肢ラベルの**文章**にのみ埋め込まれている。→ **決定論的集計は「カテゴリ別カバレッジ／網羅度・選択の広さ・自由記述の有無」までが安全圏**。ランク付き「強み/弱み」の質的判定は LLM がラベル文＋自由記述を解釈して担う（＝今回のハイブリッド決定と整合）。
- **回答にバージョン履歴が無い**: `skill_survey_response` は `(candidate, survey)` 一意・再回答で上書き。`submittedAt`/`updatedAt` のみ。→ 生成元の版は `sourceResponseId`＋`submittedAt` スナップショット＋回答内容の denormalized スナップショットで担保（再現性・陳腐化判定）。
- **コスト監視の整合は形式まで**: `llm_cost_estimate` 同形（input/output tokens・estimated_usd、$3/$15 per M）で記録すれば形式整合。ただし admin の `/monitoring` は現状 mock_interview のみ集計 → self_analysis を**ダッシュボードに出すのは admin-operations 側の後続変更**（本 spec の境界外・downstream）。
- **可視化ライブラリ未導入**: charting lib 無し。カテゴリ別カバレッジは Tailwind バーで十分。チャートライブラリ追加は任意（design 判断）。

## Requirement → Asset Map

| 要件 | 既存資産（再利用） | ギャップ | タグ |
|---|---|---|---|
| R1 生成（最新回答入力／未回答時導線／生成中表示／版記録） | `getLatestResponseByCandidateProfileId(candidateProfileId, surveyId)` → `{response, answers[]}`；`requireCandidate`；mock の「準備中」ローディング規約 | 対象 survey（job_type）の特定ロジック；category 名・choice ラベルは別 join 必要；版＝`submittedAt` スナップショット | Constraint / Missing |
| R2 強み弱みの**可視化**（決定論的・同一入力→同一結果・スコア/比較なし） | 回答の `selectedChoiceIds[]`・`freeText`・`question.displayOrder`／`questionType` | **習熟度フィールド非存在** → 決定論層はカバレッジ/網羅度/広さに限定。「強み/弱み」ラベル化は要設計判断 | **Constraint（核心）** |
| R3 自然言語サマリ＋成長アクション | `packages/ai/mock`（`generateObject`＋Zod、`claudeSonnet46`、`{output, usage}` 返却、DI） | 新パッケージ `@bulr/ai-self-analysis` と Zod 出力スキーマ；ラベル文/自由記述を LLM 入力に渡す設計 | Missing |
| R4 失敗時の頑健性（可視化は残す／言語部分のみ再試行） | mock の単発呼び出し＋ローディング | 決定論層と LLM 層を分離して保持する生成フロー設計 | Missing |
| R5 再生成・陳腐化 | `response.submittedAt`／`updatedAt` | 履歴なし → `self_analysis.sourceSubmittedAt` と最新 `submittedAt` 比較で陳腐化判定；同秒再submit の縁ケース | Constraint |
| R6 永続化・候補者所有 | `candidate_profile`（cascade）／mock の jsonb 永続化規約 | 新テーブル `self_analysis`（集計スナップショット・LLM 出力・source 版・metadata） | Missing |
| R7 アクセス制御 | `requireCandidate`（`@bulr/auth/server`）＋ページ try/redirect 規約 | なし（そのまま適用） | — |
| R8 導線 | home `page.tsx` の「Wave 2+ 予定」プレースホルダ；feature 間 `<Link>` 規約 | 中央 nav 無し → home にタイル/リンク追加＋プレースホルダ置換 | Missing(軽) |
| R9 コスト記録・整合・再生成抑制 | `llm_cost_estimate` 形・$3/$15 pricing；`countMockInterviewsInQuotaWindow`＋月次定数＋`quota_reset_at` | self_analysis 用のレート制限（mock の `quota_reset_at` を流用せず独立機構推奨）；admin 集計への合流は downstream | Constraint / Missing |

## 既存資産 詳細（design が前提にできる事実）

- **skill-survey 読み出し**: `getLatestResponseByCandidateProfileId(candidateProfileId, surveyId): Promise<SkillSurveyResponseWithAnswers | null>`。返却は `{response, answers: [{answer:{selectedChoiceIds:string[]|null, freeText:string|null}, question:{body, questionType, displayOrder, categoryId}}]}`。**category 名・choice ラベルは含まれない**（別途 `skill_survey_category`/`skill_survey_choice` を join 必要）。`getSkillSurveyMaster(surveyId)` で survey ツリー（カテゴリ→設問→選択肢ラベル）取得可。
- **回答スキーマ**: `skill_survey_response`（`(candidate_profile_id, skill_survey_id)` 一意、上書き）／`skill_survey_answer`（`selected_choice_ids text[]`、`free_text`）。`skill_survey_choice = {id,label,displayOrder}`（**level/weight/score 無し**）。job_type は survey 単位で一意（現状 backend のみ seed 済み）。
- **LLM パターン**: `@bulr/ai-mock`（deps: `ai@6`, `@ai-sdk/anthropic@3`, `zod@4`, `@bulr/ai`；**`@bulr/db` 非依存**）。`generateXxx(input): Promise<{output, usage:{input_tokens,output_tokens}}>`、`generateObject({model: claudeSonnet46, schema, system, prompt, maxRetries:2})`。`claudeSonnet46 = anthropic('claude-sonnet-4-6')`（`packages/ai/src/client.ts`、`ANTHROPIC_API_KEY`）。データは呼び出し側が DI。
- **コスト記録**: `apps/candidate/app/api/mock-interview/finalize/route.ts` で `estimated_usd = (in*3 + out*15)/1_000_000` を計算し `mock_interview.metadata.llm_cost_estimate = {input_tokens, output_tokens, estimated_usd}` に保存。admin `getLlmCostMetrics` は `metadata->'llm_cost_estimate'->>'estimated_usd'` を集計（現状 mock_interview のみ）。
- **クォータ**: `countMockInterviewsInQuotaWindow(candidateProfileId, quotaResetAt)`、window=`GREATEST(date_trunc('month',now()), COALESCE(quota_reset_at, month_start))`、`MONTHLY_QUOTA=3` を server action で判定。`quota_reset_at` は `candidate_profile`（mock-interview 所有）。
- **候補者規約**: `requireCandidate(): {user, session, candidateProfile}`（`@bulr/auth/server`、UNAUTHORIZED→/sign-in、CANDIDATE_PROFILE_MISSING→/onboarding）。`authedAction(schema, handler): (raw)=>Promise<{ok:true,data}|{ok:false,error}>`。ページ規約 `page.tsx`(Server, guard)＋`_components/`＋`_actions/`＋`result/page.tsx`(生成中ローディング)。mock result は row の null をスピナーで待つ方式。
- **UI/可視化**: `@bulr/ui` = Button/Input/Label/Card*/Form*/cn/preset。charting lib 無し → Tailwind バー/ヒートマップが現capability。home プレースホルダ: `apps/candidate/app/page.tsx` の「サインインしました。Wave 2 以降で履歴書登録・自己診断・模擬面接などの機能を順次追加予定です。」

## Implementation Approach Options

### Option A — 既存最大流用・最小新規（coverage-only 可視化）
決定論集計を「カバレッジ/網羅度」に限定し、強み弱みの質的判定は完全に LLM に委譲。schema 変更ゼロ、skill-survey 非改変。
- ✅ 最小・低リスク・boundary 完全遵守。✅ R2 を「網羅度可視化」として安全に満たす。
- ❌ 決定論的な「強み/弱み」ラベルは弱い（網羅度＝実力ではない）→ R2 の「強み弱み」語と UI 表現の整合を design で詰める必要。

### Option B — skill-survey に習熟度メタ付与（既存拡張）
`skill_survey_choice` に level/weight を追加（seed 改修）し、決定論的に強み弱みをランク化。
- ✅ 決定論的「強み/弱み」が data-backed になる。
- ❌ **skill-survey スキーマ/seed を改変＝本 spec の Out of Boundary を侵食**（skill-survey 拡張側の作業になり依存・再検証が増える）。MVP には過剰。→ 非推奨（やるなら skill-survey Existing Spec Update として別管理）。

### Option C — ハイブリッド新規（推奨）
新規中心：`self_analysis` テーブル＋consumer 読み出し query（skill-survey テーブルを読むのみ）＋`@bulr/ai-self-analysis`（mock 流用）＋自己分析 UI。決定論層＝カバレッジ/網羅度/広さ/自由記述有無（Tailwind 可視化）、LLM 層＝選択肢ラベル文＋自由記述を解釈して強み弱みサマリ＋成長アクション。コストは `llm_cost_estimate` 同形で `self_analysis.metadata` に記録。再生成抑制は独立レート制限。
- ✅ 要件・ハイブリッド決定・boundary に完全整合。✅ skill-survey 非改変（読むだけ）。✅ 既存 LLM/auth/ページ規約を最大流用。
- ❌ 決定論「強み弱み」の表現定義（網羅度 vs LLM 由来タグ）を design で確定する必要。❌ admin への コスト合流は downstream 別作業。

**推奨: Option C**（Option A を内包しつつ LLM 層で質的判定を補う形）。

## Effort & Risk

- **Effort: M（3–7 日）** — schema+migration+query(S)／決定論集計＋consumer join query(M)／`@bulr/ai-self-analysis`(S–M)／生成フロー＋コスト記録＋陳腐化＋再生成＋レート制限(M)／UI＋可視化＋導線(M)。
- **Risk: Medium** — 主因は「習熟度データ非存在による決定論的強み弱みの定義」だが、LLM 層へ質的判定を委譲する設計で緩和可能。次点は admin コスト合流（downstream）と再生成抑制機構の新規設計。tech 自体は既知（mock 実績）で低リスク。

## Recommendations for Design Phase

**Preferred**: Option C（ハイブリッド新規、skill-survey 読み取り専用）。

**Key decisions（design で確定）**:
1. **決定論的「強み弱み」の定義**: 可視化＝カテゴリ別カバレッジ/網羅度・選択の広さ・自由記述有無に限定し、質的な強み弱みラベルは LLM 出力に持たせる。R2 の文言と UI 表現（「網羅度マップ」＋LLM 由来の強み弱みタグ）を整合させる。
2. **対象 survey の特定**: 候補者が回答した survey（job_type、現状 backend）を対象に。複数 survey 横断は Out（要件どおり）。
3. **consumer 読み出し query**: 回答＋設問＋カテゴリ名＋選択肢ラベルを束ねる新 query を `packages/db/src/queries/self-analysis/` に新設（skill-survey テーブルを読むのみ、skill-survey 非改変）。
4. **`self_analysis` スキーマ**: `candidate_profile_id`(cascade)・`source_response_id`・`source_submitted_at`・`aggregated_snapshot`(jsonb)・`llm_output`(jsonb)・`metadata`(jsonb llm_cost_estimate)・timestamps。回答上書きに耐える denormalized スナップショットで再現性・陳腐化判定。
5. **生成の実行形態**: 単発呼び出しなので Server Action（`authedAction`、inline await）＋生成中ローディング を基本案、長尺化するなら Route Handler＋ポーリング（mock 流用）を代替案として比較。決定論層と LLM 層を分離し R4 の部分再試行を可能に。
6. **再生成抑制（R9.3）**: mock の `quota_reset_at` を流用せず、self_analysis 用の独立レート制限（例: per-day 上限 or 最小再生成間隔）を design で定義。
7. **コスト整合（R9）**: `llm_cost_estimate` 同形・$3/$15 で `self_analysis.metadata` に記録。**admin `/monitoring` への合流は admin-operations の downstream 変更**（機能別内訳に self-analysis を加える）として明記し、本 spec の boundary 外とする。
8. **可視化技術**: まず Tailwind バー/ヒートマップ。charting lib 追加は任意（必要なら monorepo へ追加判断）。

**Research Needed（carry forward）**:
- 決定論集計から「弱み（手薄なカテゴリ）」をどう安定的に提示するか（網羅度の低さ＝弱みとして良いか、自由記述の薄さをどう扱うか）。
- LLM 入力に渡す回答コンテキストの形（選択ラベル列挙＋自由記述）とプロンプト設計、出力 Zod スキーマ（強み[]／弱み[]／成長アクション[]）。
- 再生成抑制の具体パラメータ（頻度上限）。
