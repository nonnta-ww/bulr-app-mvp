# Gap Analysis / Research — rpg-class-diagnosis

_生成日: 2026-07-07 / 対象: Phase 1（個人クラス診断）requirements.md 全12要件_

## Analysis Summary

- **基盤は十分に整っている**。skill_survey マスタ／回答（追記型・版管理）／`aggregate()` 純関数／self_analysis の版管理・cooldown・LLM生成・Recharts 可視化を**そのまま流用**でき、新機能は主に「薄い判定レイヤー＋新テーブル＋プレイスタイル survey seed＋新 AI パッケージ＋business 表示」で構成できる。
- **最大の設計論点は版管理モデルの相違**。既存 self_analysis は「survey単位・`sourceResponseId` ユニーク（1 response = 1 分析）」。一方クラス診断の職掌は**候補者レベルで複数 skill-survey を横断合成**し、気質は**別の playstyle response**に由来する。すなわち `class_diagnosis` は「候補者単位・複数ソース参照」で、self_analysis の 1:1 パターンをそのままコピーできない。ここが設計フェーズの中心決定。
- **既存の横断取得クエリが不足**。候補者の全 skill-survey 回答（または集計スナップショット）を一括取得する関数が無く、新規実装が要る。
- **steering は陳腐化**（tech.md/structure.md は「Stage1 apps/web 単一」時代の記述）。実体は monorepo-app-split 済みで apps/candidate・apps/business・apps/admin＋packages/db・packages/ai・packages/ui。構造事実は実コードを正とする。
- **総合見積り: 効ort L（1〜2週間）／リスク Medium**。大半は確立パターンの流用だが、(1) 横断版管理モデルが新規、(2) 称号の広さ×深さ絶対閾値の校正、(3) playstyle スコアリングの持ち方、が判断を要する。

---

## Requirement → Asset Map（流用 / 新規）

| 要件 | 必要な技術資産 | 既存資産 | 判定 |
|---|---|---|---|
| R1 職掌判定（横断合成） | カテゴリ別スコア、職掌アフィニティ、横断集計、argmax/しきい値 | `aggregate()`＋各 self_analysis の `aggregatedSnapshot`（カテゴリ別 proficiencyScore） | 集計は流用可。**横断合成クエリ＋アフィニティ定義＋判定純関数は新規** |
| R2 気質（playstyle 12問） | 新 survey、2軸スコアリング、逆転設問、中点二値化 | skill_survey マスタ／回答／seed runner | survey基盤は流用可。**playstyle seed＋軸スコア関数は新規** |
| R3 クラス・称号（広さ×深さ） | 職掌×気質→クラス、広さ/深さ→称号 | なし | **新規（判定純関数＋定義マスタ）** |
| R4 閲覧・可視化 | クラスカード、レーダー | `skill-balance-radar.tsx`（Recharts）、self-analysis-view の状態分岐 | 可視化は流用可。**クラスカードUIは新規** |
| R5 共有 | 共有用表現生成、PII 除外 | なし | **新規（軽量）** |
| R6 版管理・履歴・再診断・cooldown | 版保持、陳腐化判定、24h上限 | self_analysis の upsert/history/`checkRegenerationAllowed`/cooldown | パターン流用可。**横断ソース対応で調整必要**（下記論点1） |
| R7 フレーバー＋劣化耐性 | LLM structured output、graceful degradation | `packages/ai/self-analysis`（generateObject＋Zod＋失敗時フォールバック済） | パターン流用。**`packages/ai/class-diagnosis` 新規** |
| R8 部分状態・エッジ | 未回答CTA、低信頼フラグ | self-analysis の NoResponse/Empty/Stale 状態分岐 | 状態機構は流用。**部分表示ロジックは新規** |
| R9 マスタ・拡張性 | 職掌/気質/称号/アフィニティ定義、賢者・策士の枠 | なし（seed/config パターンは有） | **新規（config or DBマスタ、下記論点4）** |
| R10 business read-only | entry 詳細への表示、代表クラス選定 | `apps/business/.../entries/[entryId]/page.tsx` | 表示先は流用。**代表クラス取得＋UIは新規**（下記論点5） |
| R11 アクセス制御・プライバシー | requireCandidate、本人限定、企業へは名のみ | `guards`（requireCandidate）、candidateProfileId 固定フィルタ | **流用可** |
| R12 下流用データ保持 | 7職掌ソフトベクトル保持 | なし | **新規（class_diagnosis に列/JSON）** |

---

## 確定した既存資産（実コード検証済み）

- **skill_survey スキーマ** `packages/db/src/schema/skill-survey.ts`
  - `scoreKind = pgEnum('score_kind', ['proficiency','recency','frequency'])`（3値）
  - `skill_survey_choice.level`（integer, nullable）／`skill_survey_category.subcategory`（nullable）・`displayOrder`
  - `skill_survey.jobType`（text, **UNIQUE**）→ `'playstyle'` 追加は制約上問題なし
- **回答** `skill-survey-response.ts`：`selectedChoiceIds: text[]`・`freeText`、**追記型（append-only）**、CASCADE
- **self_analysis** `self-analysis.ts`：`sourceResponseId` **UNIQUE**、複合 index `(candidate, survey, submittedAt)`、`aggregatedSnapshot`(jsonb)・`llmOutput`(jsonb, nullable)・`regenerationCount`/`regenerationWindowStart`
  - `CategoryCoverage.proficiencyScore?`（0..100）等 optional フィールドで後方互換
- **aggregate()** `apps/candidate/app/self-analysis/_lib/aggregate.ts`：`(SurveyResponseForAnalysis) => AggregatedSnapshot`、`proficiencyScore = round((Σlevel/count/MAX_LEVEL)*100)`、`MAX_LEVEL=3`
- **queries** `packages/db/src/queries/self-analysis/`：`getSelfAnalysis`/`getSelfAnalysisHistory`/`checkRegenerationAllowed`/`upsertSelfAnalysis`/`updateNarrative`。cooldown `SELF_ANALYSIS_DAILY_REGEN_LIMIT=10`, 24h スライド。**候補者の全 response/snapshot 一括取得は無し（新規要）**
- **seed** `packages/db/src/seeds/skill-surveys/`：`runner.ts` の `runSkillSurveySeed(db, seed)`＋job別ファイル。`SkillSurveySeedData` は categories/questions/choices(level) を持つ。CSV正本あり（`docs/*-skills.csv`）だが**設計駆動 seed も前例あり**（infrastructure-sre 等）
- **candidate_profile** `candidate-profile.ts`：`displayName`/`headline` あり、**クラス情報なし**
- **business 表示先** `apps/business/app/(interviewer)/openings/[openingId]/entries/[entryId]/page.tsx`（候補者名・ステータス・履歴書・スキルアンケート結果を表示）
- **migration**：drizzle-kit 自動採番、最新 `0019_*.sql`。`generate`→`push`(dev)/`migrate`(prod)。config は `DIRECT_URL > DATABASE_URL`
- **AI** `packages/ai/self-analysis/`：`generateSelfAnalysisNarrative(input): Promise<{output, usage}>`、Zod schema、失敗時フォールバック実装済

---

## 実装アプローチ（主要論点ごとに Option 提示）

### 論点1: `class_diagnosis` の版管理モデル（★最重要）

self_analysis の「1 response = 1 行」はクラス診断に**そのまま使えない**（職掌＝複数 survey 横断、気質＝別 response）。

- **Option A（推奨）: 候補者単位・ソース集合スナップショット方式**
  `class_diagnosis` を候補者単位で持つ。参照ソースは「寄与した各 skill-survey response id 群＋playstyle response id」を JSON スナップショットとして保持。陳腐化＝寄与 survey か playstyle のいずれかに新しい response が出現したら stale。版履歴は append-only（新版を追加）。self_analysis の cooldown/regeneration パターンは流用しつつ、ユニークキーは `candidateProfileId`（＋版）に変更。
  - ✅ 設計意図（横断合成・ベテラン吸収）に忠実／下流(②)にソフトベクトルを渡せる
  - ❌ self_analysis と版キーが異なる＝新パターンの実装が要る
- **Option B: survey単位で職掌ローカル診断を持ち、表示時に横断合成**
  各 survey ごとに職掌スコアを self_analysis 同様 1:1 で保存し、閲覧時にオンザフライで合成＋気質を掛ける。
  - ✅ 既存 1:1 パターンを最大流用
  - ❌ 「確定した合成結果・称号」を永続化しない＝履歴/共有/business 表示が都度計算・非決定的タイミング問題。R6/R10/R12 と噛み合わせづらい
- **Option C: ハイブリッド**：職掌ローカルは survey単位保存（B）＋合成結果は候補者単位の `class_diagnosis` に確定保存（A）。
  - ✅ 監査性と流用の両取り　❌ 二重保持で整合管理コスト

→ **推奨 Option A**。R6/R10/R12/R3(称号) が「確定・保存された候補者単位の結果」を要求するため。

### 論点2: 職掌ベクトルの入力源（横断集計の取り方）

- **Option A（推奨）: 回答から直接横断集計**。候補者の全 skill-survey response を新規クエリで取得→ 各 survey に `aggregate()` を適用 → カテゴリ×職掌アフィニティで7職掌スコアに畳み込み → 候補者単位で合算。self_analysis の生成有無に依存しない。
- **Option B: 既存 self_analysis.aggregatedSnapshot を再利用**。self_analysis が生成済みのカテゴリスコアを流用。
  - ❌ self_analysis 未生成の候補者だと欠落。依存が不安定。
- → **推奨 A**。新規クエリ `getAggregatedSnapshotsForCandidate(candidateProfileId)`（全 survey 分の SurveyResponseForAnalysis or AggregatedSnapshot を返す）を追加。

### 論点3: playstyle のスコアリングの持ち方

- **Option A（推奨）: 専用の軸スコア関数**。`aggregate()`/`CategoryCoverage` に相乗りさせず、playstyle 用の小さな純関数で「軸(category)=探索深化/個人協調、level→0..100 正規化、逆転設問は level 反転で吸収」を計算。scoreKind は明示性のため **`'polarity'` を1値追加**（正規化式は proficiency と同じでも意味を分ける）。
- **Option B: `scoreKind='proficiency'` で流用**し aggregate に通す。
  - ✅ enum 追加不要　❌ playstyle 軸スコアが CategoryCoverage.proficiencyScore に紛れ、意味が曖昧化。将来の混乱要因
- → **推奨 A**。category=軸の2カテゴリ構成、逆転設問は seed で level 反転。

### 論点4: 定義マスタ（職掌/気質/称号/アフィニティ）の置き場

- **Option A（推奨・MVP）: コード内 config（TS 定数）**。`職掌7`／`jobType→既定職掌`／`category名→職掌アフィニティ`／`気質4`／`称号(広さ×深さ閾値)` を型付き定数で持つ。賢者・策士は「枠」を定義に置き、対応 category が無ければスコア0で自然に非活性→survey追加で開放（R9.2 を満たす）。
- **Option B: DB マスタ＋admin CRUD**。運用者が実行時編集。
  - ✅ 非エンジニア運用　❌ Phase 1 では過剰。整合検証・UI コストが大
- → **推奨 A**（config）。R9 の「ロジック改変不要で対応付け追加」は config 追記で満たせる。DB マスタ化は将来の別spec。

### 論点5: business の「代表クラス」取得

- **Option A（推奨）: 読み取り時に導出**。`class_diagnosis`（候補者単位）から代表クラスを取得。複数 survey 時の代表は「最も網羅度の高い寄与」を診断確定時に記録しておき、それを表示。candidate_profile への非正規化列は追加しない（同期不要）。
- **Option B: `candidate_profile.classLabel` に非正規化**。
  - ✅ 一覧表示が軽い　❌ 診断更新との同期が必要＝陳腐化リスク
- → **推奨 A**。論点1 Option A の候補者単位テーブルなら 1 クエリで取得可能。

---

## 新規実装インベントリ

```
[新規] packages/db/src/schema/class-diagnosis.ts          # 候補者単位テーブル（論点1-A）
[新規] packages/db/src/queries/self-analysis/class-diagnosis-query.ts  # upsert/history/cooldown/代表クラス
[新規] packages/db/src/queries/.../get-aggregated-for-candidate.ts     # 横断集計取得（論点2-A）
[新規] packages/db/src/seeds/skill-surveys/playstyle.ts    # 12問 seed（設計駆動、逆転設問含む）
[新規] packages/ai/class-diagnosis/                        # generate-class-diagnosis.ts / schema.ts / index.ts
[新規] packages/*/ 判定純関数                               # 職掌畳み込み・argmax/しきい値・気質二値化・広さ×深さ称号（決定論・純関数、テスト必須）
[新規] apps/candidate/app/.../class-diagnosis/             # ページ＋クラスカード＋部分状態＋共有
[流用] skill-balance-radar.tsx / self-analysis 状態分岐 / self_analysis cooldown・upsert パターン
[新規] apps/business/.../entries/[entryId] にクラス read-only セクション
[新規/追加] scoreKind に 'polarity'（論点3-A採用時）＋ migration 自動採番（0020_*）
[追加] 定義 config 定数（論点4-A）
```

---

## Effort / Risk

| 領域 | Effort | Risk | 根拠 |
|---|---|---|---|
| 判定純関数（職掌/気質/称号） | M | Med | ロジックは自作だが純関数で TDD 容易。**閾値校正が要判断** |
| class_diagnosis テーブル＋横断クエリ | M | Med | self_analysis 流用だが**版キーが新パターン**（論点1） |
| playstyle survey seed（12問） | S | Low | 既存 seed runner。設問文・逆転・level 設計のみ |
| packages/ai/class-diagnosis | S–M | Low | self-analysis 実装をほぼ写経 |
| candidate UI（カード＋レーダー＋部分状態） | M | Low | 既存コンポーネント流用 |
| business read-only | S | Low | セクション追加のみ |
| **総合** | **L（1–2週）** | **Medium** | 大半流用、中心リスクは版管理モデルと閾値校正 |

---

## Research / Decision Items（design フェーズへ持ち越し）

1. **版管理キー確定**（論点1）：候補者単位テーブルの版・陳腐化・cooldown をどう厳密化するか（self_analysis の 1:1 からの逸脱を明文化）。
2. **称号の絶対閾値校正**（R3）：広さ（何職掌以上で「広」）・深さ（proficiencyScore 何点以上で「深」）の初期値。seed/config として持ち、後調整可能に。
3. **職掌アフィニティの初期マッピング**：各既存 survey のカテゴリ名 → 7職掌への重み表（前衛/後衛/守護/賢者/指揮/策士/遊撃）。現存カテゴリ一覧を design で棚卸し。
4. **playstyle 設問設計**：2軸×6問の具体文・逆転設問・Likert level 段階数（例 0..4）と中点定義。
5. **代表クラス選定規則**（R10.2）：「最も網羅度の高い寄与」の具体定義（overallCoverageRatio 最大 survey か、合成後の主職掌か）。
6. **scoreKind 'polarity' 追加是非**（論点3）：enum 追加 vs proficiency 流用の最終判断。
7. **共有表現の PII 境界**（R5.2）：クラス名・称号のみで個人特定情報を含めない出力形の確定。
8. **CI/テスト前提**：DB テストは Postgres サービス＋drizzle migrate 事前適用＋`--concurrency=1`、@bulr/db は fileParallelism:false（既存 CI レシピ踏襲）。純関数群は単体テストで網羅。

---

## 設計フェーズへの推奨

- **推奨アプローチ = Hybrid（Option C 寄り）の中で**、永続化は「候補者単位 `class_diagnosis`（論点1-A）」、入力は「回答から直接横断集計（論点2-A）」、playstyle は「専用軸スコア関数（論点3-A）」、定義は「config 定数（論点4-A）」、business は「読み取り時導出（論点5-A）」。
- **決定論コアを厳守**：職掌畳み込み・argmax・しきい値・気質二値化・広さ×深さ称号はすべて純関数（同一入力→同一出力）。LLM はフレーバーのみ、失敗時フォールバックで診断成立（R7）。
- **賢者・策士は「枠だけ」**：config に定義を置き、対応 survey 未整備でもスコア0で非活性、survey 追加で自動開放（R9.2）。

---

## Design Synthesis（design.md 確定時の結論 / 2026-07-07）

各論点の最終採用（design.md に反映済み）:

- **論点1 版管理 → Option A 採用**：`class_diagnosis` は候補者単位・append-only。版一意キーは `(candidateProfileId, sourceSignature)`（寄与 skill response 群＋playstyle response id のソート連結）。self_analysis の `sourceResponseId` ユニークからの逸脱を明文化。陳腐化は `sourceSnapshot.submittedAt` 比較。
- **論点2 入力源 → Option A 採用**：`getCandidateVocationSource` を新設し回答から直接横断集計（self_analysis 生成有無に非依存）。
- **論点3 playstyle → Option A 採用**：専用 `scoreTemperament` 純関数＋`score_kind` に `'polarity'` 追加。逆転設問は seed の level 反転で吸収（スキーマ破壊なし）。
- **論点4 定義 → Option A（config）採用**：ただし配置は「新規 package」ではなく **candidate app-local `_lib/definitions.ts`**（既存 `aggregate.ts` の app-local 慣習に合わせ、投機的パッケージ化を回避）。Phase 2 が要すれば抽出。
- **論点5 代表クラス → Option A 採用**：`getRepresentativeClass` が最新版から派生。candidate_profile への非正規化列は追加しない。

**build-vs-adopt**:
- Adopt（写経）：`generate-class-flavor` ← `generate-self-analysis`、`vocation-radar` ← `skill-balance-radar`、cooldown/upsert/状態分岐 ← self-analysis。
- Build（新規）：横断集計クエリ、候補者単位版管理、純粋判定4関数、定義 config、playstyle seed。

**校正が必要な初期定数（definitions.ts に集約、seed 実測後に調整）**：`SUB_VOCATION_RATIO=0.75` / `BREADTH_ABS_THRESHOLD=60` / `BREADTH_WIDE_MIN=4` / `DEPTH_DEEP_MIN=70` / `LOW_CONFIDENCE_MIN_ANSWERS=8` / `TEMPERAMENT_MIDPOINT=50`。

---

## Design Review 指摘の解消（/kiro-validate-design, GO条件付き → 反映済み 2026-07-07）

3つの Critical Issue を design/requirements に反映:

1. **playstyle が職種フローに混入（Issue1）** → `skill_survey` に `survey_kind` enum(`'skill'|'playstyle'`)＋`kind` 列（notNull default `'skill'`, 非破壊）を追加。`candidate-vocation-source` は `kind='skill'` のみ集計、playstyle 取得は `kind='playstyle'`、`getAnsweredSurveysForCandidate` に `kind='skill'` 絞り込み（職種一覧/self-analysis からの除外）。
2. **職掌スコアが proficiency 単独依存で frequency/free_text 系職掌が過小評価（Issue2）** → 寄与スコアを `categoryScore = proficiencyScore ?? frequencyScore ?? round(coverageRatio*100)` の決定論的フォールバックに定義変更。`VocationInput.categories[].categoryScore` に統一。
3. **代表クラス R10.2 と候補者単位モデルの不整合（Issue3）** → requirements.md R10.2 を「代表クラス＝候補者単位の最新確定診断の className」に整理。design の `getRepresentativeClass` も survey 単位選抜を持たない旨を明記。

テストにフォールバック・playstyle 除外の検証項目を追加。再ゲート通過。
