# 引き継ぎドキュメント — engineering-manager-survey

> 別セッションへの引き継ぎ用。2026-06-26 時点。前任セッションでツール呼び出しのフォーマット不具合が頻発したため、実装フェーズを引き継ぐ。

## 0. これは何のタスクか

スキルアンケートに **エンジニアリングマネージャー（EM）向け**（`jobType='engineering-manager'`）を追加する。これは一連の「職種別スキルアンケート追加」作業の 3 本目。先行 2 本（frontend / infrastructure-sre）は **PR #28 で main マージ済み**。

EM アンケートは **spec（requirements/design/tasks）まで完了・全フェーズ承認済み**。**実装（seed コード）が未着手**。この実装を完了させるのがゴール。

## 1. 作業環境（重要）

- **作業ディレクトリ（worktree）**: `/Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp/.claude/worktrees/intelligent-bouman-a30795`
- **ブランチ**: `claude/intelligent-bouman-a30795`（main から分岐、現在 PR #28 マージ後の main 相当 + 未マージの EM spec ドキュメント）
- **モノレポ**: pnpm + Turborepo。対象パッケージは `packages/db`。

### 環境の落とし穴（前任が踏んだもの）
1. **Node**: 一部シェルで `node` が古い v15 に落ちる。必ず `export PATH="/Users/takaaki.tanno/.nvm/versions/node/v24.15.0/bin:$PATH"` を各 Bash 呼び出し先頭で実行（Node 24 / pnpm 10）。
2. **system git / python3 が壊れている**: xcode-select 依存で `git` `python3` がエラー。→ **git は `/opt/homebrew/bin/git` を使う**。スクリプトは nvm node で書く。
3. **依存**: worktree に node_modules が無ければ `pnpm install --frozen-lockfile`（pnpm 10）。※済んでいるはず。
4. **DB（テスト用）**: ローカル docker Postgres が 5434 で稼働（コンテナ名 `docker-postgres-1`、DB `bulr_dev` / user `bulr` / pass `dev_password`）。
   - **psql はホスト PATH に無いことがある** → `docker exec -e PGPASSWORD=dev_password docker-postgres-1 psql -U bulr -d bulr_dev -c "..."` を使う。
   - **dev DB（bulr_dev）は `drizzle-kit push` 由来で migrator journal が空**。テストの `migrate()` は既存テーブルと衝突するため、**クリーン DB を都度作って実行する**（例 `bulr_em_test`）。

## 2. このプロジェクトのワークフロー（CLAUDE.md 準拠）

Kiro 風 spec 駆動。`requirements → design → tasks → 実装`、各フェーズ human 承認。`/kiro-impl` は**このセッションの Skill 一覧に無かった**ため、前任は **メインコンテキストで直接実装 → `kiro-review` スキルでレビューゲート** という流れを取った。同様に進めてよい。

参考にすべき**完成済みの同型実装**（コピー元）:
- `packages/db/src/seeds/skill-surveys/infrastructure-sre.ts`（最も近い。設計駆動・代表習熟度なしではないが構造同一）
- `packages/db/src/seeds/skill-surveys/frontend.ts`
- テスト: `packages/db/src/__tests__/infrastructure-sre-survey.integration.test.ts`
- 登録: `packages/db/src/seeds/index.ts`

## 3. 完了済み（EM spec）

すべて `.kiro/specs/engineering-manager-survey/` 配下。**spec.json は requirements/design/tasks すべて approved=true、phase=tasks-generated、ready_for_implementation=true**。

- `requirements.md` — 10 要件（R1〜R10）。承認済み。
- `design.md` — **設問設計表が設問の正本**。承認済み。要点:
  - jobType `'engineering-manager'`、title「エンジニアリングマネージャー スキルアンケート」。
  - **冒頭にカテゴリ「マネジメント経験プロフィール」**（displayOrder 0）: 3 設問（管理年数 / チーム規模 / manager-of-managers 経験）。すべて `single_choice`・`scoringKind` 無し・`isRequired=false`。
  - **10 コンピテンシーカテゴリ**: 各カテゴリ = breadth multi_choice **2問** + コンピテンシー習熟度 single_choice（`scoringKind='proficiency'`, level 0–3）**1問**。先頭 breadth に `isRequired=true`。
  - **自由記述 3問**（free_text・任意・scoringKind 無し）: ピープルマネジメント=難しい意思決定の学び / 育成・キャリア支援=印象的な育成事例 / 戦略・組織運営=マネジメント哲学。
  - 規模: **約36設問**（プロフィール3 + コンピテンシー10×3=30 + free_text3）。必須10、proficiency10。**この36設問規模でユーザー承認済み**（50+への拡張はしない方針で合意）。
  - **代表習熟度ペア（ツール選択方式）は不採用**（EM はツールが無いため。Non-Goals 明記）。
  - 標準習熟度ラベル: L0 未経験・知識なし／L1 学習・理解はある（実務経験なし）／L2 実務で実践したことがある／L3 設計・改善を主導／チームへ展開・標準化した。（IC の `infrastructure-sre.ts` の `PROFICIENCY_CHOICES` とほぼ同一だが L2 が「実装」→「実践」。EM では「実践」を使う）
- `research.md` — 設計判断ログ。承認済み。
- `tasks.md` — 4 メジャー / 6 サブタスク。**全タスク承認済み**。
  - 1.1 Foundation（型・survey ルート・冪等ランナー・index.ts 登録）
  - 2.1 プロフィール + 前半5コンピテンシー
  - 2.2 後半5コンピテンシー
  - 3.1 全件投入の通し確認
  - 4.1 統合テスト作成
  - 4.2 候補者フロー再利用検証（実画面 smoke。前任 3 本とも未実行＝既存コード再利用のため非ブロッキング）

### 10 コンピテンシーカテゴリと breadth の主旨（design.md の表より）
1. ピープルマネジメント: A=1on1・フィードバック・信頼構築 / B=モチベーション・心理的安全性・困難な会話 (+free_text)
2. 採用・チーム組成: A=採用要件・構造化面接・パイプライン / B=オンボーディング・チーム編成・D&I採用
3. 育成・キャリア支援: A=コーチング・メンタリング / B=キャリアラダー・後継者育成・強みベース役割設計 (+free_text)
4. パフォーマンスマネジメント: A=目標設定(OKR/MBO)・評価レビュー / B=報酬・昇進・ローパフォーマー対応・公平性
5. デリバリーマネジメント: A=スコープ・見積もり・優先順位 / B=リスク・依存管理・アジャイル運用・横断調整
6. 技術リーダーシップ: A=技術方針・アーキ判断・技術選定への関与 / B=品質/レビュー文化・技術的負債・標準策定
7. ステークホルダー・コミュニケーション: A=経営・PM・他部門連携 / B=期待値調整・交渉・影響力
8. 戦略・組織運営: A=ロードマップ・予算・リソース計画 / B=組織設計・目標カスケード・ビジョン浸透 (+free_text)
9. チーム文化・エンゲージメント: A=心理的安全性・エンゲージメント計測 / B=文化醸成・DEI・バーンアウト予防
10. プロセス・オペレーショナルエクセレンス: A=プロセス改善・生産性メトリクス(DORA/SPACE) / B=インシデント文化・オンコール方針・ナレッジ共有

## 4. 未完了（やること）

### Step 1: seed 実装
`packages/db/src/seeds/skill-surveys/engineering-manager.ts` を新規作成。
- `infrastructure-sre.ts` をコピーして構造を流用（型名 `EngineeringManagerSurveySeedData`、`choices()` ヘルパ、`PROFICIENCY_CHOICES`、`runEngineeringManagerSkillSurveySeed` ランナーは丸ごと同型）。
- design.md の設問設計表どおりに `categories` を埋める:
  - displayOrder 0 = マネジメント経験プロフィール（3 single_choice, scoring無, 非必須）
  - displayOrder 1〜10 = 各コンピテンシー（subcategory='コンピテンシー'）。questions = [breadth-A(required, multi), breadth-B(multi), 習熟度(single, scoringKind:'proficiency', choices:PROFICIENCY_CHOICES)]。free_text を持つカテゴリ(1,3,8)は末尾に free_text 設問を追加（choices:[]）。
- **重要**: 各 question の displayOrder はカテゴリ内 0..n-1 連番。各 choice も 0..n-1。
- breadth/プロフィール/free_text の choice には level を付けない（null）。proficiency のみ level 0-3。

### Step 2: 登録
`packages/db/src/seeds/index.ts` に追記（infrastructure-sre の直後）:
- 上部 export に `export { runEngineeringManagerSkillSurveySeed } from './skill-surveys/engineering-manager';`
- `main()` 内に動的 import と `await runEngineeringManagerSkillSurveySeed(db);`（`await runInfrastructureSreSkillSurveySeed(db);` の直後）

### Step 3: テスト
`packages/db/src/__tests__/engineering-manager-survey.integration.test.ts` を作成（`infrastructure-sre-survey.integration.test.ts` をコピー改変）。検証項目は tasks.md 4.1 と design.md Testing Strategy 参照:
- 冪等 / jobType・isActive・title / コンピテンシー10カテゴリ・プロフィールが displayOrder 先頭 / 各コンピテンシーに breadth multi と proficiency single 共存・proficiency計10・level 0-3 / isRequired計10・プロフィール非必須 / scoringKind=proficiency のみ / free_text存在し全て非必須 / 非回帰5seed共存
- ファイル名は必ず `*.integration.test.ts`（vitest include 条件）。型述語は `(k): k is NonNullable<typeof k> => k != null` を使う（`is string` だと tsc エラー）。

### Step 4: 検証（クリーン DB で）
```bash
export PATH="/Users/takaaki.tanno/.nvm/versions/node/v24.15.0/bin:$PATH"
cd <worktree>/packages/db
pnpm typecheck
pnpm exec eslint src/seeds/skill-surveys/engineering-manager.ts src/__tests__/engineering-manager-survey.integration.test.ts src/seeds/index.ts
# クリーン DB 作成
docker exec -e PGPASSWORD=dev_password docker-postgres-1 psql -U bulr -d bulr_dev -c "DROP DATABASE IF EXISTS bulr_em_test;"
docker exec -e PGPASSWORD=dev_password docker-postgres-1 psql -U bulr -d bulr_dev -c "CREATE DATABASE bulr_em_test;"
export DATABASE_URL='postgresql://bulr:dev_password@127.0.0.1:5434/bulr_em_test'
pnpm exec vitest run                 # 全統合テスト（非回帰確認、現状 61 件 + EM 分）
# 通し点検（件数・displayOrder・必須・proficiency）は SQL で（docker exec psql）
# 後始末: DROP DATABASE bulr_em_test
```
期待値の目安: category_objects≈11（プロフィール1+コンピテンシー10）, top_categories=11, questions≈36, required=10, proficiency_q=10, free_text=3。

### Step 5: レビュー → コミット
- `kiro-review` スキルで実装をレビュー（diff・テスト・境界を検証）。
- 承認後、**`/opt/homebrew/bin/git`** でコミット（メッセージ末尾に `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`）。先行コミット参考: frontend=`a4fd47e`, infra-sre=`6eb4638`。
- tasks.md のチェックボックスを `[x]` に（4.2 は未実行のため `[ ]` のまま）。spec.json を `phase: implemented` に。

### Step 6（任意・ユーザー依頼ベース）: dev DB 投入 + PR
- 前任は frontend/infra-sre とも、コミット後に dev DB へ投入し候補者一覧に出ることを確認した。EM も同様にユーザーが希望すれば:
  ```bash
  export DATABASE_URL='postgresql://bulr:dev_password@127.0.0.1:5434/bulr_dev'; export DIRECT_URL="$DATABASE_URL"
  pnpm exec tsx src/seeds/index.ts   # 全 seed 冪等投入
  ```
- PR は `gh pr create --repo nonnta-ww/bulr-app-mvp --base main`。リモートは `origin git@nonnta-ww:nonnta-ww/bulr-app-mvp.git`。**push は homebrew git で**。

## 5. 設計上の不変条件（壊さないこと）

- UI / Server Action / 管理画面 / 自己分析集計 / **DB スキーマ / `score_kind` enum は一切変更しない**（jobType 非依存基盤の再利用のみ）。マイグレーション不要。
- seed は全テーブル `onConflictDoUpdate`、id は初回生成後不変（`set` に id を含めない）。
- 候補者一覧は `apps/candidate/app/skill-survey/page.tsx` が `skillSurvey` の `isActive=true` を全件取得。新 survey は seed 追加だけで出現する。
- パッケージ依存方向 `apps → packages` を守る。

## 6. 既存メモリ（参照）

`/Users/takaaki.tanno/.claude/projects/.../memory/` に関連メモリあり:
- `project_frontend_survey.md`, `project_infrastructure_sre_survey.md`（同型の完了記録・落とし穴）
- `feedback_worktree_test_setup.md`, `feedback_drizzle_kit_env_resolution.md`
- 実装完了後は `project_engineering_manager_survey.md` を追加し MEMORY.md に1行追記すること。

## 7. ステータス要約

| 項目 | 状態 |
|---|---|
| spec（req/design/tasks） | ✅ 完了・全承認済み |
| seed 実装 (`engineering-manager.ts`) | ⬜ 未着手 |
| index.ts 登録 | ⬜ 未着手 |
| テスト | ⬜ 未着手 |
| kiro-review / コミット | ⬜ 未着手 |
| dev DB 投入 / PR | ⬜ 未着手（ユーザー依頼ベース） |
