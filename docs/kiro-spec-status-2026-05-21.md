# Kiro スペック ステータス（2026-05-21 時点）

> 本ファイルは特定時点の Kiro スペック進捗スナップショット。最新ステータスは `/kiro-spec-status` で再生成可能。
>
> 計測元:
>
> - `.kiro/specs/<spec>/spec.json` の `phase` フィールド
> - `.kiro/specs/<spec>/tasks.md` のチェックボックス (`- [x]` / `- [ ]`) と heading-✅ マーカー (`### ✅`)

## 全スペック概況

| スペック                   | 依存順 | phase              | 進捗           |
| -------------------------- | ------ | ------------------ | -------------- |
| `monorepo-foundation`      | 1      | ✅ implemented     | 26/26 (100%)   |
| `multi-env-infrastructure` | 2      | 🟡 implemented     | 28/36 (77%)\*  |
| `authentication`           | 3      | 🟡 implemented     | 20/33 (60%)\*  |
| `assessment-pattern-seed`  | 4      | 🟢 implemented     | 21/22 (95%)\*\* |
| `assessment-engine`        | 5      | 🟡 tasks-generated | 50/58 (86%)    |
| `admin-review-panel`       | 6      | ⬜ tasks-generated | 0/30 (0%)      |
| `interview-sse-progress`   | —      | 🟡 tasks-generated | 8/10 (80%)     |

> `*` 親チェック未更新 + production 関連の deferred タスク含む
>
> `**` 9.5 (production 投入手順) は `⏭️` 意図的スキップ（local Docker Postgres で進行中、production rollout 時に Owner が一括実施）

**phase の凡例**: `implemented` = 完了宣言済み、`tasks-generated` = 実装中

## 注目ポイント

- **`monorepo-foundation` のみが完全完了**（100% + phase=implemented）
- **`authentication` / `multi-env-infrastructure` は phase=implemented なのにタスク未消化が残る** — チェックボックスがサブタスク粒度で残っている。spec.json は完了扱い、残タスクは E2E 検証 / 個別フォロー扱い
- **`assessment-pattern-seed`** は 1 タスク残しでほぼ完了（95%）。残 1 は意図的スキップ
- **`assessment-engine`** は中核機能で 8 タスク残（86%）。`admin-review-panel` のブロッカー
- **`admin-review-panel`** は 0% で着手前。`assessment-engine` 完了待ち
- **`interview-sse-progress`** はロードマップ外の追加スペック。2 タスク残（80%）

## ボトルネック / ブロッカー

- **`admin-review-panel` (30 タスク) は `assessment-engine` 完了が前提**。assessment-engine の残 8 タスクを片付けないと着手不可
- **`authentication` の未消化 13 タスク** — phase が implemented と矛盾。実態を確認した方が安全

## 推奨される次アクション

優先順に：

1. **`assessment-engine` 残 8 タスクを片付ける** — 中核機能、最大の進捗インパクト。`admin-review-panel` 着手解除にもなる
2. **`interview-sse-progress` 残 2 タスク** — 短時間で 100% にできる
3. **`assessment-pattern-seed` 残 1 タスク + `authentication` / `multi-env-infrastructure` の phase 整合確認** — 状態を正しく揃える掃除作業

## 2026-05-21 セッションで実施した整合作業

- `interview-sse-progress` Task 4.1 (E2E 動作確認シナリオ) を [x] にマーク、`phase` を `implemented` に更新
- `authentication` 親タスク 1〜6 を [x] にマーク（子サブタスクは全て完了済みだった）
- `multi-env-infrastructure` 5.7 (ローカル開発環境セットアップ) を [x] にマーク、5.1〜5.6 を production rollout 時に deferred するノートを追記
- 関連コミット: `363187b`, `270967a`

## 未完了の残タスク（参考）

### `authentication` 7.x — E2E 検証（要実施）

ローカル / production 統合動作確認。詳細チェックリストは `docs/setup/auth-e2e-checklist.md` を参照。

- 7.1 ローカル Magic Link サインイン E2E
- 7.2 Magic Link 期限切れ・使い切り
- 7.3 Magic Link レート制限
- 7.4 proxy.ts UX リダイレクト + Basic 認証
- 7.5 `/admin/_health` 3 ケース
- 7.6 多層防御（CVE-2025-29927 シミュレーション）

### `multi-env-infrastructure` 5.1〜5.6 — production cloud setup（deferred）

production rollout 直前に Owner が一括実施。`assessment-pattern-seed` 9.5 と同タイミング。

### `assessment-engine` G9.x — 手動 E2E 検証

- G9.2 自己面接 1 件完走（最重要）
- G9.3 Vercel Cron 音声削除 手動 trigger
- G9.4 セキュリティヘッダー
- G9.5 レート制限
- G9.6 smoke test 削除
- G9.7 冪等性 + Core/Prepare 分離
- G9.8 パターン遷移時集約 (Prepare-1a)
- G9.9 全ターン話者分離 (Requirement 25)
