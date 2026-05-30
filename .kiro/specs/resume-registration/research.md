# Research Log — resume-registration

## Discovery Scope

**Feature Type**: Extension（既存モノレポへの新機能追加）
**Discovery Type**: Light（既存 Blob 利用パターンの調査＋隣接 spec のインターフェース確認）

---

## 主要調査事項と知見

### 1. Vercel Blob の既存利用パターン

**調査対象**: `apps/business` パッケージの package.json, `assessment-engine` design.md

**知見**:
- `@vercel/blob ^0.27.3` が `apps/business` に導入済み
- `nanoid ^5` も `apps/business` に導入済み
- Stage 1 の Blob pathname は `interview-turn/{session_id}/{turn_id}.webm` 形式（security.md では `interview-turn/...` と記載）
- `interviews/` prefix は security.md の記述から出典だが実際のコードでは `interview-turn/` prefix を使用
- 本 spec の `candidates/` prefix とは競合しない

**実装への影響**:
- `apps/candidate/package.json` に `@vercel/blob ^0.27.3` と `nanoid ^5` を追加するだけで利用可能
- `put(pathname, file, { access: 'private' })` の API は `apps/business` と同じパターン

### 2. `requireCandidate` ガードと `candidate_profile` スキーマ

**調査対象**: `candidate-auth-onboarding` design.md, requirements.md

**知見**:
- `requireCandidate()` は `packages/auth/src/guards.ts` に追加される（`candidate-auth-onboarding` が実装）
- 戻り値: `{ user: User, session: Session, candidateProfile: CandidateProfile }`
- `candidate_profile.id` は nanoid の `text` 型（PK）
- `@bulr/auth/server` サブパスから re-export される

**実装への影響**:
- 本 spec の全 Server Action は `requireCandidate()` を先頭で呼ぶ
- `candidate_profile_id` は `candidateProfile.id` から取得する

### 3. `candidateAction` wrapper の有無

**調査対象**: `packages/auth/src/safe-action.ts`

**知見**:
- 現在 `authedAction` と `adminAction` のみ存在
- `candidateAction` は `candidate-auth-onboarding` spec の実装後に追加される可能性がある
- 現時点では `authedAction` 内で `requireCandidate()` を呼ぶパターンで実装する

**実装への影響**:
- Server Action は `authedAction` ラッパーを使いつつ内部で `requireCandidate()` を呼ぶ
- または `requireCandidate()` を直接呼ぶ `try/catch` パターンでも可

### 4. `turbo.json` の build.env

**調査対象**: `/turbo.json`

**知見**:
- `BLOB_READ_WRITE_TOKEN` は既に `build.env` に含まれている
- 本 spec で追加変更は不要

**実装への影響**:
- `turbo.json` の変更は不要（確認のみタスクに含める）

### 5. DB スキーマバレルの現状

**調査対象**: `packages/db/src/schema/index.ts`

**知見**:
- `candidate-profile.ts` のエクスポートは `candidate-auth-onboarding` が追加する
- 本 spec は `resume-document.ts` のエクスポートを追加する
- `candidate-auth-onboarding` が先に実装完了していることが前提

---

## Architecture Pattern Evaluation

### Blob アップロード方式の評価

| オプション | 評価 | 採用理由 |
|-----------|------|---------|
| クライアント直接 Blob アップロード | ❌ | `BLOB_READ_WRITE_TOKEN` がクライアントに漏れる |
| Server Action 経由 Blob アップロード | ✅ | トークン漏洩なし、MIME/サイズ検証もサーバーで完結 |

### Blob ヘルパー配置の評価

| オプション | 評価 | 採用理由 |
|-----------|------|---------|
| `packages/lib` に配置 | ❌ | apps → packages の単方向原則。candidate 専用なのに共有 packages に置く必要なし |
| `apps/candidate` 内に配置 | ✅ | 候補者専用、packages 汚染なし。将来 business 側でも必要になれば共有を検討 |

### primary フラグの整合性保証

| オプション | 評価 | 採用理由 |
|-----------|------|---------|
| DB UNIQUE 制約（partial index） | 中 | PostgreSQL の partial unique index で可能だが Drizzle での定義が複雑 |
| アプリ層 atomic UPDATE | ✅ | DB トランザクション内で全件 false → 対象を true の2 UPDATE。シンプルで確実 |

---

## 設計決定と根拠

1. **物理削除の順序（Blob 先・DB 後）**: Blob 削除が DB より先。Blob 削除成功 → DB 削除失敗はまれで再試行可能。DB 削除成功 → Blob 削除失敗は孤児ファイルが残り発見困難。より重篤な後者を防ぐ順序を採用。

2. **Wave 3 削除制約の明示**: MVP では `entry` が存在しないため FK 制約なしで削除を許可。Wave 3 で `entry.resume_document_id` FK 追加時に `ON DELETE RESTRICT` または `ON DELETE SET NULL` の選択が必要。この判断は `entry-flow` spec に委ねる。

3. **`blob_url` と `blob_pathname` の両保存**: `blob_url` は表示・ログ用、`blob_pathname` は `del()` / `head()` の引数として必要。SDK が両方返すため両方保存する。
