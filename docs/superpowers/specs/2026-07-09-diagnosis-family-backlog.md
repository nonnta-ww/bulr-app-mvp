# 診断ファミリー 改善・将来作業バックログ

> 診断ファミリー（skill-survey / playstyle=気質 / thinking-style=思考スタイル / …）に関する**保留・改善候補**の生きた一覧。
> 起点: thinking-style-diagnosis 実装（PR #41）＋ 全設問必須化（PR #42）で洗い出した項目。
> 着手時は各項目を `/kiro-discovery` or `/kiro-spec-init` に流して spec 化する。優先度・依存は都度見直す。

## A. プロダクト / 機能（将来 spec 候補）

### A-1. 診断ファミリー共通ハブ・共有コアの抽出
- **内容**: playstyle / thinking-style で重複している「軸×極→typology→結果ビュー」の骨格（スコアリング純関数・軸バー・結果カード・共有パネル）を、診断非依存の共通コアへ抽出し、各診断は config（軸定義＋アーキタイプ＋seed）だけにする。
- **なぜ**: 2実例（気質・思考スタイル）が揃った。3つ目を足す前に抽出すると、以降の原子診断が config 追加だけで済む。
- **前提**: 3つ目の原子診断（A-3）の実像が見えてからが理想（YAGNI）。「2つ目を作ってから抽出」という当初方針の次段。
- **影響範囲**: `apps/candidate/app/_lib/{temperament,thinking-style}/`、`{playstyle,thinking-style}-diagnosis/_components/`、型配置（B-3）。稼働中の playstyle＋RPGクラス診断に波及するため要回帰。

### A-2. 思考スタイル結果の永続化・履歴・版比較
- **内容**: 現状 v1 は DB永続化なし（ライブ算出）。`self-analysis-history`（[[project_self_analysis_history]]）と同型で、結果の保存・履歴・2版比較・推移を追加。
- **なぜ**: 成長추이の可視化。playstyle 側の同種要望とも共通化しうる。
- **スコープ**: thinking-style の Out of scope として明記済み（別 spec）。

### A-3. 3つ目の原子診断（例: 仕事力診断）
- **内容**: 思考スタイルと同型の自己申告サーベイ型診断をもう1つ。
- **なぜ**: ファミリーの厚み。3実例が揃うと A-1 の抽出判断が確実になる。

### A-4.（関連）RPGクラス Phase 2
- **内容**: パーティ編成 / クエスト適合（[[project_rpg_class_diagnosis]] の②③）。本バックログの原子診断群とは別スレッドだが、結果を材料に使う合成診断として関連。

## B. 技術負債

### B-1. score / axis-bars / result / share の2系統重複
- **現状**: thinking-style は playstyle を加算的複製したため、スコアリング純関数・軸バー・結果カード・共有パネルが構造的に重複。
- **対応**: A-1 の抽出で解消。単独でも「アルゴリズムを診断非依存にパラメタ化」する小リファクタは可能。

### B-2. thinking-style の partial UI が到達不能
- **現状**: 全設問必須化（PR #42）により、新規回答は full / none のみ。thinking-style は legacy が無いため partial 分岐が到達不能（防御コードとして温存中）。
- **対応候補**: thinking-style-result を none/full の2択へ簡素化して partial 分岐を削除。**注意**: playstyle の partial は旧2軸 class_diagnosis レコードの legacy 互換で**削除不可**（`normalizeClassResultTemperament` / `legacy-record-render.test.tsx`）。thinking-style のみ簡素化する形になる。

### B-3. 型配置の非対称
- **現状**: thinking-style の型は app ローカル（`_lib/thinking-style/`）、playstyle の型は `@bulr/types`（packages/ai のクラス診断が消費するため）。
- **対応**: A-1 の抽出時に共通コアの型ホームを一本化する（消費者の有無で配置を決める原則は維持）。

## C. 運用 / インフラ

### C-1. cloud dev/prod への seed 投入
- **内容**: migration `0021`（survey_kind に thinking_style 追加）適用 → playstyle / thinking-style を再 seed。再 seed で `is_required=true`（PR #42）も反映される（`onConflictDoUpdate` が `excluded.is_required` を更新）。
- **注意**: 各環境の `DIRECT_URL`/`DATABASE_URL` が必要。drizzle-kit の env 解決の落とし穴あり（[[feedback_drizzle_kit_env_resolution]]）。ローカル docker(5434)は投入済み。

### C-2. Preview smoke 検証
- **内容**: env 完備環境（Preview/Vercel）で `/thinking-style-diagnosis` の表示・回答〜結果フローを起動確認。ローカル worktree はビルド env 不足でフル build 未完走（既知・feature 非依存）。

### C-3. worktree の build env 整備
- **内容**: worktree で `next build` をフル完走させるには本番相当 secrets（`DATABASE_URL`/`BETTER_AUTH_SECRET` 等）を持つ `.env.local` が必要。CI/本番は完備。ローカル検証を build まで通したい場合に整備。

## D. 設計の要検討

### D-1. 軸④「理論⇔実践」の独立性校正
- **内容**: 実回答データが溜まったら、思考スタイル4軸間（特に軸④と他軸）の相関を確認し、独立性が低ければ設問文 or 軸の見直し。
- **なぜ**: 軸④は「学習の向き」を typology に畳んだ軸で、他3軸（思考の向き）と相関しうる懸念を設計時に記録済み。

### D-2. 16アーキタイプの命名・文言ブラッシュアップ
- **内容**: thinking-style / playstyle のアーキタイプ名・説明・「次の一歩」を実運用のフィードバックで磨く。決定論キュレーテッドなので随時差し替え可能。

---

## 参照
- 設計: `docs/superpowers/specs/2026-07-08-thinking-style-diagnosis-design.md`
- spec: `.kiro/specs/thinking-style-diagnosis/`, `.kiro/specs/playstyle-diagnosis/`, `.kiro/specs/rpg-class-diagnosis/`
- PR: #41（思考スタイル診断）, #42（全設問必須化）
