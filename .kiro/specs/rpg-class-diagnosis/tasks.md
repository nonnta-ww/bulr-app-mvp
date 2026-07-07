# Implementation Plan

## 1. Foundation: スキーマ・enum・マイグレーション

- [x] 1.1 skill-survey スキーマ拡張（polarity / survey_kind）
  - `score_kind` enum に `'polarity'` を追加。`survey_kind` enum(`'skill'|'playstyle'`)と `skill_survey.kind`（notNull, default `'skill'`）を追加。
  - 既存 job 系 survey 行は default `'skill'` で解決され、既存回答・集計に影響しないこと（非破壊）。
  - 完了状態: スキーマ定義に `polarity`・`kind` が存在し、型エラーなくビルドが通る。
  - _Requirements: 2.1, 9.3_

- [x] 1.2 class_diagnosis テーブルとバレル追加
  - 候補者単位テーブルを定義（`candidateProfileId` FK cascade、`sourceSignature`、`sourceSnapshot`/`result`/`llmFlavor`(nullable)/`metadata` jsonb、`regenerationCount`/`regenerationWindowStart`、`generatedAt`）。
  - `unique(candidateProfileId, sourceSignature)` と `(candidateProfileId, generatedAt)` index を定義。schema/index・queries/index のバレルへ登録。
  - 完了状態: テーブルと JSON 型が定義され、re-export 経由で参照可能。
  - _Requirements: 6.1, 12.1, 12.2_

- [x] 1.3 マイグレーション生成と適用
  - `drizzle-kit generate` で `0020_*` を生成し、dev DB へ適用（DIRECT_URL/DATABASE_URL は inline 上書き）。
  - 完了状態: マイグレーションファイルが生成され、dev DB に `class_diagnosis` と `skill_survey.kind` 列が存在。
  - _Depends: 1.1, 1.2_
  - _Requirements: 6.1_

## 2. 定義マスタ（config）

- [x] 2. 職掌・気質・称号・アフィニティの定義 config
  - 7職掌（前衛/後衛/守護/賢者/指揮/策士/遊撃、displayOrder 兼 tiebreak 順）・4気質・4称号を型付き定数で定義。
  - `CATEGORY_AFFINITY`（既存 survey の各カテゴリ名→職掌重み）と `JOBTYPE_DEFAULT_VOCATION` を定義。賢者・策士は定義を置き、対応カテゴリが無ければ寄与0で非活性（対応 survey 追加で自動開放）。
  - 判定パラメータ（`SUB_VOCATION_RATIO=0.75` / `SUB_VOCATION_MAX=2` / `BREADTH_ABS_THRESHOLD` / `BREADTH_WIDE_MIN` / `DEPTH_DEEP_MIN` / `LOW_CONFIDENCE_MIN_ANSWERS` / `TEMPERAMENT_MIDPOINT`）を集中定義。
  - 完了状態: 定義がエクスポートされ、既存 survey の全カテゴリ名がアフィニティ表に網羅されている。
  - _Requirements: 1.1, 3.7, 9.1, 9.2_

## 3. 純粋判定ロジック（決定論・単体テスト付き）

- [x] 3.1 (P) 職掌ベクトル畳み込みと主/副判定
  - カテゴリ寄与スコア×職掌アフィニティを合算し7職掌ベクトル（0..100）を算出。argmax=主職掌、相対75%・上限2で副職掌、該当なしで単一。
  - 同点は displayOrder で決定論 tiebreak。同一入力→同一出力を単体テストで確認。
  - 完了状態: 単体テストが通り、横断入力から主職掌・副職掌・7職掌ベクトルが返る。
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_
  - _Boundary: vocation.ts_
  - _Depends: 2_

- [x] 3.2 (P) 気質軸スコアと象限化
  - 2軸（探索⇔深化・個人⇔協調）の回答を 0..100 正規化。逆転設問は反転吸収。中点で二値化し4象限を確定、中点ちょうどは既定極＋balanced フラグ。未回答は null。
  - 完了状態: 単体テストが通り、逆転・中点・未回答の各ケースが仕様どおり。
  - _Requirements: 2.3, 2.4, 2.5, 2.6_
  - _Boundary: temperament.ts_
  - _Depends: 2_

- [x] 3.3 広さ×深さの称号判定
  - 絶対閾値超えの職掌数=広さ、対象職掌の平均スコア=深さ。2×2で 賢者/勇者・スペシャリスト・遊撃/よろず屋・見習い を決定。
  - 完了状態: 単体テストが通り、ベテラン（広×深→賢者/勇者）と若手の広く浅い（→遊撃/見習い）が区別される。
  - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6_
  - _Boundary: title.ts_
  - _Depends: 3.1_

- [x] 3.4 クラス組み立て（ClassResult）
  - 主/副職掌・7職掌ベクトル・気質(単一/null)・称号・代表職掌・className・confidence を組成。低回答数で `confidence='low'`。
  - 完了状態: 単体テストが通り、`vocationVector` が常に7職掌キー完備、気質未回答でも部分結果が組成される。
  - _Requirements: 3.1, 8.2, 8.3, 12.1_
  - _Depends: 3.1, 3.2, 3.3_

## 4. DB クエリ

- [x] 4.1 (P) 候補者職掌ソースの横断取得
  - `kind='skill'` の全 skill-survey の最新 response を読み、`aggregate()` 適用。カテゴリ寄与は `proficiencyScore ?? frequencyScore ?? round(coverageRatio*100)` にフォールバック正規化。未回答は空を返す。
  - 完了状態: 統合テストが通り、playstyle survey は集計に含まれず、proficiency 非対応カテゴリでも寄与スコアが0固定にならない。
  - _Requirements: 1.1, 1.2, 8.1_
  - _Boundary: candidate-vocation-source.ts_
  - _Depends: 1.3_

- [x] 4.2 (P) class_diagnosis の保存・履歴・cooldown・代表クラス
  - `sourceSignature`（寄与 response 群の決定論連結）で版一意化する upsert、最新版取得、履歴、24h 再生成上限判定、代表クラス取得（className/主職掌/称号のみ、根拠回答は返さない）。
  - 完了状態: 統合テストが通り、同一入力は版重複せず、履歴は全版保持、上限超過で拒否される。
  - _Requirements: 6.1, 6.2, 6.4, 10.2, 10.3, 11.3_
  - _Boundary: class-diagnosis-query.ts_
  - _Depends: 1.3_

- [ ] 4.3 職種アンケート一覧からの playstyle 除外
  - `getAnsweredSurveysForCandidate` に `kind='skill'` 絞り込みを追加（集計・生成ロジックは不変）。
  - 完了状態: 統合テストが通り、playstyle survey が職種アンケート一覧・self-analysis 生成対象に出現しない。
  - _Requirements: 1.1_
  - _Boundary: answered-surveys-query.ts_
  - _Depends: 1.3_

## 5. プレイスタイル診断 seed

- [ ] 5. プレイスタイル診断 survey の seed 追加
  - `jobType='playstyle'`・`kind='playstyle'` の survey を定義。2軸×6問=12問、`scoringKind='polarity'`、Likert `level`（例0..4）。逆転設問は level 反転で表現。seeds index に登録し冪等 upsert。
  - 完了状態: seed 実行で playstyle survey が投入され、12問・2軸構成が DB に存在する。
  - _Requirements: 2.1, 2.2_
  - _Depends: 1.3_

## 6. フレーバー生成 AI

- [ ] 6. (P) クラスフレーバー生成パッケージ
  - `@bulr/ai` にサブモジュールを新設。`ClassResult`＋回答ラベルから tagline/description/nextStepHint を structured output で生成。数値・他者比較・順位を出さない grounding 制約。self-analysis 実装を参照。
  - 完了状態: 関数が構造化出力を返し、入力に根拠づいた説明が生成される（数値非出力）。
  - _Requirements: 7.1, 7.2, 4.3_
  - _Boundary: packages/ai class-diagnosis_

## 7. 生成オーケストレーション（Server Action）

- [ ] 7. クラス診断生成 Server Action
  - `requireCandidate` → cooldown 判定 → 職掌ソース取得＋playstyle回答取得 → 純関数判定（3.4）→ フレーバー生成（try/catch、失敗時 `llmFlavor=null`）→ upsert → revalidate。
  - 部分状態（skill未回答/ playstyle未回答）と低信頼を結果に反映。再診断はカウンタ進行と narrative 更新に対応。
  - 完了状態: skill＋playstyle 回答済み候補者で確定診断が保存され、LLM 失敗時もクラス・可視化データが保存・表示可能。
  - _Requirements: 1.1, 6.3, 6.4, 7.3, 8.1, 8.2, 8.3, 11.1, 11.2, 12.2_
  - _Depends: 3.4, 4.1, 4.2, 4.3, 5, 6_

## 8. candidate UI

- [ ] 8.1 診断ページと状態分岐
  - Server Component で回答/診断を取得し陳腐化判定。状態分岐（NoVocation / PartialNoTemperament / Complete / VizOnly / Stale）と生成/再生成 CTA（pending UI）を描画。数値スコアは非表示。
  - 完了状態: 各状態で適切な表示・CTA が出て、stale 時に再診断で最新化される。
  - _Requirements: 4.1, 4.4, 6.2, 6.3, 8.1, 8.2, 11.1_
  - _Depends: 7_

- [ ] 8.2 (P) クラスカードと職掌レーダー
  - クラス名・職掌アイコン・気質称号・フレーバー（失敗時テンプレ文）を表示するカードと、7職掌ベクトル＋気質2軸のレーダー（`skill-balance-radar` 準拠、数値非表示）。
  - 完了状態: 確定診断からカードとレーダーが描画され、隣接クラスの成長ヒントが表示される。
  - _Requirements: 4.1, 4.2, 4.3, 7.3_
  - _Boundary: class-card.tsx, vocation-radar.tsx_
  - _Depends: 7_

- [ ] 8.3 (P) 共有パネル
  - クラス名・称号のみを含む共有表現を生成（個人特定情報を含めない）。
  - 完了状態: 共有操作でクラス名・称号のみの共有テキストが得られ、PII を含まない。
  - _Requirements: 5.1, 5.2_
  - _Boundary: share-panel.tsx_
  - _Depends: 7_

## 9. business read-only 表示

- [ ] 9. entry 詳細への代表クラス read-only 表示
  - entry 詳細ページで `getRepresentativeClass` を用い、候補者の代表クラス名を read-only 表示。根拠回答・パーティ編成機能は出さない。
  - 完了状態: 診断済み候補者の entry 詳細に代表クラスが表示され、未診断では非表示。
  - _Requirements: 10.1, 10.2, 10.3, 11.3_
  - _Depends: 4.2_

## 10. 検証（E2E・エッジ）

- [ ] 10. クリティカルフローの E2E とエッジ検証
  - 候補者フロー: skill＋playstyle 回答→生成→カード＋レーダー表示（数値非表示）。部分状態（playstyle 未回答で職掌のみ暫定＋CTA）。陳腐化→再診断で更新。business の代表クラス read-only 表示。
  - DB テスト前提（クリーン DB・`--concurrency=1`・@bulr/db fileParallelism:false）で 4.1/4.2/4.3 の統合テストを含めて緑にする。
  - 完了状態: 上記フローが自動テストで通過し、全要件のユーザー可視挙動が確認される。
  - _Requirements: 4.1, 4.4, 5.1, 6.2, 6.3, 8.1, 8.2, 10.1_
  - _Depends: 8.1, 8.2, 8.3, 9_

## Implementation Notes

- **カテゴリ名はサーベイ横断で一意でない**（衝突）: 「フレームワーク・ライブラリ」「アーキテクチャ設計」「パフォーマンス・チューニング」「テスト」は frontend と backend の両方に存在し、狙う職掌が異なる（前衛 vs 後衛）。そのため `CATEGORY_AFFINITY` は `jobType::categoryName` 複合キー＋`JOBTYPE_DEFAULT_VOCATION[jobType]` フォールバックの resolver で解決する（設計の「categoryName または jobType」の意図に沿う精緻化）。**契約**: `VocationInput.categories` は `{ jobType, categoryName, categoryScore, answeredCount }`（3.1）、`getCandidateVocationSource` は各 category に jobType を付与して返す（4.1）。
- seed 済み skill survey は5職種: frontend(→vanguard) / backend(→rearguard) / infrastructure-sre(→guardian) / engineering-manager(→commander) / ai-driven-development(→ranger)。sage(賢者)・strategist(策士) は対応 survey 未整備＝寄与0で非活性（枠のみ）。
- dev DB 履歴ドリフト（0019 番号振り直し）は `__drizzle_migrations` row 20 の hash/created_at を非破壊整合して解消済み。worktree 再構築時は再発しうる。
- **気質 pole-orientation 契約（3.2 ↔ 5 seed）**: 逆転吸収後の higher normalized score = 第2極。`explorationDeepening > 50 → deepener`(<=50→explorer, 50は既定極 explorer)、`soloCollaboration > 50 → collab`(<=50→solo, 50は既定極 solo)。playstyle seed(task 5) は post-reverse level が高いほど「深化」「協調」寄りになるよう設問と `reverse` を設計すること。反転すると全象限が入れ替わる。
- **className フォーマット契約（3.4 → 8.2 UI）**: temperament あり = `${titleLabel}・${temperamentLabel}な${vocationLabel}`（例「スペシャリスト・孤高の深化者な前衛」）、temperament null（部分診断）= `${titleLabel}・${vocationLabel}`。ラベルは definitions.ts の VOCATION_LABELS/TITLE_LABELS/TEMPERAMENT_LABELS。UI は className をそのまま表示してよい。
