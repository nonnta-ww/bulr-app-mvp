# Gap Analysis — realtime-interview-capture

> 生成: 2026-06-11 / 入力: requirements.md（8 要件・43 受け入れ基準）、steering（product / tech / structure / security / assessment-design）、コードベース調査、外部ベンダー調査

## 1. 現状調査（Current State）

### 流用可能な既存資産

| 領域 | 資産 | 場所 |
| --- | --- | --- |
| 面接 UI | セッションランナー（useReducer、recording/choosing/finalizing モード）、録音管理、アジェンダサイドバー群（パターン行・候補ピッカー・解析ストリップ・結果ドロワー） | `apps/business/app/(interviewer)/interviews/_components/` |
| SSE 基盤 | POST 応答の ReadableStream SSE + 型付きイベント + クライアントパーサ | `apps/business/lib/interview/turns-next-events.ts`, `parse-sse-stream.ts`, `_components/agenda/use-analysis-tasks.ts` |
| ターン処理 API | 音声受信 → Blob 保存 → 文字起こし → LLM 分析 → DB insert → SSE | `apps/business/app/api/interview/turns/next/route.ts` |
| finalize | 未集約カバレッジ集約 → レポート生成 → ヒートマップ → status 更新 | `apps/business/app/api/interview/finalize/route.ts` |
| LLM 5 関数 | analyzeTurn（pattern_match_confidence / matched_pattern_id / stuck_signal 内蔵）、splitInterviewerCandidate、proposeNextQuestions（next_pattern 1 件保証）、aggregatePatternCoverage、generateSessionReport。全て generateObject + Zod + セッション束縛 ctx | `packages/ai/src/functions/` |
| STT 抽象化 | `WHISPER_PROVIDER` env による provider factory（openai / groq / local-docker）— バッチのみ | `packages/ai/src/whisper/transcribe.ts` |
| 音声ストレージ | `BLOB_STORAGE_PROVIDER` factory、30 日 expiry、削除 Cron（CRON_SECRET Bearer 検証） | `apps/business/lib/audio/blob-client.ts`, `app/api/cron/audio-purge/route.ts` |
| レート制限 | DB `rate_limit` テーブル UPSERT 方式。`llm:<sessionId>` 100 回/日 上限 | `packages/lib/src/rate-limit.ts` |
| スキーマ | interview_session（status enum: draft/in_progress/completed/abandoned、consent_obtained_at/consent_version、planned_pattern_codes、entry_id）、interview_turn（transcript JSON `{interviewer?, candidate, raw}`、audio_key、llm_analysis）、question_proposal（3 候補 + selected_index）、pattern_coverage、session_report。最新 migration: 0014 | `packages/db/src/schema/` |
| 認証・統制 | requireUser / requireSessionOwnership / authedAction、Zod 全入力検証、同意記録 | `apps/business/lib/` |

### アーキテクチャ制約（Constraint）

- **Vercel serverless**: inbound WebSocket 不可。関数実行時間上限（Hobby プラン想定）により、60 分の常時接続 1 本では成立しない。既存のリアルタイム手段は「POST 応答 SSE」のみで、**サーバ → クライアントへの push チャネルが存在しない**
- **inbound webhook の前例なし**: 外部サービスからの callback 受信は未実装（Cron の Bearer 検証のみ）。ボットベンダー webhook の署名検証・リトライ処理は新規パターン
- **クライアント状態集中**: 面接の進行状態が `interview-session-runner.tsx` の useReducer に集中。リロード復元（Req 8.2）にはサーバ側（DB）を真実源とする再設計が必要
- **LLM 上限 100 回/セッション**: ライブ解析は従来（手動ターン区切り）より呼び出し頻度が上がるため上限と頻度制御の再設計が必要（Req 4.5 と整合）
- **LLM コスト記録は mock_interview のみ**: 面接セッションの LLM コストは未記録（admin 監視の対象外）
- **モノレポ規約**: apps → packages 単方向依存。新規 env は `turbo.json` build.env への列挙必須

### 外部ベンダー調査（要点）

- **ミーティングボット**: [Recall.ai](https://www.recall.ai/) が Zoom / Google Meet / Teams を単一 API でカバー。リアルタイムトランスクリプトは **webhook 配信**、参加者別音声は WebSocket 配信。料金は録音 $0.50/h（秒割り）+ 内蔵文字起こし $0.15/h、録音保管は 7 日無料・以後 $0.05/h/30日（[料金](https://www.recall.ai/pricing)）。代替: firstcall.dev（$0.35/h）、Vexa（OSS / self-host）
- **ストリーミング STT**: [Deepgram Nova-3](https://developers.deepgram.com/docs/models-languages-overview) が日本語ストリーミング + `diarize=true`（streaming diarization）対応を確認。2026-03 の更新で streaming WER ~21% 改善（[Deepgram](https://deepgram.com/learn/deepgram-expands-nova-3-with-11-new-languages-across-europe-and-asia)）。代替候補（AssemblyAI / Gladia / Speechmatics）の日本語ストリーミング品質は設計時に要比較

## 2. 要件 → 資産マップ

| 要件 | 既存資産 | ギャップ種別 | 内容 |
| --- | --- | --- | --- |
| 1.1–1.4 ボット参加 | なし | **Missing** | ボットベンダー連携クライアント、会議 URL 検証、参加状態管理、webhook 受信エンドポイント（署名検証含む）が全て新規 |
| 1.5 対面録音 | recording-state.tsx（MediaRecorder） | 改修 | ターン区切り録音 → 連続録音＋逐次送信へ変更 |
| 1.6–1.7 同意・状態 | consent_obtained_at / status enum | 流用 | 変更なし |
| 2.1 10 秒以内のライブ表示 | なし | **Missing** | webhook → 永続化 → クライアント配信の push/poll チャネル新設（Vercel 制約下） |
| 2.2–2.3 話者分離 | splitInterviewerCandidate（LLM 推定） | 置換 | STT 側 diarization ＋ボットの話者メタデータで代替。LLM 分離は対面フォールバックに残置候補 |
| 2.5–2.6 STT 障害耐性 | なし | **Missing** | 再接続制御、未処理区間の事後バッチ文字起こし（既存 Whisper バッチを再利用可） |
| 2.7 音声保存・30 日削除 | blob-client + audio-purge cron | 改修 | per-turn 音声 → セッション単位録音への保管モデル変更。ボット録音のベンダー側保管との整合（Research） |
| 3.1–3.4, 3.8 サイドパネル | agenda コンポーネント群 | 改修 | UI 素材は流用可。ただし「操作で進む」前提の runner / 状態A/B は置き換え |
| 3.5–3.6 操作ゼロ・使用質問の自動判別 | question_proposal.selected_index（手動選択） | **Missing** | 提示候補と実際の発話の照合（会話からの自動判別）は新規ロジック |
| 3.7 フリー質問 | pattern_id=null の既存運用 | 流用 | 分類入口が自動化されるのみ |
| 4.1 ターン自動分割 | なし | **Missing** | 話者交代＋無音閾値＋（必要なら）LLM 判定による「論理ターン」セグメンテーション。品質が評価精度を左右する本機能の核 |
| 4.2 パターン自動分類 | analyzeTurn の matched_pattern_id | 流用・小改修 | 既存出力をそのまま利用可能 |
| 4.3–4.4 カバレッジ集約・出力形式維持 | aggregatePatternCoverage / 既存スキーマ | 流用 | 完了判定トリガの変更のみ。interview_turn を「論理ターン」の書き戻し先として維持すれば管理画面も無改修 |
| 4.5 解析上限 | rate-limit | 改修 | 上限値・キー設計の見直し |
| 5.1–5.3 終了・レポート | finalize API | 流用・小改修 | ボット退出指示・会議終了 webhook の接続を追加 |
| 5.4 トランスクリプト閲覧 | admin の回答全文確認 | 小規模 Missing | 面接官向けセッション詳細への話者ラベル付き全文表示 |
| 6.1–6.4 互換 | read 系一式 | 流用 | 旧データは既存スキーマのまま閲覧可。新 UI への一本化は runner 置換で達成 |
| 7.x 統制 | guards / Zod / 30 日削除 / 同意 | 流用・小改修 | webhook 入力の Zod 検証・署名検証を追加 |
| 8.1–8.2 60 分・リロード復元 | なし（クライアント状態集中） | **Missing（構造変更）** | 進行状態の真実源を DB へ移し、画面は再取得で復元 |
| 8.3 対面オフライン耐性 | なし | **Missing** | ブラウザ側チャンクバッファリングと再送 |

## 3. 実装アプローチ選択肢

### Option A: 既存 turns/next パイプライン拡張

ターン単位処理を維持し、入力だけライブセグメントに差し替える（turns/next に「セグメント入力モード」を追加）。

- ✅ DB・管理画面・評価関数がほぼ無改修。最速
- ❌ turns/next は「音声 blob 受信」前提の構造で、webhook 駆動・push 配信・セグメンテーションは結局別途必要。既存ルートが肥大化し状態A/B 前提も残る
- 評価: ライブ化の本質的ギャップ（push チャネル、ターン分割）を解決しないため**単独では不成立**

### Option B: キャプチャ層を全面新規構築

capture 概念（ボット連携・webhook ingestion・transcript_segment テーブル・live-state 配信・新サイドパネル）を新規に作り、評価層も新 API で再編。

- ✅ 関心分離が明快、旧方式と並存しやすい、テスト容易
- ❌ 新規面積が最大。interview_turn / question_proposal を使わない場合、管理画面（手動評価・突合・エクスポート）の改修が連鎖（Req 6.4 違反リスク）

### Option C: ハイブリッド（推奨）— キャプチャ層新設 + 「論理ターン」アダプタで既存パイプラインに接続

- **新規**: ボット連携クライアント＋ストリーミング STT provider（`WHISPER_PROVIDER` factory パターン踏襲、`CAPTURE_PROVIDER` 等の env toggle）、webhook 受信ルート、`transcript_segment`（生セグメント）テーブル、live-state 配信、操作レスのサイドパネル UI
- **アダプタ**: セグメント列 → 論理ターン化 → **interview_turn / question_proposal / pattern_coverage へ書き戻し** → analyzeTurn 以降の既存 5 関数・finalize・管理画面が無改修で動く
- **真実源の移動**: 進行状態（現在パターン・カバレッジ・最新候補）を DB に置き、クライアントは取得専用（Req 8.2 を構造的に解決）
- ✅ Req 4.4 / 6.2 / 6.4（出力形式・互換）を構造で保証しつつ、キャプチャ層は綺麗に分離
- ❌ アダプタ（セグメンテーション）の品質チューニングが独立した難所として残る

## 4. 工数・リスク評価

全体: **XL（2 週超）/ High** — 外部統合 2 件（ボット・STT）＋ push チャネル＋構造変更を含むため。サブ領域に分割して管理:

| サブ領域 | 工数 | リスク | 根拠 |
| --- | --- | --- | --- |
| ボット連携 + webhook 受信 | M | High | 外部 API・inbound webhook とも前例なし。入室失敗・切断等の運用パスが多い |
| ストリーミング STT + 話者分離 | M | Medium | provider factory の前例あり。日本語 diarization 品質は要実測 |
| ライブ配信チャネル（live-state） | S–M | Medium | Vercel 制約下の方式選定（poll / 再接続 SSE / 外部 realtime）次第 |
| セグメンテーション → 論理ターンアダプタ | M | High | 評価精度を直接左右。15 秒以内更新（Req 3.3）と LLM コストのトレードオフ |
| サイドパネル UI 刷新 + リロード復元 | M | Medium | UI 素材は流用可だが真実源移動を伴う |
| 対面録音（連続化＋オフライン耐性） | S–M | Medium | MediaRecorder 資産あり。バッファリングが新規 |
| finalize 接続・互換・トランスクリプト閲覧 | S | Low | 既存流用が中心 |

## 5. 設計フェーズへの推奨と Research Needed

**推奨**: Option C。最初の実装スライスは「ボット参加 → ライブトランスクリプト表示」の縦切り（評価接続なし）で外部統合リスクを先に潰し、その後アダプタ→サイドパネル→対面フォールバックの順。

**Research Needed（設計フェーズで解決）**:

1. **STT 経路の選定**: Recall.ai 内蔵文字起こし（$0.15/h、話者ラベルの粒度要確認）vs ボット raw audio → Deepgram Nova-3 直結（日本語 streaming + diarize 確認済み）。日本語品質・コスト・実装量の比較
2. **ライブ配信方式**: クライアントポーリング（2–3 秒間隔）vs 再接続型 SSE vs 外部 realtime SaaS。Vercel プラン（Hobby の関数時間上限・同時実行）で 60 分面接が成立するか、Pro 移行要否
3. **回答一区切り検知**: 話者交代＋無音閾値の決定論ロジックでどこまで賄い、LLM 判定をどの頻度で挟むか。`llm:<sessionId>` 上限 100 回の再設計とコスト試算（現行 $50–150/月 想定との整合）
4. **ボット録音音声の保管**: ベンダー側保管（7 日無料）→ Vercel Blob への転送タイミングと 30 日削除ポリシーの整合、audio_key のセッション単位化
5. **Webhook 信頼性**: 署名検証方式、リトライ・順序逆転・重複配信への耐性（イベントの冪等処理）
6. **対面録音の送信方式**: MediaRecorder timeslice チャンク POST vs ブラウザ → STT 直結（一時トークン発行）。`Permissions-Policy: microphone=(self)` は設定済み
7. **使用質問の自動判別**（Req 3.6）: 提示候補テキストと面接官発話の類似照合の方式（埋め込み不使用の Stage 1 制約下でのアプローチ）
8. **LLM コスト記録**: 面接セッションを admin コスト監視に載せるか（現状 mock_interview のみ）

---

# Design Discovery & Decisions（/kiro-spec-design 追記）

> 追記: 2026-06-11。設計フェーズの full discovery と synthesis の記録。設計の結論は design.md に自己完結で記載済み。

## 追加調査の確定事実

- **Recall.ai リアルタイム転写の契約**（[docs](https://docs.recall.ai/docs/real-time-transcription)）: Create Bot の `recording_config.transcript.provider` で STT プロバイダを選択（`recallai_streaming` / `deepgram_streaming` / `assembly_ai_v3_streaming` / `gladia_v2_streaming` / 会議キャプション等）。`realtime_endpoints` に webhook を指定すると `transcript.data`（final）/ `transcript.partial_data`（partial）が POST される。**ペイロードに会議プラットフォームの参加者情報（ID・表示名）が含まれる** → オンライン面接の話者分離は音響 diarization 不要で参加者照合に置き換え可能
- **Vercel 実行制約**（[Fluid compute](https://vercel.com/docs/fluid-compute), [limits](https://vercel.com/docs/functions/limitations)）: Hobby は最大 300 秒、Pro は最大 800 秒。60 分の常時接続 1 本は不成立 → 長命接続を持たない設計が必須

## Design Decisions（synthesis 結果）

| # | 決定 | 根拠 / 棄却案 |
| --- | --- | --- |
| D-1 | キャプチャ抽象を「`transcript_segment` ストリームへの正規化」に一般化。ボット経路と対面経路は同一のセグメント契約に合流 | Generalization。セグメンタ以降が入力源を区別しない |
| D-2 | ボットインフラ = Recall.ai 採用（buy） | 3 プラットフォーム自前実装（XL 工数・保守地獄)を棄却。firstcall.dev / Vexa は実績・ドキュメント成熟度で見送り |
| D-3 | ストリーミング STT は Recall の provider 設定に委譲（既定 `deepgram_streaming`、env `CAPTURE_TRANSCRIPT_PROVIDER` で切替）。**自前の STT ストリーミング接続は持たない** | Build vs Adopt。Deepgram Nova-3 は日本語 streaming + diarize 対応確認済み。自前 ws 接続は serverless 制約と二重運用コストで棄却 |
| D-4 | 対面フォールバックは MediaRecorder timeslice チャンク（8 秒）→ 既存 `transcribeAudio`（Whisper バッチ）。話者分離は既存 `splitInterviewerCandidate` で論理ターン化時に吸収 | Simplification。新規 STT 統合ゼロ。ブラウザ→STT 直結（一時トークン）案はクライアント信頼境界とベンダー追加で棄却 |
| D-5 | ライブ配信 = クライアントポーリング（2.5 秒、カーソル差分、`cursor=0` で全量＝リロード復元） | SSE 再接続案（300 秒毎の張り直し・途切れ管理が複雑）、Pusher/Ably 等（新ベンダー・MVP 規模に過剰）を棄却。遅延予算: webhook 1–3s + poll ≤2.5s で Req 2.1 の 10 秒以内を満たす |
| D-6 | 論理ターン区切りは決定論ルール（final セグメントの話者交代 + 無音 4 秒 + 最小発話長）。LLM 不使用 | Req 3.3 の 15 秒制約と LLM コスト。判定品質は実面接データでチューニング前提 |
| D-7 | 評価接続は「`interview_turn` への書き戻しアダプタ」（gap 分析 Option C を採用） | 既存 LLM 5 関数・pattern_coverage・session_report・管理画面が無改修。Req 4.4 / 6.2 / 6.4 を構造で保証 |
| D-8 | 使用質問の自動判別（Req 3.6）= 正規化 n-gram 重複率の決定論照合。LLM・埋め込み不使用 | pgvector は Stage 1 非導入（steering）。ゼロコスト・テスト容易 |
| D-9 | 真実源を DB に移動。進行状態のクライアント保持を廃止 | Req 8.2（リロード復元）の構造的解決。旧 useReducer 集中設計の負債解消 |
| D-10 | `llm:<sessionId>` 上限を 100 → 150 に変更 | ライブ化でターン数は同水準（15–20）だが部分再解析の余裕を確保。コスト試算は現行同水準（50–60 呼び出し/セッション） |
| D-11 | Recall クライアントは `apps/business/lib/capture/` に配置（packages 化しない） | 他アプリから不使用。apps→packages 単方向依存の steering 規約に従い、時期尚早な共通化を回避 |

## 実装フェーズへ持ち越す検証項目（design 時点の残リスク）

- R-1: `deepgram_streaming`（Recall 経由）の日本語実面接での品質・話者付与粒度の実測。劣化時は `recallai_streaming` / `gladia_v2_streaming` へ env 切替で比較
- R-2: Recall realtime webhook の transcript エンドポイント認証方式の確認（設計は URL 埋め込みトークン前提。Svix 署名が transcript にも適用されるなら置換）
- R-3: finalize の事後バッチ転写（60 分音声）が Hobby 300 秒に収まるかの実測。超過時はチャンク分割転写 → それでも不足なら Pro 移行
- R-4: Recall 側録音の削除 API（Blob 転送後にベンダー側データを残さない運用）の確認
- R-5: ポーリング 1,440 リクエスト/セッションの Vercel 無料枠消費の実測

## 設計レビュー（/kiro-validate-design）での追加決定

| # | 決定 | 背景 |
| --- | --- | --- |
| D-12 | セグメンタの並行実行をセッション単位 advisory lock（`pg_advisory_xact_lock`）+ `logical_turn_id IS NULL` 条件付き claim で直列化 | webhook 連続着弾と tick の同時実行で、fingerprint が異なる二重ターンが生成されうる競合をレビューで検出。一意制約だけでは防げない |
| D-13 | ターン確定の起動を「イベント着弾 + live-state ポーリング tick」の 2 系統に拡張 | 「候補者が回答を終えた沈黙」はイベントを生まず、面接官の次の発話を待つと質問候補の提示が手遅れになる（3.2/3.3 の核心）。ポーリングを時計として利用 |
| D-14 | `transcript.partial_data` を購読しない（final-only） | serverless 上に partial の揮発状態の置き場がなく、final 発話は数秒間隔で到着するため 2.1 の 10 秒予算は final のみで満たせる。Simplification |
