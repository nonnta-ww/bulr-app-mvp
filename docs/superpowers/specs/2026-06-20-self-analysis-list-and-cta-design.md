# 自己分析 導線改善 ＆ アンケート結果→自己分析 CTA 強化 設計

- 日付: 2026-06-20
- 対象アプリ: `apps/candidate`
- 関連 spec: candidate-self-analysis / self-analysis-history（既存・クローズ済み）

## 背景・課題

1. アンケート（skill-survey）回答後、`/skill-survey/{surveyId}/result` に遷移するが、
   自己分析への導線（青リンク）が本文に紛れ、「次にどれを押せばよいか」分かりにくい。
2. 回答が完了したこと（棚卸し完了）がページ上で明示されておらず、達成感・次アクションが弱い。
3. `/self-analysis` は `getAnsweredSurveyForCandidate` で **回答済み最新アンケート1件のみ**を自動表示する。
   複数アンケート種別（将来 backend 以外が増える）に回答した場合、一覧から選んで詳細を見る導線がない。

現状アクティブなアンケートは「バックエンドエンジニア スキルアンケート」1種類のみだが、
`skill_survey` は `jobType` 単位で複数行を持てる設計のため、一覧UIは前方互換に作る。

## ゴール

- アンケート結果ページで「完了」を明示し、自己分析への主要CTAを一目で分かるようにする。
- `/self-analysis` を「回答済みアンケート一覧 → 各アンケートの分析詳細」の2階層に再構成する。
- 既存の表示状態（Empty / VizOnly / Stale / Complete）と版履歴ロジックは詳細ページにそのまま温存する。

## スコープ外

- 新しいアンケート種別（job_type）の追加。
- 自己分析の生成ロジック・LLM プロンプト・版履歴アルゴリズムの変更。
- 30日クールダウン仕様の変更。

## アーキテクチャ

### ルート構成（再構成）

| ルート | 役割 | 由来 |
|---|---|---|
| `/self-analysis` | **一覧**：回答済みアンケートをカードで列挙 | 新規（現 page.tsx を作り変え） |
| `/self-analysis/[surveyId]` | **詳細**：`SelfAnalysisView` ＋ `HistorySection` | 現 `/self-analysis/page.tsx` のロジックを移設 |

- 現 `apps/candidate/app/self-analysis/page.tsx` の「最新1件自動表示」ロジックは
  `apps/candidate/app/self-analysis/[surveyId]/page.tsx` へ移設し、`surveyId` を params から受ける。
- 詳細ページの `getSelfAnalysis` / `getSelfAnalysisHistory` 呼び出しは params の `surveyId` を使用（現状は `answered.surveyId`）。
- 所有者確認: 詳細ページでも `getAnsweredSurveysForCandidate` 等で本人が当該 surveyId に回答済みであることを担保し、
  未回答 surveyId の直接アクセスは一覧へ redirect（または NoResponse 表示）。

### 一覧ページ（`/self-analysis/page.tsx`）

- 認証ガードは現行どおり（`requireCandidate` → `/sign-in` / `/onboarding`）。
- データ取得: 新規クエリ `getAnsweredSurveysForCandidate(candidateProfileId)` を呼ぶ。
- 0件 → 既存の「先に skill-survey に回答しましょう」案内（amber バナー＋ `/skill-survey` リンク）をそのまま表示。
- 1件以上 → アンケートカードのリストを表示。

#### カード（新コンポーネント `_components/survey-analysis-card.tsx`）

各カードの表示要素:
- アンケート名（`title`）と職種（`jobType`）
- 最終回答日（`latestSubmittedAt` を `ja-JP` で整形）
- 分析ステータスのバッジ:
  - `none`（未生成）→ グレー系バッジ「未生成」＋ボタン「自己分析を生成する」
  - `ready`（生成済み・最新）→ green 系バッジ「生成済み」＋ボタン「分析を見る」
  - `stale`（回答更新あり）→ amber 系バッジ「要再生成」＋ボタン「分析を見る」
- ボタンは `/self-analysis/{surveyId}` への `Link`（生成自体は詳細ページの GenerateButton に委譲）。

### 新規クエリ `getAnsweredSurveysForCandidate`

`packages/db/src/queries/self-analysis/analysis-source-query.ts` に追加。

返り値:
```ts
interface AnsweredSurveySummary {
  surveyId: string;
  jobType: string;
  title: string;
  latestSubmittedAt: Date;
  analysisStatus: 'none' | 'ready' | 'stale';
}
```

ロジック:
1. `skill_survey_response` を `candidateProfileId` で絞り、`skillSurveyId` ごとに最新 `submittedAt` を集約。
2. `skill_survey` を JOIN して `title` / `jobType` を解決（`isActive` 不問＝回答済みなら表示）。
3. 各 survey の最新 `self_analysis.sourceSubmittedAt` を解決（無ければ `none`）。
4. ステータス導出: 分析なし→`none` / `latestSubmittedAt > sourceSubmittedAt`→`stale` / それ以外→`ready`。
5. `latestSubmittedAt` 降順で返す。

既存クエリ（`getAnsweredSurveyForCandidate`, `getSelfAnalysis`, `getSelfAnalysisHistory`）は変更しない（詳細ページが流用）。

### アンケート結果ページ CTA 強化（`survey-result.tsx`）

- 冒頭に**完了バナー**を追加: チェックアイコン＋「アンケートに回答しました」（emerald 系）。
  「棚卸しが完了しました」のニュアンスを完了済みの事実として明示。
- 既存の冒頭 CTA（blue ボックス）を**主要アクションカード**に格上げ:
  - 見出し「次は自己分析へ」＋説明＋大きめボタン「自己分析を見る」。
  - リンク先を `/self-analysis/{surveyId}`（回答したアンケートの詳細へ直行）に変更。
    - `SurveyResult` に `surveyId` prop を追加し、`result/page.tsx` から渡す。
- 末尾の重複 CTA も同様にリンク先を `/self-analysis/{surveyId}` に統一。

## データフロー

```
[結果ページ] /skill-survey/{id}/result
  完了バナー + 「自己分析を見る」CTA → Link /self-analysis/{id}

[一覧] /self-analysis
  getAnsweredSurveysForCandidate(profileId)
   → 0件: NoResponse 案内 (/skill-survey)
   → N件: SurveyAnalysisCard[] (status別バッジ+ボタン) → Link /self-analysis/{surveyId}

[詳細] /self-analysis/{surveyId}
  getSelfAnalysis + getSelfAnalysisHistory (現行ロジック移設)
   → SelfAnalysisView + HistorySection
```

## エラー処理 / エッジケース

- 未回答 surveyId への直接アクセス（詳細ページ）: 当該候補者が回答していない → 一覧へ redirect。
- 一覧で対象 survey が `isActive=false` でも、回答済みなら一覧・詳細とも閲覧可能（過去回答の保全）。
- 詳細ページの Empty/VizOnly/Stale/Complete 分岐は現行コードを温存。

## テスト方針

- 新規クエリ `getAnsweredSurveysForCandidate` の単体テスト:
  - 0件 / 1件（analysisStatus none・ready・stale 各ケース） / 複数 survey の降順ソート。
- 一覧ページのレンダリング: 0件で NoResponse、N件でカード描画・ステータス別バッジ/ボタン文言。
- 詳細ページ: 既存テストを `[surveyId]` ルートへ追従（params 経由で surveyId 解決）。
- 結果ページ: 完了バナー表示、CTA リンク先が `/self-analysis/{surveyId}` であること。
- 既存テストスイートが緑であること。

## 移行・互換

- 既存の `/self-analysis` への外部リンク（例: result ページの旧CTA）は一覧へ着地するため壊れない。
- 詳細直行リンクは新設の `/self-analysis/{surveyId}`。
