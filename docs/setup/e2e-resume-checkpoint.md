# E2E 再開チェックポイント（2026-05-15）

> 再起動・コンテキスト消失後にこの文書だけ読めば G9.2（自己面接 E2E）を再開できるようまとめたメモ。
> 役目: 「いまどこまで進んだか」「次に何をやるか」「設定の選択肢」を一望できる。

---

## いまの状態（最新コミット: `4f78956`）

### ✅ コード上で完了している項目

| カテゴリ | 内容 | 関連コミット |
|---|---|---|
| 実装 | assessment-engine の全実装タスク (G0-G8) 完了、`pnpm typecheck` / `pnpm lint` クリーン | `7de7b7f` まで |
| Phase 1 修正 | 仕様照合レビューで検出した**E2E ブロッカー 4 件**（questionSource enum 不一致、proposalId/patternId 未送信、off_pattern→null 化、レート制限事前チェック）+ セキュリティヘッダー追加 | `41de5ec` |
| Phase 2 修正 | LLM 層の `createLlmContext` 統一・`buildSystemPrompt` 全関数注入・ダミー ctx 廃止・`LlmAnalysis` 型補強 | `551e924` |
| インフラ | Docker ポートを他プロジェクトと衝突しないよう変更（postgres 5434, mailpit 1026/8026） | `5436ed7` |
| ローカル開発 | ストレージ抽象化（Vercel Blob ↔ ローカル FS 切替）+ Whisper Docker サービス追加 | `faa8a5f`, `35e7f99` |
| バグ修正 | CSP の `unsafe-eval` を dev 限定に / MIME validation で codecs パラメータ無視 | `f2fccb3`, `4f78956` |

### ⚠️ E2E 実行で詰まったポイント

1. **最初の MIME エラー**（`audio/webm;codecs=opus` を拒否） → 修正済み (`4f78956`)
2. **Docker Desktop ハング**（Whisper small モデルがメモリを食い潰し、postgres も応答不能に） → **再起動が必要**
3. **G9.2 自己面接 E2E は未完走**

---

## 再起動後の作業手順

### Step 1: Docker Desktop 起動 + メモリ割当の見直し

```bash
open -a Docker
```

起動完了したら、Docker アイコン → **Settings** → **Resources** → **Memory** を確認:

- 現状が **4-8GB** なら → **12GB 以上**に変更（Whisper small モデル用）
- 物理メモリ 16GB 未満なら Docker に多く割けないので、Whisper はクラウド利用に倒す（後述）

`Apply & Restart` で Docker Desktop が再起動。

### Step 2: 実行戦略の選択

下記 3 つから 1 つ選ぶ。

#### A. ローカル完結（メモリ余裕がある場合）

Docker メモリ 12GB 以上、`base` モデル（150MB / メモリ約 1GB）で運用:

```dotenv
# .env.local
ANTHROPIC_API_KEY=sk-ant-...           # 必須
WHISPER_PROVIDER=local-docker
WHISPER_MODEL=base                     # ← small から base に下げる
BLOB_STORAGE_PROVIDER=local-fs
```

```bash
# 全コンテナ起動
docker compose -f docker/compose.yml up -d
```

`base` モデルは日本語精度がやや落ちるが E2E 検証には十分。

#### B. ハイブリッド（推奨）

ストレージはローカル、Whisper はクラウド（OpenAI）:

```dotenv
# .env.local
ANTHROPIC_API_KEY=sk-ant-...           # 必須
OPENAI_API_KEY=sk-...                  # ← 追加で設定
WHISPER_PROVIDER=openai                # ← local-docker から openai に変更
BLOB_STORAGE_PROVIDER=local-fs
```

```bash
# whisper コンテナは起動しない
docker compose -f docker/compose.yml up -d postgres mailpit
```

メモリ消費が少なく動作が安定。E2E では音声 1 分以下なら 1 回あたり数円。

#### C. クラウド完結（本番相当の検証）

```dotenv
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
WHISPER_PROVIDER=openai
BLOB_STORAGE_PROVIDER=vercel-blob
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... # Vercel ダッシュボードから取得
```

Vercel アカウントが必要。本番に近い検証だが、ローカル開発の利点は薄れる。

### Step 3: コンテナ起動 + dev サーバ起動

選んだ戦略に応じてコンテナを起動:

```bash
cd /Users/takaaki.tanno/Documents/workspace/github/bulr-app-mvp

# 戦略 A の場合
docker compose -f docker/compose.yml up -d

# 戦略 B または C の場合（whisper を除外）
docker compose -f docker/compose.yml up -d postgres mailpit

# 起動確認
docker ps                           # postgres / mailpit / (whisper) が Up であること
docker exec docker-postgres-1 pg_isready -U bulr   # accepting connections が返ること
```

dev サーバ起動:

```bash
pnpm dev   # http://localhost:3020
```

### Step 4: G9.2 自己面接 E2E

http://localhost:3020/sign-in にアクセス:

1. メールアドレス入力 → Magic Link 送信 → Mailpit (http://localhost:8026) でメール受信 → リンクをクリック
2. `/interviews` → 「新規セッション作成」
3. `/interviews/new` → 候補者情報入力（自分の名前 / "Backend Engineer" / 「Backend 5 年、N+1 経験あり、AI 活用経験あり」等）
4. `/interviews/[sessionId]` で録音開始 → 質問に回答 → [次の質問へ]
   - **初回ターンは Whisper モデルダウンロードで 30-60 秒かかる**（戦略 A の場合）
   - ストレージは `apps/web/tmp/audio/interview-turn/{sessionId}/{turnId}.webm` に保存
5. 状態 B で候補①②③ いずれかを選択 → 状態 A に戻る
6. 5-10 ターン繰り返す（うち 1 回は [自分で次を聞く] でフリー質問）
7. [面接終了] → `/interviews/[sessionId]/report` でレポート確認

### Step 5: 確認ポイント

DevTools / DB で以下を確認:

| 項目 | 期待値 |
|---|---|
| `/api/interview/turns/next` ステータス | 200（503 は core_phase_failed） |
| FormData の `questionSource` | `'llm_candidate_1\|2\|3'` または `'manual'` |
| `interview_turn.pattern_id` | パターン選択時は assessment_pattern.id、フリー質問時は NULL |
| `interview_turn.transcript` | `{ interviewer, candidate, raw }` 3 フィールド分離 |
| `pattern_coverage` の `level_reached` | 0-4 の整数（詰まり判定時の値） |
| レポート画面の `summary_text` | 採用推奨表現が含まれない（Req 13.6） |

DB 確認は `pnpm db:studio`（drizzle-kit Studio）または `psql postgresql://bulr:dev_password@localhost:5434/bulr_dev`。

---

## トラブルシューティング

### Docker が再びハングした場合

1. メニューバー Docker アイコン → Quit Docker Desktop
2. 反応しなければ Activity Monitor で `Docker Desktop` / `com.docker.backend` / `qemu-system-aarch64` を Force Quit
3. `open -a Docker` で再起動
4. Whisper を `base` または `tiny` に下げる、または **戦略 B** に切替

### Postgres に繋がらない

```bash
docker compose -f docker/compose.yml restart postgres
docker exec docker-postgres-1 pg_isready -U bulr
```

それでもダメなら `pnpm db:reset`（**データが消える**）。

### dev サーバが pending で固まる

ほぼ確実に DB 応答不能。Docker → postgres の順で再起動 → `pnpm dev` も再起動。

### Whisper モデルダウンロードが終わらない

初回のみ 30-60 秒（small）/ 10-20 秒（base）。それ以上経っても応答が無い場合:

```bash
docker logs docker-whisper-1 | tail -30
```

進捗が止まっていたら Docker メモリ不足。`WHISPER_MODEL=base` に変更してコンテナを再作成:

```bash
docker compose -f docker/compose.yml up -d --force-recreate whisper
```

---

## 関連ファイル早見表

| 用途 | パス |
|---|---|
| ローカル環境変数 | `.env.local`（gitignore） |
| Docker compose | `docker/compose.yml` |
| ストレージ抽象化 | `apps/web/lib/audio/storage*.ts` |
| Whisper 抽象化 | `packages/ai/src/whisper/transcribe*.ts` |
| メイン API | `apps/web/app/api/interview/turns/next/route.ts` |
| 面接 UI | `apps/web/app/(interviewer)/interviews/_components/interview-session-runner.tsx` |
| 仕様 | `.kiro/specs/assessment-engine/{requirements,design,tasks}.md` |
| ローカル開発全般 | `docs/setup/local.md` |

---

## E2E 完走後にやること

1. `.kiro/specs/assessment-engine/tasks.md` の G9.2 を `✅` に
2. 余裕があれば G9.3-G9.9（Cron / セキュリティヘッダー / レート制限 / 冪等性 / パターン遷移 / 話者分離 の手動検証）
3. `/kiro-validate-impl assessment-engine` で最終 GO 判定

---

## 仕様照合レビューで未対応の低優先度項目

参考: assessment-engine の品質をさらに上げたい場合の改善余地。E2E ブロッカーではない:

- **D1**: schema (snake_case) と design.md 擬似コード (camelCase) の整合 — design 側を更新する想定
- **O1/O2**: `packages/types` の `PatternCategory` 重複定義 / `HeatmapData.by_category` を `Record<string, ...>` に緩和
- AI/LLM レビュー指摘: `splitInterviewerCandidate` フォールバックログに turnId 含める、`SAFE_PROPOSAL_FALLBACK` の文言を Req 14.6 と完全一致させる、等

Stage 1 リリース観点では着手不要。Stage 2 でまとめて対応する候補。
