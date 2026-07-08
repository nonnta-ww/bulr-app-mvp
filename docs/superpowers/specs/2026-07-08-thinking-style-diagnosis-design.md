# 設計ドキュメント — 思考スタイル診断（thinking-style-diagnosis）

> ブレインストーミングの合意記録。Kiro spec（`.kiro/specs/thinking-style-diagnosis/`）の入力（discovery brief）として使う。
> 日付: 2026-07-08 / 前提スレッド: `playstyle-diagnosis`（PR #40 でマージ済）

## 1. 位置づけ（戦略コンテキスト）

診断ファミリーの **2つ目の原子診断**。playstyle-diagnosis で確立した骨格

```
サーベイ → 決定論スコアリング（純関数・ライブ算出） → 結果型 → 結果ビュー（軸バー＋アーキタイプカード＋共有）
```

を **同じ形で** もう1つ作る。狙いは、①候補者に「気質（どう働くか）」とは直交する「思考スタイル（どう考えるか）」の自己認識を提供すること、②2つ目を同型で揃え、将来（3つ目 or ファミリーhub の spec）で共通基盤を**意図的に抽出**する材料を作ること。

- **原子診断**: skill-survey / playstyle（気質）/ **thinking-style（思考スタイル）** / （将来）仕事力 …
- **合成診断**: RPGクラス（skill＋playstyle を合成）/ self-analysis …
- 本 spec は **原子診断を1つ足す**だけ。合成診断（RPGクラス）には接続しない。

## 2. 何を測るか（構成概念）

**自己申告サーベイ型**（正解のある実測テストではない）。「地頭そのもの」ではなく、**思考の"向き"の自己認識**を軸×極の typology として決定論導出する。

命名は実態（自己申告の思考スタイル）に忠実化:

| 用途 | 値 |
|---|---|
| 表示名 | 思考スタイル診断 |
| spec / feature 名 | `thinking-style-diagnosis` |
| `skill_survey.kind` enum 追加値 | `thinking_style` |
| `skill_survey.jobType` | `thinking_style` |

### 却下した方式
- **実測テスト型（正誤問題・IQ的）**: 正答スコアリング・制限時間・出題プール・不正対策という別骨格の関心を持ち込み、「同型でファミリー2つ目」という狙いと YAGNI 方針に反する。別トラック相当のため不採用。
- **学習力プロファイル型（self-analysis 形状の強み次元表示）**: self-analysis と結果表現が被り、「同型2つ目→抽出」の目的が弱まる。typology に不採用（学習要素は軸④に畳んで統合）。

## 3. 軸のセット（診断の中身）

**4軸 × 2極 ＝ 16タイプ**。playstyle の汎用軸×極モデルは N 軸対応だが、思考スタイルとして意味が立つ軸を被りなく選ぶ。制約は playstyle の仕事気質軸（探索⇔深化 / 個人⇔協調 / 計画⇔即興 / 堅実⇔挑戦）と**直交**すること。

| 軸 | 第1極 ⇔ 第2極 | 何を捉えるか |
|---|---|---|
| ① | 抽象 ⇔ 具体 | 概念・モデルから入るか、具体例・現物から入るか |
| ② | 論理 ⇔ 直感 | 分析的に詰めるか、直感で当たりをつけるか |
| ③ | 収束 ⇔ 発散 | 選択肢を絞り込むか、広げて発想するか |
| ④ | 理論先行 ⇔ 実践先行 | 先に原理・ドキュメントを掴むか、まず手を動かして学ぶか（＝学び方の向き） |

- 各極に善し悪しを付けない（非数値・バイポーラバー表示）。
- 16アーキタイプ名・説明・「次の一歩」ヒントは全て**キュレーテッド手書き**（LLM不使用）。
- 「俯瞰⇔没入」は playstyle の探索⇔深化と近接するため候補から除外した。
- 軸④は Q2 で範疇に入れた「学習力」要素を、typology に無理なく1軸として統合したもの。

## 4. 実装方式 — 加算的複製（共有コアの抽出は今やらない）

playstyle のコアは**アルゴリズムは汎用だが静的に playstyle 固有の軸設定へ束縛**されている（`score.ts` が `./axes` を直接 import、型 `TemperamentAxis` が playstyle 4軸キーの union、`axis-bars`/`playstyle-result` も固有 `AXES`/`TEMPERAMENT_ARCHETYPES` を直接参照）。

本 spec は **方式1: 加算的複製** を採る。

- thinking-style は**完全自己完結の新規ファイル**として追加する（own `axes`/`archetypes`/`score`/components/型/`kind`/seed/route）。
- **マージ済みの playstyle・RPGクラス診断コードは一切改修しない**（ブラスト半径ゼロ）。
- score エンジン・axis-bars 等が一時的に2系統重複することは許容する（小さな2ファイル程度）。

### 却下した方式
- **方式2: 共有コアを今抽出**（score/axis-bars/result/share と `@bulr/types` の軸型を診断非依存に汎用化し、playstyle と thinking-style を両方 config 化）。重複を即解消できるが、**稼働中の playstyle ＋ それを深く消費する RPGクラス診断へ波及**し全回帰が必要、spec が大型化。別セッションの既定路線「2つ目を同じ形で"作ってから"抽出」（作成と抽出を分離）にも反する。抽出は、思考スタイル／気質の2実例が揃った状態で、必要になった時（仕事力診断 or ファミリーhub の spec）に意図的に一括で行う。

## 5. アーキテクチャ（playstyle と同型・新規追加のみ）

playstyle の構成を鏡写しにした新規ファイル群。命名は `thinking-style` / `ThinkingStyle` 系。

### 新規ファイル（想定）
```
packages/types/src/
└── thinking-style.ts        # ThinkingStyleAxis(4) / Pole / Code / Completeness / Summary（Legacy は無し）

apps/candidate/app/_lib/thinking-style/   # 思考スタイル判定コア（standalone のみが使用）
├── axes.ts        # 4軸定義・極トークン・軸/極ラベル・canonical order・midpoint
├── archetypes.ts  # 16 code -> { name, shortLabel, description, nextStep }（キュレーテッド）
├── score.ts       # scoreThinkingStyle(answers)->Profile / toSummary / deriveCode
└── answers.ts     # THINKING_STYLE_CATEGORY_AXIS（seed カテゴリ名->軸）＋ mapThinkingStyleAnswers()

apps/candidate/app/thinking-style-diagnosis/
├── page.tsx                       # Server Component: auth->fetch->score->deep-link 解決->render
└── _components/
    ├── thinking-style-result.tsx  # 結果プレゼン（none/partial/full 分岐）
    ├── axis-bars.tsx              # 4軸バイポーラバー（数値非表示）
    └── thinking-style-share-panel.tsx  # アーキタイプ名のみの共有（PII非含）

packages/db/src/queries/thinking-style/
└── get-thinking-style-survey-id.ts   # getThinkingStyleSurveyId(): survey の id or null
（＋ candidate 本人の回答取得 query。playstyle の candidate-playstyle-response 相当）
```

### 変更ファイル（最小・playstyle/class は非改修）
- `packages/db/src/schema` ＋ migration — `skill_survey.kind` enum に `'thinking_style'` を追加（1本の小さな migration）。
- `packages/db/src/seeds/skill-surveys/thinking-style.ts` — 新規 seed（`kind='thinking_style'` / `jobType='thinking_style'`、4軸×6問＝24問、natural×3＋reverse×3、冪等 upsert、「高level＝第2極」契約）。seed バレルへ登録。
- 汎用スキルアンケート一覧の kind 除外フィルタ（playstyle 除外の実装）に `'thinking_style'` を追加。
- `apps/candidate/app/_components/nav-items.ts` — `/thinking-style-diagnosis` を追加。

## 6. データモデル・スコアリング契約

- **DB永続化なし（v1）**。結果は survey 回答からライブ算出、DB レコードを持たない。共有テキストもライブ結果から導出（PII非含）。
- スコアリング: 各軸の回答 level を集計 → 極を決定論導出 → canonical order で極トークンを連結し16型 `code` を得る（playstyle の `deriveCode` と同アルゴリズムを複製）。
- **充足度（completeness）**: エンジンは partial/full を扱う。ただし **legacy 互換は不要**（新規診断・旧レコード無し。playstyle にあった legacy 正規化は作らない＝より単純）。
- **極向き契約**: 「アンケートの高 level ＝ 第2極」。seed とスコアリングで一貫させる。

## 7. ルート・導線

- 独立ルート `/thinking-style-diagnosis` を新設し、ナビに追加（一級メンバーの体裁）。
- **deep-link CTA**: `getThinkingStyleSurveyId()` で surveyId を解決 → `/skill-survey/{id}` へ直行（playstyle の `getPlaystyleSurveyId` 相当を複製）。
- 汎用スキルアンケート一覧からは `kind='thinking_style'` を除外（診断用サーベイであり職種スキル棚卸しではないため）。

## 8. playstyle との差分（明示）

| 項目 | playstyle | thinking-style |
|---|---|---|
| 構成概念 | 気質（どう働くか） | 思考スタイル（どう考えるか） |
| RPGクラス統合 | クラス診断へ給餌（temperament 入力） | **なし**（standalone 完結） |
| legacy 互換 | 旧2軸4型レコードの正規化あり | **なし**（新規・旧レコード無し） |
| 共有コア | 固有実装 | **複製**（抽出は後続 spec） |
| LLM彩り | 不使用 | 不使用（同） |
| 永続化 | なし（v1） | なし（v1、同） |

## 9. Out of scope（別 spec）

- 思考スタイル診断結果の **DB永続化・履歴・版間比較**（self-analysis-history と同型で、必要時に別 spec）。
- 診断ファミリー共通のハブ／結果枠・共有コアの**抽出／汎用化**（2実例が揃った本 spec 完了後に、意図的に別 spec で）。
- **実測テスト型**の地頭診断（正誤問題）。
- RPGクラス診断への thinking-style 給餌（合成診断側の拡張）。

## 10. テスト方針（playstyle と同型）

- **Unit（純関数・app core）**: `scoreThinkingStyle` / `deriveCode` / `toSummary` の決定論性、16 code 網羅、partial 充足度。archetypes の16 code 完備。
- **Integration（DB, inline env・fileParallelism:false・直列）**: seed 提供（`kind/jobType='thinking_style'` が1件・期待 title/構造）、`getThinkingStyleSurveyId` の解決、候補者回答取得、一覧からの kind 除外。
- **E2E/UI（jsdom, `@bulr/candidate test`）**: `/thinking-style-diagnosis` の none/partial/full 表示、軸バー、共有パネル（PII非含）、deep-link href。

## 11. リスク / 留意

- **enum 拡張 migration**: `skill_survey.kind` への値追加。マージ時の drizzle migration 番号衝突に注意（振り直し運用）。
- **seed の環境反映**: dev/prod への seed 投入はスクリプト運用（自動反映ではない）。実装後に別途投入・動作確認。
- **重複の技術的負債**: score/axis-bars の2系統重複は既知の意図的判断。抽出 spec の起票を Out of scope に記録済み。
