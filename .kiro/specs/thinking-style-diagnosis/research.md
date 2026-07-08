# Research Log — thinking-style-diagnosis

> Discovery（light / extension）と Synthesis の記録。design.md の背景。

## Discovery Scope

Extension（既存 `playstyle-diagnosis` をテンプレートにした加算的複製）。full discovery は不要。既存実装サーフェスの正確なマッピングに集中した。外部依存の新規追加はなし（recharts 等の新ライブラリ導入なし）。

## 既存実装サーフェス（複製対象）

playstyle-diagnosis（PR #40 マージ済）の構成を精査。要点:

| 層 | 既存（playstyle） | 参照 |
|---|---|---|
| 型 | `packages/types/src/temperament.ts`（TemperamentAxis/Pole/Code/Completeness/Summary/Legacy） | packages/ai（クラス診断）が消費するため共有パッケージに配置 |
| コア | `apps/candidate/app/_lib/temperament/`（axes/score/answers/archetypes） | 純関数。`scoreTemperament`/`deriveCode`/`toSummary`/`mapTemperamentAnswers`/`AXES`/`AXIS_POLES`/`TEMPERAMENT_MIDPOINT`(=50)/`TEMPERAMENT_ARCHETYPES` |
| UI | `apps/candidate/app/playstyle-diagnosis/`（page.tsx + _components: playstyle-result / axis-bars / playstyle-share-panel） | Server Component で auth→fetch→score→deep-link→render |
| DB query | `packages/db/src/queries/class-diagnosis/`（get-playstyle-survey-id / candidate-playstyle-response） | `kind='playstyle'` の survey を1件特定 |
| schema | `packages/db/src/schema/skill-survey.ts`：`surveyKind = pgEnum('survey_kind', ['skill','playstyle'])` | category.subcategory は非null必須（冪等契約）、scoringKind に `'polarity'` 既存 |
| seed | `packages/db/src/seeds/skill-surveys/playstyle.ts` + barrel `seeds/index.ts` | jobType/kind='playstyle'、4カテゴリ×6問（natural×3＋reverse×3）、maxLevel=4、level 0..4、`onConflictDoUpdate(jobType)` 冪等、「高level=第2極」契約 |
| 一覧除外 | `packages/db/src/queries/self-analysis/answered-surveys-query.ts` | フィルタは **`eq(skillSurvey.kind, 'skill')`（包含型）** |
| nav | `apps/candidate/app/_components/nav-items.ts` | `{ label, href, symbol, match }` |
| deep-link 先 | `apps/candidate/app/skill-survey/[surveyId]/page.tsx` | 稼働中 |
| テスト | unit=co-located `.test.ts(x)` / integration=`packages/db/src/__tests__/*.integration.test.ts`（fileParallelism:false, inline env, DATABASE_URL 無で describe.skip） | |

## Design Decisions（Synthesis 結果）

### 1. Generalization（一般化）
- R1〜R4 は playstyle と同一の「軸×極→typology→結果表現」問題。既に汎用形のアルゴリズム（`scoreTemperament`/`deriveCode`/`toSummary`）が存在するが、静的に playstyle 固有 config へ束縛。**今回は抽出せず複製**（Boundary の方式1、下記 Simplification 参照）。一般化＝抽出は2実例が揃った後の別 spec に委ねる。

### 2. Build vs. Adopt
- **Adopt（複製元）**: playstyle の純関数・UI・seed・query パターンをそのまま踏襲。新ライブラリ導入なし。
- **既存 enum 値 `scoringKind='polarity'` を再利用**（新規 scoringKind 追加不要）。
- **一覧除外は既存フィルタで充足**: `eq(kind,'skill')` の包含型フィルタは `thinking_style` を自動除外 → **コード変更ゼロ**、integration test で担保（R5.5）。

### 3. Simplification（簡素化）
- **型を @bulr/types に置かない**: playstyle は packages/ai がクラス診断で消費するため共有パッケージに置いた。thinking-style は**クロスパッケージ消費者が存在しない**（standalone・クラス非統合・ai 非消費）。依存方向（types→db→ai→apps）に照らし、共有パッケージへ消費者ゼロの型を足すのはアンチパターン。→ **型は app ローカル `apps/candidate/app/_lib/thinking-style/` に配置**（playstyle からの意図的な改善／逸脱）。
- **legacy 互換を作らない**: 新規診断で旧レコードが存在しない。playstyle の `LegacyTemperament`/`normalizeClassResultTemperament` に相当するものは不要。
- **DB query の配置**: class-diagnosis と無関係のため `packages/db/src/queries/thinking-style/` を新設（class-diagnosis ディレクトリに相乗りしない）。

## Risks / Mitigations

| リスク | 対策 |
|---|---|
| `survey_kind` enum への値追加 migration がマージ時に番号衝突 | 既存運用（番号振り直し）に従う。ALTER TYPE ADD VALUE の1本のみ |
| seed の dev/prod 反映漏れ | 実装後にシードスクリプト投入＋動作確認（自動反映ではない） |
| score/axis-bars の複製による技術的負債 | 既知の意図的判断。抽出 spec を Out of Boundary に記録 |
| category.subcategory 非null契約の失念 | seed で subcategory='思考スタイル' を明示、integration test で検証 |
