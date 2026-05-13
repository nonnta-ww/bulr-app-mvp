# CI ワークフロー

対象タスク: task 2.11

---

## `.github/workflows/ci.yml` の構成

### トリガ

```yaml
on:
  pull_request:
    types: [opened, synchronize]
  push:
    branches: [main]
```

- `pull_request`（opened / synchronize）: PR 作成・更新時に実行
- `push` の `branches: [main]`: main ブランチへの直接プッシュ時に実行

### ジョブステップ

| ステップ | 内容 |
|---|---|
| Checkout | リポジトリをチェックアウト |
| pnpm セットアップ | `pnpm/action-setup` で pnpm をセットアップ |
| Node 22 セットアップ | `actions/setup-node` で Node.js 22 をセットアップ |
| pnpm install | `pnpm install --frozen-lockfile` で依存関係をインストール |
| pnpm typecheck | `pnpm typecheck` で TypeScript 型チェックを実行 |
| pnpm lint | `pnpm lint` で ESLint を実行 |
| pnpm audit | `pnpm audit --audit-level=moderate` でセキュリティ脆弱性チェックを実行 |

> **本 CI はシークレットを必要としない（外部接続なし）。** typecheck・lint・audit はすべてローカルで完結するため、Vercel や Neon などのクレデンシャルなしで実行できる。

---

## PR レビュー時の確認事項

PR をマージする前に以下を確認する。

1. **"all checks passed"** になっていること
   - GitHub PR ページの Checks タブで全ジョブが緑になっていること

2. **`pnpm audit` で moderate 以上の新規脆弱性が検出されていないこと**
   - audit ジョブのログを確認し、`moderate` / `high` / `critical` の脆弱性が新たに追加されていないこと
   - 既存の脆弱性が残っている場合は別途 Issue で管理する

---

## 完了確認方法

| 確認項目 | 確認箇所 |
|---|---|
| CI が PR 時に自動実行されること | テスト PR を作成して GitHub Actions が起動することを確認 |
| 全ステップが成功すること | GitHub Actions のログで全ジョブが緑になること |
| main へのプッシュ時にも実行されること | main へのマージ後に Actions タブで実行を確認 |
