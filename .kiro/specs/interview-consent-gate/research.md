# Gap Analysis — interview-consent-gate

- 日付: 2026-07-11
- 対象要件: `.kiro/specs/interview-consent-gate/requirements.md`
- 種別: brownfield（既存 `realtime-interview-capture` 資産への統合）

## 1. Current State Investigation（現状調査）

### 同意まわりの既存資産（想定より配線済み）

| 資産 | 場所 | 現状 |
|---|---|---|
| スキーマ `consent_obtained_at` / `consent_version` | `packages/db/src/schema/interview-session.ts:41-44` | `notNull().defaultNow()` / `notNull().default('ja-v1')`。**vacuous の発生源** |
| ゲート本体 | `apps/business/.../_actions/start-capture.ts:113` | `if (consent_obtained_at === null)` で拒否（`CONSENT_REQUIRED`）。**到達不能なデッドコード** |
| 自動同意の付与元 | `apps/business/lib/actions/create-session.ts:86-87` | セッションを `status:'in_progress'` で作成し、**consent 列に触れず defaultNow に委ねて自動同意**。コメントが旧 `Requirement 3.8/3.9` を引用 |
| read-path UI 配線（**完成済み**） | `interviews/[sessionId]/page.tsx:72-74` → `live-capture-runner.tsx:135,214` → `capture-start-panel.tsx` | `consentObtained = consent_obtained_at !== null` を算出し prop で伝播。パネルは `!consentObtained` で開始系ボタンを全て `disabled`（201/210/239/266/287）＋ `CONSENT_ERROR` alert 表示（178-185） |
| 同意記録の読み取り（admin） | `apps/admin/app/sessions/[id]/page.tsx:214-215` / `apps/admin/app/_lib/json-export.ts:22-23,85-86` | 詳細画面で「同意取得日時／同意バージョン」を表示。json-export は既に `string | null` 型で null 対応済み |

### 規約・パターン

- **db enum**: `pgEnum('capture_provider', ['recall','mic'])` 等（`interview-session.ts:15-17`）。`consent_method` enum も同パターンで追加可能。
- **migration**: drizzle 連番。最新 `0022_broad_bloodstrike.sql` → 次は **0023**。メモリ [drizzle-kit env resolution gotcha] の DIRECT_URL/DATABASE_URL inline 上書きに従う。
- **Server Action**: `apps/business/lib/actions/*`（`create-session.ts` が範例）。認可は `requireSessionOwnership`（start-capture が使用）。メモリ [Server Action / DB error handling gotchas] の二重ラップ／冪等の作法に従う。
- **依存方向**: 同意文（ブランド/文面）は package でなく `apps/business` ローカル（メモリ [package dependency direction]）。
- **テスト**: 各 `_actions` / `lib/capture` に `*.test.ts` 同居。worktree では vitest 直列（メモリ [worktree test setup] / [CI ジョブ構成]）。

## 2. Requirement-to-Asset Map（要件↔資産マップ）

| 要件 | 既存資産 | ギャップ | タグ |
|---|---|---|---|
| R1 同意ゲート | start-capture.ts:113 の null 分岐＋パネル disable | スキーマを nullable 化すればゲートが**無改修で有効化**。UI disable も既存 | **Constraint**（スキーマ反転が前提） |
| R2 面接官アテステーション | パネルの `!consentObtained` ブロック（178）は現状「エラー表示」のみ | 同意文提示＋明示チェック＋確定→記録の**同意ステップUIと書き込み動線が不在** | **Missing** |
| R3 記録内容/provenance | `consent_obtained_at`/`consent_version` のみ | `consent_method`（enum）/`consent_actor_id`（text）が**未追加** | **Missing** |
| R4 版管理された同意文 | `consent_version` 列と admin 表示のみ | 同意文の**実体テキスト・版registry・提示UIが不在** | **Missing** |
| R5 既存/新規の整合 | create-session.ts が自動同意 | **自動同意の停止**＋既存行 null 化 migration が必要。旧 rtic Req 3.8/3.9 と**衝突（本 spec が supersede）** | **Constraint** |
| R6 権限/冪等 | `requireSessionOwnership` 既存 | `recordConsent` の**冪等な原子的 set が未実装** | **Missing** |

## 3. Implementation Approach Options

### Option A: 既存パネル拡張（推奨）

`capture-start-panel.tsx` の既存 `!consentObtained` ブロック（178）を、単なるエラー表示から**同意ステップ**（同意文表示＋「候補者から録音同意を口頭で得た」チェック＋確定ボタン → `recordConsent` 呼び出し）へ拡張する。read-path 配線（page→runner→panel の `consentObtained`）と disable ロジックは既存を再利用。

- ✅ read-path 完成済み・新規ファイル最小・既存パターン踏襲
- ✅ 「同意→開始」が同一画面で自然
- ❌ パネルの責務がやや増える（同意取得＋キャプチャ開始）

### Option B: 独立した同意ステップ（新規コンポーネント）

キャプチャ画面前に専用の同意ステップ/モーダルを新設し、確定後にパネルへ遷移。

- ✅ 責務分離が明確・単体テスト容易
- ❌ 既存 read-path 配線と二重管理・遷移設計が増える・MVP には過剰

### Option C: ハイブリッド（今回は不要）

同意文 registry を独立ユニット化しつつ UI は A、を将来の候補者セルフ同意で B 化。**今回は A＋文書registryの薄い分離**で足り、フル C は将来判断。

## 4. Effort & Risk

- **Effort: S（1–3 日）** — スキーマ変更＋ migration（0023）、`recordConsent` action、パネルの同意ステップ化、同意文 registry の4点。read-path が既存のため増分は小さい。
- **Risk: Low〜Medium** —
  - Low: 既存パターン踏襲・スコープ明快。
  - Medium 要素: (1) **既存行 null 化 migration の影響**（テストデータのみだが admin 表示の null 経路確認要）、(2) **create-session.ts の自動同意停止**が rtic の旧要件を supersede する整合作業、(3) admin 詳細画面 `consent_version` 直描画の null 対応（`consent_version` を nullable にする場合）。

## 5. Recommendations for Design Phase

### 推奨方針
- **Option A**（既存パネルの `!consentObtained` ブロックを同意ステップ化）＋ 同意文を app ローカル registry で薄く分離。
- スキーマ: `consent_obtained_at` を nullable＋default 撤去、`consent_method` enum（`['interviewer_attestation']`、将来 `candidate_self_service` 追加余地）と `consent_actor_id` text を追加、migration 0023 で既存行の `consent_obtained_at` を null 化。
- `consent_version`: **notNull default 'ja-v1' を維持**し、`recordConsent` で提示版を再確認 set する案が admin/migration 影響最小（R3.2/R4.3 は満たせる）。nullable 化するなら admin 詳細の null 描画対応を同時に。

### 再検証トリガー（設計で Boundary Commitments 化）
- `create-session.ts`: 自動同意の停止（consent 列に触れず null で作成）。旧コメント「Requirement 3.8/3.9」の supersede を明記。
- `apps/admin`（詳細画面 / json-export）: consent 列 nullable 化に伴う表示確認。新規 `consent_method`/`consent_actor_id` の admin 表示は**任意拡張**（本 spec 必須外）。
- `realtime-interview-capture` の Req 1.6 / Req 7.5 が本 spec で初めて実効化される旨を design に記録。

### Research Needed（設計/実装で確認）
- `formatTimestamp`（admin 詳細）が `null` を安全描画するか（既存 json-export は null 対応済みのため軽微）。
- `create-session.ts` 以外に `interview_session` を挿入する経路が無いか（session-from-entry 系のセッション生成箇所の網羅確認）。
- 同意文 ja-v1 の**文言確定は法務タスク（コード外）**。実装は版キー＋プレースホルダ文書で進め、文言差し替え可能に。
