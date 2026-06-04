# Brief: candidate-self-analysis

## Problem

候補者が skill-survey で「実力の棚卸し」を入力しても、結果は回答のエコー（テキスト定義リスト）に留まり、自分の強み・弱みを俯瞰して今後のキャリアや自己成長につなげる「自己分析」体験が存在しない。product.md / roadmap.md が候補者プロダクトの中核に据える「自己診断 → 構造化スキル像 → 自己成長」がプロダクトとして欠落している。候補者ホームにも「自己診断は Wave 2+ で追加予定」のプレースホルダ表記が残ったままになっている。

## Current State

- **skill-survey（実装済み）**: 回答（`skill_survey_response` / `skill_survey_answer`）と L1 結果表示（`apps/candidate/app/skill-survey/[surveyId]/result`、テキスト定義リスト・スコア/他者比較なし）が存在。`packages/db/src/queries/skill-survey/` に `getLatestResponseByCandidateProfileId` 等の読み出し query あり。
- **mock-interview（実装済み）**: `FormativeFeedback`（真贋・判断力・射程・メタ認知・AI活用＋総合の質的フィードバック）あり。ただし本 spec の入力源には**含めない**（survey-only の方針）。
- **ギャップ**: 可視化ライブラリ未導入。skill-survey 回答を横断的に統合した「強み弱みプロフィール」や「成長アクション」のサーフェスが無い。
- **LLM 基盤**: `packages/ai/mock`（Vercel AI SDK 6 + Anthropic Claude Sonnet 4.6、structured output）が候補者向け LLM 関数の先例として確立済み。

## Desired Outcome

候補者が skill-survey 回答をもとに「自己分析」ビューを得られる:

- 強み・弱みの**可視化**（カテゴリ別カバレッジ・自己申告レベルなど、回答から決定論的に算出した構造的集計）
- 強み・弱みの**自然言語サマリ**（集計結果を入力に LLM が要約）
- **成長アクション提案**（「次に伸ばすべき点・具体的な次の一歩」を LLM が生成）
- 数値スコアによる序列化・偏差値・他者比較は**出さない**（product 方針／skill-survey L1 注記に準拠）
- 回答を更新したら自己分析を再生成できる（陳腐化の検知 or 再生成導線）

## Approach

- **入力**: skill-survey の最新 `skill_survey_response` のみ。既存 `packages/db/src/queries/skill-survey/` を再利用（`apps → packages` 単方向を遵守、skill-survey スキーマには書き込まない）。
- **処理（ハイブリッド）**:
  1. **決定論的な構造化集計** — 回答カテゴリ／選択肢／自己申告レベルから強み・弱みの素地（カバレッジ、濃淡）を算出。可視化はこの集計を直接描画（LLM 非依存で安定）。
  2. **LLM 要約・成長アクション生成** — 集計結果を入力に、強み/弱みの自然言語サマリと成長アクションを生成。`packages/ai` 配下に新設（`packages/ai/mock` 踏襲、Vercel AI SDK + Anthropic、structured output / Zod）。`@bulr/db` には依存させない（ai → db 逆流回避、データは呼び出し側が渡す）。
- **保存**: `self_analysis` テーブル（`candidate_profile_id`、集計スナップショット、LLM 生成結果、source response の版、`created_at`）。再生成はオンデマンド。
- **UI**: `apps/candidate/app/self-analysis`（または skill-survey result の拡張）。可視化は Tailwind ベースの構造化表示を基本とし、チャートライブラリ（recharts 等）導入の要否は design で判断（survey-only かつ集計が単純なら Tailwind バーで足りる可能性が高い）。
- **認可**: `requireCandidate`（[[candidate-auth-onboarding]] 依存）。自己分析データは候補者所有。
- **LLM コスト/クォータ**: [[mock-interview]] のクォータ方式を参考に最小限。enforcement 本体を持つか参照に留めるかは design で確定（コスト記録は admin-operations 監視と整合させる）。

## Scope

- **In**:
  - `self_analysis` Drizzle スキーマ + マイグレーション + 読み出し/保存 query
  - skill-survey 回答 → 強み弱み素地の**決定論的集計ロジック**
  - **LLM 要約・成長アクション生成**（`packages/ai` 新規関数、structured output）
  - 自己分析 UI（可視化＋自然言語サマリ＋成長アクション表示＋再生成導線）
  - `requireCandidate` ガード経由のアクセス制御
  - 候補者ホームの「自己診断 Wave 2+ 予定」プレースホルダの解消（導線追加）
- **Out**:
  - mock-interview の formative feedback・面接/entry 履歴を入力に含める統合（今回は **survey のみ**。将来の統合自己分析は別 spec）
  - 数値スコア化・偏差値・他者比較・ランキング
  - L3 年収査定・キャリアパス/職種適性の本格的な示唆（成長アクションの範囲に留め、年収・適性診断には踏み込まない）
  - skill-survey の回答フォーム/結果 UI の **UX 洗練**（別途 skill-survey spec の拡張で対応）
  - admin 側の自己分析監視 UI（必要なら後続）
  - 複数職種横断（skill-survey が対応する職種に従う）

## Boundary Candidates

- 決定論的集計（survey response → 構造化された強み弱み素地）
- LLM 生成（強み弱み要約＋成長アクション）
- 永続化（`self_analysis` テーブル＋ query）
- 自己分析 UI（可視化＋サマリ＋アクション＋再生成）

## Out of Boundary

- **skill-survey** のマスタ／回答スキーマ／回答フォーム本体（skill-survey が所有。本 spec は結果データを**読むだけ**。回答 UX の洗練は skill-survey 拡張側の担当）
- **mock-interview** の `FormativeFeedback`（表現は揃えると一貫するが、入力には含めない）
- **assessment-engine** / **entry-flow** / **session-from-entry**（無関係、触れない）

## Upstream / Downstream

- **Upstream**: [[skill-survey]]（回答 + 読み出し query）、[[candidate-auth-onboarding]]（`requireCandidate` / `candidate_profile`）、`packages/ai`（LLM 基盤、[[mock-interview]] の `packages/ai/mock` 先例）、`packages/db`
- **Downstream**: 将来の mock 統合自己分析、L3 年収査定、キャリア相談、admin 分析ダッシュボード

## Existing Spec Touchpoints

- **Extends**: なし（新規 spec）
- **Adjacent**:
  - [[skill-survey]] — 同時期に **UX 洗練を別途拡張**。本 spec はその回答データを消費する（共有シーム＝回答スキーマ/読み出し query。skill-survey が権威、本 spec が参照）
  - [[mock-interview]] — `FormativeFeedback` と表現トーンを揃えると候補者体験が一貫（入力統合はしない）

## Constraints

- LLM は Vercel AI SDK 6 + Anthropic Claude Sonnet 4.6（既存 `packages/ai/mock` 踏襲、structured output / Zod）
- **ハイブリッド**: 可視化の素地は決定論的集計、自然言語部分（要約・成長アクション）のみ LLM
- 数値スコア化・偏差値・他者比較は出さない（product 方針）
- `apps → packages` 単方向依存、`packages/ai` は `@bulr/db` に依存させない（DI でデータを渡す）
- 自己分析データは候補者所有（データオーナーシップ2層）
- `tech.md` / `security.md` / `structure.md` 準拠
