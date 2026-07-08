# Gap Analysis — playstyle-diagnosis

対象: `.kiro/specs/playstyle-diagnosis/requirements.md`（R1〜R7）。既存 `rpg-class-diagnosis`（main マージ済）への機能追加。依存方向 types→db→ai→apps 厳守。

## 1. 現状調査（Current State）

### 気質判定の既存資産（すべて app-local + types + db seed）
- **型（@bulr/types）** `packages/types/src/class-diagnosis.ts`
  - `TemperamentAxis = 'explorationDeepening' | 'soloCollaboration'`（**2軸ハードコード**）
  - `Temperament = explorer_solo | explorer_collab | deepener_solo | deepener_collab`（**4値enum**）
  - `ClassResult.temperament: Temperament | null` / `temperamentBalanced: boolean`。`class_diagnosis.result` jsonb が `.$type<ClassResult>()` で参照。
- **純関数（apps/candidate/.../class-diagnosis/_lib）**
  - `temperament.ts` `scoreTemperament(answers)` → `{ axes: Record<axis,number>, quadrant: Temperament, balanced }`。**未回答軸は中点50へフォールバック**（→ 部分回答でも極が確定してしまう）。
  - `build-diagnosis.ts` `mapTemperamentAnswers(playstyle)`（カテゴリ名→軸 `PLAYSTYLE_CATEGORY_AXIS`、reverse=false/maxLevel=4）、`computeClassResult(source, playstyle)`。
  - `assemble.ts` `composeClassName`：気質あり=`${title}・${temperamentLabel}な${vocation}` / 気質なし=`${title}・${vocation}`。**className に気質フルラベルを埋め込む固定契約**。
  - `definitions.ts` `TEMPERAMENT_LABELS/TEMPERAMENTS/TEMPERAMENT_AXES/TEMPERAMENT_MIDPOINT`。
- **DB（@bulr/db）**
  - `schema/skill-survey.ts` `survey_kind = pgEnum('survey_kind', ['skill','playstyle'])`（本specでは変更不要）。
  - `queries/class-diagnosis/candidate-playstyle-response.ts` `getCandidatePlaystyleResponse(profileId)`（`eq(skillSurvey.kind,'playstyle')` の最新 response を `SurveyResponseForAnalysis` で返す）。
  - `seeds/skill-surveys/playstyle.ts` `playstyleSurveySeed`：`jobType='playstyle'`, `kind='playstyle'`, **2カテゴリ×6問（natural×3＋reverse×3）＝12問**、`scoringKind='polarity'`、Likert level 0..4。カテゴリ名=軸キー（安定）。冪等 upsert（runner）。
  - `queries/self-analysis/answered-surveys-query.ts` は `eq(skillSurvey.kind,'skill')` で playstyle を職種一覧から除外済み（R5.5 は充足済み）。
- **UI（apps/candidate/.../class-diagnosis/_components）**
  - `class-diagnosis-view.tsx` 状態機械：NoVocation / Empty / PartialNoTemperament / Complete / VizOnly / Stale。**NoVocation が「skill未回答」を一括で吸収し、気質のみ回答者を行き止まりにしている**。気質CTA(`class-diagnosis-temperament-cta`)は `href="/skill-survey"`（一覧止まり）。
  - `vocation-radar.tsx`：`temperamentAxes` prop は**実データを描かずラベル注記のみ＝実質デッド**。呼び出し側 `DiagnosisVisualization` は渡していない（除去は安全）。
  - `class-card.tsx`：`TEMPERAMENT_LABELS[result.temperament]` を複数箇所・`buildTemplateFlavor` で使用。`share-panel.tsx` は className/称号のみ共有（PII非含の既存パターン）。
- **ルーティング**
  - `skill-survey/[surveyId]/page.tsx`：**surveyId は DB `id`(UUID) 解決**（`eq(skillSurvey.id, surveyId)`）。安定slugは無い → deep-link には id 解決 or 専用リダイレクトルートが必要。
  - `_components/nav-items.ts`：ナビは静的配列。`/playstyle-diagnosis` 追加はここに1行。

### 規約
- 決定論パイプライン（横断集計→純関数→確定）、数値スコアUI非表示、app→@bulr/types 単方向、純関数は app-local で単体テスト、DB統合テストは inline env＋fileParallelism:false。

## 2. 要件→資産マップ（gaps: Missing / Unknown / Constraint）

| 要件 | 既存資産 | ギャップ |
|---|---|---|
| R1 16型・軸×極ジェネリック | `Temperament`(4値)/`TemperamentAxis`(2値)/`scoreTemperament` | **Constraint**: 4値enum・2軸ハードコードを拡張表現へ。**Unknown**: 16値union vs 「code＋軸極record」構造の選択（レガシー互換とR1.4拡張性の両立）。 |
| R2 独立結果表示（アーキタイプ＋4軸ビュー＋キュレーテッド） | class-card/vocation-radar は職掌前提 | **Missing**: 16アーキタイプ提示カード・**4軸バー可視化（新規）**・16型ぶんのキュレーテッド文言（型名＋説明＋次の一歩）。 |
| R2.5 専用ページ | route 無し | **Missing**: `/playstyle-diagnosis` ルート新設。nav 追加。 |
| R3 充足度別導出（未/一部/全） | `scoreTemperament` は未回答軸を中点で埋める | **Constraint**: 部分回答で嘘の完全型が出る。**Missing**: 回答済み軸の追跡（determined/undetermined）と `TemperamentResult` 形状拡張、partial結果＋残軸への導線。 |
| R3.4 中点拮抗 | `balanced` フラグ有 | 既存を4軸へ一般化（軸ごとの拮抗）。 |
| R4 共有 | share-panel（className/称号） | **Missing**: アーキタイプ名ベースの共有表現（PII非含はパターン踏襲）。 |
| R5 4軸アンケート拡張 | playstyle seed（2軸12問） | **Missing**: 2カテゴリ追加（計画と即興／堅実と挑戦）×6問＝24問化、`PLAYSTYLE_CATEGORY_AXIS` に2軸追加。schema変更なし・冪等。**Unknown**: 設問文（実データ校正前提の初期版）。 |
| R6.1 deep-link | `[surveyId]` は UUID 解決 | **Missing**: `getPlaystyleSurveyId()` クエリ or 安定リダイレクトルート `/skill-survey/playstyle`。 |
| R6.2/6.3 気質のみ回答者の表示＋次の一歩 | NoVocation が吸収 | **Missing**: 状態分岐追加（hasPlaystyle→気質結果表示）。**Unknown**: 独立ルートへ集約 vs class内表示の併存。 |
| R7.1 気質判定の単一ソース | class は `computeClassResult` 内で気質算出 | 気質判定関数を class/standalone で共有（app-local 共有で可）。 |
| R7.2 className 簡潔記述 | className に気質フルラベル埋め込み | **Constraint/Unknown**: 16アーキタイプ名は長い → composeClassName の気質記述を簡潔化（軸ベース短語 or 気質はバッジのみ）。固定契約(UI 8.2)を再設計。 |
| R7.3/7.4 旧4型レコード互換 | 旧 `explorer_solo` 等が result jsonb に永続 | **Constraint**: `Temperament` 型変更で旧値が非メンバー化。**Missing**: 旧4型→（探索/深化・個人/協調の2軸のみ確定＝partial）へ写像する互換リーダー。旧回答者は再診断で16型化。 |
| R6.4 本人スコープ | requireCandidate＋profileフィルタ既存 | 踏襲のみ。 |

## 3. 実装アプローチ（Options）

### Option A: 既存 class-diagnosis を拡張（気質を4軸16型に作り替え、standalone は class 配下に同居）
- 気質純関数・定義・型を拡張し、独立結果は `/class-diagnosis` の状態分岐と app-local コンポーネントで表現。専用ルートは薄いラッパ。
- ✅ 既存パターン・テスト資産を最大活用、単一ソース維持が自然。 ✅ 追加ファイル最小。
- ❌ class-diagnosis 配下が肥大化、「独立診断メンバー」の境界が曖昧に。

### Option B: プレイスタイル診断を独立モジュールとして新設
- `apps/candidate/app/playstyle-diagnosis/` に純関数（軸・極・16型・キュレーテッド）・結果コンポーネント・page を新設。class 側は共有関数を import。
- ✅ 「一級メンバー」の境界が明確、将来 地頭/仕事力 の雛形になる。 ✅ class 配下を汚さない。
- ❌ 気質純関数を class と standalone で共有する置き場所の設計が要る（app-local 共有 or _lib 共通化）。

### Option C（推奨）: ハイブリッド — 気質判定コアを共有 _lib に据え、独立UIは新モジュール、class は薄く統合
- **コア**（軸定義・極・16型code導出・キュレーテッド文言・`scoreTemperament` の partial 対応）を app-local の共有 `_lib`（例 `app/_lib/temperament/` or 既存 class-diagnosis/_lib から昇格）に置き、**class と playstyle-diagnosis の双方が同一関数を使う（R7.1 単一ソース）**。
- **独立UI**：`/playstyle-diagnosis` に結果カード・4軸バー・共有を新設（R2）。
- **class 統合**：`assemble.ts` の className を簡潔記述へ、旧4型互換リーダーを追加、NoVocation を分岐して気質のみ回答者を独立結果へ誘導（R6.2/6.3/7）。
- **型**：`Temperament` を「軸×極から導出する code（＋per-axis スコア/pole record）」へ再設計し16型・拡張性・レガシー互換を同時に満たす（R1.4）。
- ✅ 単一ソース・独立境界・拡張性・レガシー互換のすべてを両立。 ❌ 計画が最も緻密（型再設計＋波及の順序管理）。

## 4. Effort & Risk

- **Effort: L（1〜2週）** — types→db seed→app の縦断、16型ぶんのコンテンツ、レガシー互換、新ビュー、新ルート、class 統合の波及。
- **Risk: Medium** — 既存パターンに沿うが、(1) 永続化済み `ClassResult.temperament` 型変更の後方互換、(2) className 固定契約の再設計（UI/テスト波及）、(3) 部分回答判定の意味変更、が慎重さを要する。技術的未知は小。

## 5. 設計フェーズへの申し送り（Recommendations / Research Needed）

**推奨アプローチ**: Option C（コア共有・独立UI・class薄統合）。

**設計で確定すべき主要判断（Research Needed）**:
1. **気質タイプ表現**: `Temperament` を 16値string-union にするか、`{ code, axes: Record<axis, {score, pole, determined}> }` 構造にするか。R1.4拡張性・R7.3レガシー互換・jsonb永続の三立を評価。旧4型値の写像規則（＝2軸determined／2軸undetermined の partial）を明文化。
2. **`scoreTemperament` / `TemperamentResult` の partial 対応**: 回答済み軸のみを determined とし、未回答軸を中点で埋めない。`assemble.ts`・`class-card.tsx` への波及（気質未確定の描画）を含めて設計。
3. **className の気質記述**: 16アーキタイプ名を埋め込まない簡潔記述の具体形（軸ベース短語／気質はバッジ分離／記述省略）。現行固定契約とテストの更新範囲。
4. **独立ルートと class 表示の関係**: `/playstyle-diagnosis` に集約しリンク誘導 vs class 内 TemperamentOnly で直接表示 の役割分担。
5. **deep-link 実装**: `getPlaystyleSurveyId()` クエリで id 解決 vs 安定リダイレクトルート `/skill-survey/playstyle`。
6. **追加2軸の設問と極向き**: 「計画と即興／堅実と挑戦」各6問（natural×3＋reverse×3）、level高=第2極（即興／挑戦）向きに正規化。`PLAYSTYLE_CATEGORY_AXIS` へ2軸追加。実データ校正前提の初期版として妥当性のみ確認。
7. **キュレーテッド文言のコンテンツ設計**: 16アーキタイプ名＋説明＋次の一歩ヒント＋4軸ラベル。決定論・LLM非依存・数値非表示。
8. **コア共有関数の置き場所**: 気質判定コアを class-diagnosis/_lib に留めて playstyle 側から import するか、`app/_lib/temperament/` へ昇格するか（将来 地頭/仕事力 の同型化も睨む）。

**スコープ外（別spec、設計に持ち込まない）**: 診断ファミリー共通hub、気質結果のDB永続化・履歴・版比較、地頭/仕事力の実装。

---

## Design Synthesis Outcomes（design フェーズ）

### 1. Generalization
- 気質タイプを固定enumでなく「軸×極→導出code＋アーキタイプ」の**データ駆動モデル**に一般化（R1.4）。軸の追加/改名は `axes.ts` と seed の変更で完結、判定ロジック（`scoreTemperament`）は軸数に非依存。
- ただし**実装スコープは現要件（4軸16型）に限定**。診断ファミリー共通基盤（hub/結果枠）は interface すら作らない（メンバー2つ揃うまで抽出しない）。

### 2. Build vs Adopt
- **Adopt**: 既存決定論純関数（`scoreTemperament`/`mapTemperamentAnswers`）・`getCandidatePlaystyleResponse`・seed runner 冪等 upsert・共有パネルの PII 非含パターン・`requireCandidate`。
- **Build（理由付き）**: 4軸バイポーラバーは recharts レーダーが bipolar 表現に不適合のため素の SVG/CSS で新規（新規依存なし）。16アーキタイプ文言はキュレーテッド（LLMより質・安定・コスト0）。`getPlaystyleSurveyId` は `[surveyId]` が UUID 解決のため deep-link に必須。

### 3. Simplification
- standalone は **永続化・Server Action・LLM を持たない**（Server Component 内ライブ算出）。署名/cooldown/レコード機構を引き込まない。
- 結果UIは `PlaystyleResult` **単一実装**を standalone ルートと class の TemperamentOnly の両方でマウント（compact/full の二重実装を作らない）。
- `ClassResult` には**コンパクト summary のみ**保存（スコアは持たせない＝クラスはスコアを所有しない）。リッチ profile は standalone のライブ算出時のみ。
- レガシー互換は**読取時正規化（非破壊）**で解決し、DBマイグレーション・行書換えを回避。

### Key Design Decisions（確定）
- D1 型: `TemperamentAxis`4値＋`TemperamentSummary`(@bulr/types) / `TemperamentProfile`(app-local リッチ)。`code` 非null ⇔ `completeness==='full'`。
- D2 レガシー: `normalizeClassResultTemperament` 総関数で旧4型→2軸determined partial。
- D3 partial: 未回答軸は中点で埋めず `determined=false`（旧中点フォールバック廃止）。
- D4 className: full 時のみ `archetype.shortLabel` を埋め込み、partial/none は気質省略。フル16型名は standalone。
- D5 deep-link: `getPlaystyleSurveyId()` で id 解決→`/skill-survey/{id}`、null 時は一覧フォールバック。
- D6 ルート関係: `/playstyle-diagnosis` を正典、class の TemperamentOnly は同一 `PlaystyleResult` を再利用。
- D7 seed: 「計画と即興」(即興=第2極)/「堅実と挑戦」(挑戦=第2極) を各6問追加、`PLAYSTYLE_CATEGORY_AXIS` に2軸追加。
- D8 コア置き場: `apps/candidate/app/_lib/temperament/` に共有集約（standalone/class が同一関数使用＝R7.1 単一ソース）。
