# Implementation Plan

- [x] 1. Foundation: 共有スキーマとイベント型の定義

- [x] 1.1 SSE イベントスキーマと TypeScript 型を定義する
  - `apps/web/lib/interview/turns-next-events.ts` を新規作成
  - `ProgressEvent` / `CompleteEvent` / `ErrorEvent` の Zod スキーマと、3 種の discriminated union `TurnsNextEvent` を定義
  - `ProgressStep` を `z.enum(['upload', 'transcribe', 'analyze', 'prepare'])` で固定
  - `CompleteEvent` の `turn` / `coverage` / `transitionCoverage` / `proposal` は `z.custom<T>()` 経由で Drizzle 推論型（`schema.interviewTurn.$inferSelect` 等）を取り込む
  - `@bulr/db` からは `import type { schema }` を使い、クライアントバンドルへの DB ランタイムコード混入を防ぐ
  - 完了条件: `pnpm typecheck` が通り、`z.infer<typeof CompleteEvent>['turn']` が `InterviewTurn` として型推論される
  - _Requirements: 1.5, 3.1_

- [x] 2. Core: 独立コンポーネントの並列実装

- [x] 2.1 (P) 既存ルートを SSE ストリーミング応答に変換する
  - `apps/web/app/api/interview/turns/next/route.ts` を修正
  - Auth / Zod / Session ownership / Rate Limit pre-check の 4xx 応答は従来通り `NextResponse.json` でストリーム開始前に返却
  - `new Response(stream, { headers: text/event-stream })` を返し、ストリーム内で全処理を実行（`await` を return 前に置かない）
  - レスポンスヘッダに `Cache-Control: no-cache, no-transform` / `Connection: keep-alive` / `X-Accel-Buffering: no` を付与
  - 冪等性チェックを `ReadableStream.start()` 内に移動し、ヒット時は 4 progress イベントを各 100ms 間隔で送出（`await new Promise(r => setTimeout(r, 100))`）してから `complete` を送出（既存 turn データ + 既存 proposal を含む）
  - 通常フローでは uploadToBlob 完了後・transcribeAudio 完了後・analyzeTurn と DB insert 完了後・Prepare 全完了後の 4 タイミングで対応する `progress` イベントを `controller.enqueue` で送出
  - Core 失敗時は `error` イベント（`code: 'core_phase_failed'`、`retryable: true`）を送出して controller.close
  - 全完了時は `complete` イベント（`turn`、`coverage`、`transitionCoverage`、`proposal` を含む）を送出して controller.close
  - 既存の Prepare 内 try/catch 構造（失敗時は null で表現する挙動）と既存のサーバー側冪等性保証（DB レベルの重複登録防止）は維持
  - 送出前に `TurnsNextEvent.parse()` で Zod 検証を実施
  - 完了条件: dev server で「次へ」押下時に DevTools の Network タブで `text/event-stream` 形式の連続イベントが観測でき、Core/Prepare の各完了タイミングで `progress` イベントが配信される。冪等性ヒット時には 4 progress イベントが約 100ms 間隔で配信される
  - _Requirements: 1.5, 2.1, 2.4, 3.1, 3.2_
  - _Boundary: TurnsNextRoute_

- [x] 2.2 (P) SSE ストリームを Zod 検証付きで逐次取り出す汎用パーサを実装する
  - `apps/web/lib/interview/parse-sse-stream.ts` を新規作成
  - シグネチャ: `parseSseStream<T>(reader, schema, isTerminal): AsyncGenerator<T>` （`schema` は Zod スキーマ、`isTerminal` は terminal event を判定する述語）
  - `TextDecoder` で `Uint8Array` チャンクを UTF-8 文字列にデコード、`\n\n` 境界でフレーム分割、`data: ` プレフィックスを除去して `JSON.parse` → `schema.safeParse`
  - チャンク境界でフレームが分断された場合はバッファに保留し次チャンクで結合
  - 不正 JSON / Zod 検証失敗は `console.warn` を出してスキップ（堅牢性確保）
  - terminal event（`isTerminal(event)` が true を返すイベント）を yield 済みの場合は正常終了
  - terminal event 未受信のまま `done: true` の場合は `StreamEndedWithoutTerminalEvent` 例外をスロー
  - 完了条件: 手動テストスクリプトまたは optional 単体テスト（4.2）で複数フレーム・チャンク境界またぎ・terminal 未受信ケースが期待通り動作する。`pnpm typecheck` 通過
  - _Requirements: 2.2_
  - _Boundary: ParseSseStream_

- [x] 2.3 (P) 進捗ステップ表示 UI コンポーネントを実装する
  - `apps/web/app/(interviewer)/interviews/_components/interview-progress-steps.tsx` を新規作成
  - Props は `{ currentStep: ProgressStep }` のみ受け取る純粋表示コンポーネント
  - 内部に 4 ステップのラベル `[{key:'upload', label:'音声のアップロード'}, ...]` を固定保持
  - `currentStep` 以前のステップは「完了」状態（チェックマーク付き）、`currentStep` は「処理中」状態（強調表示 + スピナー）、それ以降は「待機」状態として描画
  - 既存 Tailwind パターン（`rounded-2xl bg-white p-8 shadow-md` カード、`animate-spin` スピナー、`RecordingState` のスタイル踏襲）を使用
  - 完了条件: dev server で `mode='loading'` 時に 4 ステップが縦並びで表示され、現状の単純スピナーから置き換わる。`pnpm typecheck` 通過
  - _Requirements: 1.1, 1.3_
  - _Boundary: InterviewProgressSteps_

- [x] 3. Integration: クライアントオーケストレーターの統合

- [x] 3.1 InterviewSessionRunner をストリーム読み取り型に書き換える
  - `apps/web/app/(interviewer)/interviews/_components/interview-session-runner.tsx` の `handleRecordingSubmit` 内の fetch ハンドラ（L184 周辺）を修正
  - `progressStep: ProgressStep` state を追加（初期値 `'upload'`）
  - fetch 後 `response.body.getReader()` を取得して `parseSseStream(reader, TurnsNextEvent, e => e.type !== 'progress')` で逐次消費
  - `progress` イベント受信時に `setProgressStep(event.step)` を呼び、`InterviewProgressSteps` のステップ表示を更新
  - `complete` イベント受信時に既存の state 更新ロジック（`setLastInsertedTurnId`、`setLastTurnTranscript`、`setLastTurnAnalysisNotes`、`setCurrentProposal`、`setLocalTurns`）を実行し `setMode('choosing')` に遷移
  - `error` イベント受信時または `StreamEndedWithoutTerminalEvent` 例外検知時に、既存の Toast「処理に失敗しました。同じ録音で再試行できます」+ `setMode('recording')` + `currentTurnId` 保持を実行
  - pre-stream HTTP エラー（4xx）は既存の status 別ハンドラ（429 toast 等）を維持
  - `mode === 'loading'` 時のレンダーを既存スピナー（L395-420 周辺）から `<InterviewProgressSteps currentStep={progressStep} />` に置換
  - `AbortController` を unmount 時のクリーンアップ用に使用（in-flight 処理は中断しない、クライアント側の fetch 解放のみ）
  - 完了条件: dev server で「次へ」押下時に 4 ステップ進捗 UI が順番にチェックマーク付きに変化し、最終的に候補選択画面へ自動遷移する。エラー発生時は Toast 表示 → 録音画面復帰、再度「次へ」を押すと同じ録音データで再試行される
  - _Depends: 1.1, 2.1, 2.2, 2.3_
  - _Requirements: 1.2, 1.4, 2.1, 2.3_
  - _Boundary: InterviewSessionRunner_

- [x] 4. Validation: 動作確認とテスト

- [x] 4.1 E2E 動作確認シナリオを実施する
  - dev server を起動し、インタビュー画面で実際に録音 → 「次へ」押下 → 4 ステップが順番にチェックマーク付きに変化 → 候補選択画面に遷移することを目視確認
  - DevTools Network タブで `/api/interview/turns/next` のレスポンスが `text/event-stream` 形式となり、`data: {"type":"progress",...}` フレームが期待通り順次配信されることを確認
  - Whisper サービスを意図的に停止した状態で「次へ」押下 → 進捗 UI 表示 → エラー Toast 表示 → 録音画面に戻ること、同じ録音で再度「次へ」を押下できることを目視確認
  - 同じ録音で 1 度成功させた後、ブラウザリロード等で UI を再起動 → 同 `turnId` で「次へ」再送 → 冪等性ヒット分岐に入り、4 progress イベントが 100ms 間隔で配信され候補選択画面へ遷移することを目視確認
  - 完了条件: 上記 3 シナリオすべて期待通り動作。スクリーン録画またはスクリーンショットで成功状態を記録
  - _Depends: 3.1_
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 2.1, 2.2, 2.3_

- [ ]* 4.2 スキーマとパーサの単体テストを追加する（optional、テストフレームワーク導入が前提）
  - 現状プロジェクトには test framework（vitest 等）が未導入のため、本タスクは導入を伴う optional 作業
  - `TurnsNextEvent` の Zod スキーマが正しい envelope を受け入れ、不明な type やステップ enum 外の値を reject する単体テスト（R1.5, R3.1 の SSE 境界保証に対応）
  - `parseSseStream` の単一フレーム / 複数フレーム / チャンク境界またぎ / 不正 JSON スキップ / terminal 未受信時の例外スローを検証する単体テスト（R2.2 の接続断検知に対応）
  - 完了条件: `pnpm test` で本テストが緑、カバレッジに schema と parser が含まれる
  - _Requirements: 1.5, 2.2, 3.1_
  - _Boundary: TurnsNextEventSchemas, ParseSseStream_

- [ ]* 4.3 ルートの統合テストを追加する（optional、テストフレームワーク導入が前提）
  - 現状プロジェクトには test framework が未導入のため、本タスクは導入を伴う optional 作業
  - モック化した uploadToBlob / transcribeAudio / LLM 関数で `progress×4 → complete` の順序を検証（R1.2, R1.4 の正常フロー）
  - 既存 turn が DB にある状態で POST → 4 progress が約 100ms 間隔で配信され `complete` が送出される統合テスト（R1.5 の冪等性ヒット）
  - transcribeAudio が throw する設定で `progress(upload) → error` が送出される統合テスト（R2.1 の Core 失敗）
  - proposeNextQuestions が throw する設定で `progress×4 → complete with proposal=null` が送出される統合テスト（R3.2 の Prepare 部分失敗）
  - 完了条件: `pnpm test` で 4 シナリオすべて緑
  - _Requirements: 1.5, 2.1, 3.1, 3.2_
  - _Boundary: TurnsNextRoute_
