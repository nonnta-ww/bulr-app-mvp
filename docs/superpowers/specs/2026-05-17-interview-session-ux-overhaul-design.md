# 面接セッション画面の UX 改修 — 設計書

- **対象スコープ**: `apps/web/app/(interviewer)/interviews/[sessionId]` 配下のクライアント UX
- **方針**: Approach R（バックエンドは現行 SSE のまま、フロントエンドを Model B = フル非同期に作り直す）
- **作成日**: 2026-05-17
- **前提となる完了済 spec**: `interview-sse-progress`（タスク 3.1 まで完了。SSE エンドポイント、`parseSseStream`、`InterviewProgressSteps` を実装済み）

## 1. ゴール

インタビュアーが面接中に得たい4つの体験を実現する:

1. セッション開始時に、選定された質問の全体像（8〜12個）を一覧で見える
2. 質問送信後、分析を待たずに次の質問へ進める。分析の実行状況は把握できる
3. 深掘り質問が追加されたら、その面接の質問一覧に随時追加される
4. 分析結果を確認した上で、次に何を聞くかを意思決定できる

## 2. ユーザー要件と判断サマリ

| 要件 | 判断 |
|---|---|
| 「選定された質問一覧」とは何か | `assessment_pattern.level_1_intro`（8〜12個、セッション作成時に決定済み）を一覧表示 |
| 分析を待たないタイミングモデル | **Model B（フル非同期）**: 送信直後に Q2 表示・録音可、分析は背景で進行、完了時 Toast 通知。録音中スワップは不可 |
| 3 候補の agenda 反映 | **選んだ 1 つだけ** が agenda に追加。他2候補は破棄 |
| 質問一覧の配置 | **左サイドバー固定型**。手動リサイズ・完全クローズ可能 |

## 3. アーキテクチャ概要

### 3.1 クライアント構成

```
InterviewSessionRunner (orchestrator)
├── SessionAgendaSidebar      … 左固定／可変幅／クローズ可
│   └── AgendaPatternRow × N
│       ├── (level_1_intro turn)
│       └── (deep_dive / meta_cognition / manual turns ぶら下げ)
├── MainStage
│   ├── BackgroundAnalysisStrip … 稼働中/完了の分析タスクをチップ表示（上部）
│   ├── QuestionDisplay         … 現在/次の質問を表示
│   ├── RecordingPanel          … 既存 RecordingState 流用（中身ほぼ無改修）
│   └── NextQuestionPicker      … 録音停止後に表示（候補3つ＋agenda直接ピック＋手動入力）
└── AnalysisResultDrawer        … 過去ターンの分析詳細をスライドイン表示
```

### 3.2 サーバー側

**改修なし**。`POST /api/interview/turns/next` の SSE は今のまま使う（イベント: `upload → transcribe → analyze → prepare → complete`）。

### 3.3 データフロー（[次の質問へ] 押下時）

```
[Q1 録音中]
  │ ユーザー [次の質問へ] クリック
  │ ├─ ① 音声 blob と turnId(=Q1) を確保
  │ ├─ ② AnalysisTaskManager に新タスクを登録（背景で fetch + parseSseStream）
  │ ├─ ③ agenda の Q1 行を "asked" に更新
  │ └─ ④ MainStage を NextQuestionPicker 状態へ
  │
[NextQuestionPicker]
  │ デフォルト選択: 未着手パターンの先頭の level_1_intro
  │ 選択肢: agenda 別パターンクリック / 候補(あれば)クリック / 手動入力
  │ ユーザー [録音開始] クリック
  │
[Q2 録音中]  ←── Q1 の AnalysisTask が背景で SSE 受信中
  │ Q1 complete イベント到着
  │ ├─ Toast「Q1 の分析が完了」
  │ ├─ Sidebar の Q1 行に「✓ 分析完了」バッジ
  │ └─ AnalysisResultDrawer に最新候補として待機
```

### 3.4 主要な不変条件

- **録音中スワップは不可**（Model B 厳守）
- 1ターン = 1分析タスク。`Map<turnId, AnalysisTask>` で並走管理
- agenda 項目は **インタビュアーが録音開始した瞬間に確定**。録音前は draft
- 過去 turns と未来 plannedPatterns を1つのリストにマージして描画

## 4. クライアント状態モデル

### 4.1 型定義

```ts
// ---- agenda ----

type AgendaItemStatus =
  | 'future'      // 未着手
  | 'queued'      // NextQuestionPicker で選択中（未録音）
  | 'recording'   // 録音中
  | 'asked'       // 録音終了済み（分析中含む）
  | 'completed';  // 分析も完了

type AgendaItemSource =
  | { kind: 'pattern_intro'; patternId: string }
  | { kind: 'deep_dive'; parentTurnId: string }
  | { kind: 'meta_cognition'; parentTurnId: string }
  | { kind: 'manual'; parentTurnId: string | null };

interface AgendaItem {
  id: string;                       // turnId (録音中以降) / draft-{nanoid} (未録音)
  patternId: string | null;
  patternTitle: string;
  questionText: string;
  source: AgendaItemSource;
  status: AgendaItemStatus;
  startedAt: number | null;
  endedAt: number | null;
  analysisTaskId: string | null;
}

// ---- 分析タスク（並走管理）----

type AnalysisStatus = 'streaming' | 'completed' | 'errored';

interface AnalysisTask {
  turnId: string;
  patternId: string | null;
  status: AnalysisStatus;
  step: ProgressStep;      // 既存: upload | transcribe | analyze | prepare
  transcript: string | null;
  analysisNotes: string | null;
  candidates: ProposalCandidate[] | null;
  proposalId: string | null;
  error: string | null;
  abortController: AbortController;
  startedAt: number;
}

// ---- ピッカー状態（録音停止後の選択中）----

interface NextQuestionDraft {
  questionText: string;
  source: AgendaItemSource;
  patternId: string | null;
  fromAnalysisTaskId: string | null;
}
```

### 4.2 `InterviewSessionRunner` が持つ state

```ts
const [agenda, setAgenda] = useState<AgendaItem[]>(() => buildInitialAgenda(plannedPatterns, turns));
const [analysisTasks, setAnalysisTasks] = useState<Map<string, AnalysisTask>>(new Map());

type Phase = 'picking' | 'recording' | 'finalizing';
const [phase, setPhase] = useState<Phase>('picking');

const [nextDraft, setNextDraft] = useState<NextQuestionDraft>(initialDraft);
const [currentItemId, setCurrentItemId] = useState<string | null>(null);
const [openDrawerTaskId, setOpenDrawerTaskId] = useState<string | null>(null);
```

### 4.3 `buildInitialAgenda(plannedPatterns, turns)` 初期化ルール

1. **過去ターン**: `turns` を順に `AgendaItem` 化（`status='completed'`、`source` は turn の `question_source` から復元）
2. **未来ターン**: `plannedPatterns` のうち、まだ録音されていないパターンの `level_1_intro` を `status='future'` で末尾に追加
3. **マニュアル質問**: 過去 turn の `manual` 系は親パターンの直下にぶら下げ

純関数で実装。リロード時もこの関数で agenda を再構築する。

### 4.4 状態遷移ルール

| イベント | 影響 |
|---|---|
| `[録音開始]` クリック | nextDraft → agenda に追加（`queued`→`recording`）、`phase='recording'` |
| `[次の質問へ]` クリック | 現 item を `asked`、AnalysisTask を spawn、`phase='picking'` に戻す、nextDraft を次パターン level_1_intro で初期化 |
| SSE `progress` | 該当 `AnalysisTask.step` を更新 |
| SSE `complete` | task を `completed`、candidates 格納、Toast 表示、Drawer に最新候補として待機 |
| SSE `error` / fetch 失敗 | task を `errored`、agenda 該当行に ⚠️ バッジ、リトライボタン表示 |
| `[面接終了]` クリック | 全 task の `abortController.abort()`、`phase='finalizing'` → report へ遷移 |

## 5. UI レイアウト詳細

### 5.1 サイドバー（SessionAgendaSidebar）

- **位置・幅**: 左固定、既定 220px、ドラッグハンドルで 160〜400px 範囲リサイズ可
- **折りたたみ**: ヘッダー右の `⇤` で完全閉鎖（36px 幅）。クローズ時は縦書きで進捗（例: `D-02 (5/10)`）
- **永続化**: 幅と開閉状態を `localStorage` に保存
- **行構造**: パターンをトップレベル、ターンを下にぶら下げる入れ子
- **ステータス表現**: 色 + バッジで二重表現（`completed=緑/✓` `asked=青/分析n/4` `recording=赤/録音中` `future=灰`）

### 5.2 BackgroundAnalysisStrip

- MainStage 上部の細いバンド
- 稼働中タスク = 黄色チップ（`⟳ D-02 intro 分析中 (3/4)`）
- 完了タスク = 緑チップ（`✓ D-02 intro 分析完了`、クリックで Drawer 開く）
- エラータスク = 赤チップ（`⚠ D-02 intro 失敗 [再試行]`）
- 経過時間表示は右端

### 5.3 NextQuestionPicker

3要素の縦並びカード:

1. **「分析が出した次の候補」セクション**（直前ターンの分析が完了していれば 3 候補表示、`deep_dive` / `meta_cognition` / `next_pattern` をインテントバッジで色分け）。完了していなければプレースホルダー
2. **「または agenda から直接」セクション**（未着手パターンをタグ列で表示、クリックで nextDraft 更新）。「+ 自分で入力」タグも同列に置きモーダル起動
3. **[この質問で録音開始] ボタン**

新しい分析が picking 表示中に到着した場合、自動上書きせず `「✨ 新しい候補が届きました [切替]」` リンクをセクション1の上部に出す。

### 5.4 AnalysisResultDrawer

- 右側スライドイン、幅 280px、`role="dialog"` ではなく非モーダル
- 録音と並列表示可能（閉じるまで残る）
- 表示内容: ヘッダー（パターン名）/ トランスクリプト / 分析メモ / 提案候補3つ（再確認用）

## 6. インタラクションフロー

### 6.1 セッション開始時の初期状態

- 過去 turns があり、末尾が `completed` → `phase='picking'`、nextDraft は次パターン level_1_intro
- 過去 turns があり、末尾が `asked`（分析未完了）→ `phase='picking'`、当該行に「再分析不可（リロード後）」表示
- 過去 turns 空 → `phase='picking'`、nextDraft は `plannedPatterns[0].level_1_intro`

### 6.2 [次の質問へ] フロー（要件2の核心）

1. `MediaRecorder.stop()` → audio Blob 取得
2. AnalysisTask を spawn（AbortController 生成、fetch POST `/api/interview/turns/next` SSE、`parseSseStream` を async generator として回す）
3. agenda の現 item を `status='asked'`、`endedAt=now`
4. nextDraft を以下の優先順位でリセット:
   - (a) 完了済み AnalysisTask が 1 件以上あれば、最新タスクの第1候補（intent ≠ なら先頭順）を採用
   - (b) なければ、未着手 (`status='future'`) パターンの先頭の `level_1_intro` を採用
   - (c) どちらもなければ（全パターン消化 + 完了分析なし）、空文字 + `source.kind='manual'` で手動入力を促す
5. `phase='picking'`

**重要**: 手順1〜2 完了時点で UI は即座に picking 画面。SSE は完全に背景。

### 6.3 SSE イベント受信中の挙動

```
on 'progress' (step):
  └─ analysisTasks[turnId].step = step → 該当 agenda 行のバッジ更新

on 'complete' (candidates, transcript, analysisNotes, proposalId):
  ├─ task.status = 'completed', candidates 格納
  ├─ Toast「{patternId} の分析が完了」
  ├─ openDrawerTaskId が null なら設定
  └─ picking 表示中で fromAnalysisTaskId が古い場合、
     「✨ 新しい候補が届きました [切替]」を表示（自動上書きしない）

on 'error':
  ├─ task.status = 'errored', task.error = message
  ├─ Toast「分析失敗。再試行できます」
  ├─ 該当 agenda 行に ⚠️ バッジ
  └─ 行クリックで「再試行」 → 同 turnId で再 POST（idempotent）
```

### 6.4 [面接終了] フロー

1. 確認ダイアログ（既存通り）
2. すべての `analysisTasks[*].abortController.abort()`
3. `POST /api/interview/sessions/{id}/finalize`（既存）
4. `phase='finalizing'` → `/interviews/{sessionId}/report` へ `router.push`

走行中タスクは破棄。レポートには「分析未完了」のターンが残る（現状と同じセマンティクス）。

## 7. エラー & エッジケース

| 状況 | 挙動 |
|---|---|
| マイク権限拒否 | 既存通り（`recording-state.tsx` の `micError` 表示） |
| Blob > 50MB | 既存通り（リセット処理） |
| 録音中にネットワーク切断 | 録音は継続。[次の質問へ] で初めて検知、AnalysisTask が即 errored、agenda に ⚠️ |
| 並走中の unmount | `analysisTasks` の全 AbortController を abort |
| SSE タイムアウト（5分以上） | `parseSseStream` が `StreamEndedWithoutTerminalEvent` を throw → errored |
| 同 turnId の再試行 | サーバー側は idempotent。クライアントは task を新規 spawn |
| ピッカー画面で長時間放置 | 制限なし。40分超過は警告（既存） |
| リロード時の未完了分析 | SSE 再接続不可。**MVP: 当該ターンは "分析なし" 扱い**、レポートで対応。agenda 行には `⚠ 分析未完了（リロード）` を非操作バッジで表示 |
| 全パターン消化後の続行 | nextDraft は手動入力強制（`source.kind='manual'`）。サイドバーには「[新規パターン追加]」ボタンを出さず、ピッカーで手動入力のみ可 |
| 候補と level_1_intro の重複 | `next_pattern` intent の候補テキストと未着手パターン先頭の `level_1_intro` が一致 / 近似する場合、ピッカーで重複表示する（自動排除しない）。完全一致時のみ次パターンを薄表示する程度の処理は将来検討 |

## 8. 永続化（MVP）

| 対象 | 保存先 |
|---|---|
| サイドバー幅 | `localStorage['bulr.sidebar.width']` |
| サイドバー開閉状態 | `localStorage['bulr.sidebar.collapsed']` |
| agenda draft 項目 | 保持しない（リロード時は turns から再構築） |
| agenda の order・親子関係 | 派生計算（turns + plannedPatterns から決定論的構築） |

## 9. テスト方針

### ユニット（vitest）

- `buildInitialAgenda` 純関数の網羅テスト（turns 空、completed のみ、asked 混在、manual ターン）
- 状態遷移リデューサーをイベント駆動の純関数として実装し、ケース網羅
- `useAnalysisTasks` hook: spawn → progress → complete / error の各遷移

### コンポーネント（RTL）

- `SessionAgendaSidebar`: 状態ごとのバッジ、リサイズ操作、折りたたみ、行クリック
- `NextQuestionPicker`: 候補なし時、agenda 直接ピック、手動入力モーダル
- `BackgroundAnalysisStrip`: 稼働中/完了/エラーチップの描き分け
- `AnalysisResultDrawer`: open/close、コンテンツ表示

### 統合

- "[次の質問へ] で picking 画面に即遷移し、loading 画面を経由しない" を確認（spec `interview-sse-progress` のテストを更新）
- 並走分析: MSW で SSE を遅延モックし、2 ターン並行を再現

### E2E（Playwright）

`interview-sse-progress` 未着手の Task 4.1 に統合:

- シナリオ A: 録音 → 送信 → 即ピッカー表示 → 分析完了 Toast を確認
- シナリオ B: 2 連続録音 → 1 つ目の分析完了が遅れて到着 → サイドバーに反映
- シナリオ C: サイドバー折りたたみ・幅変更が `localStorage` に保存

## 10. アクセシビリティ / レスポンシブ

| 項目 | 方針 |
|---|---|
| キーボード操作 | サイドバー行は `<button>`、リサイズハンドルは矢印キーで 8px 単位調整 |
| ARIA | `BackgroundAnalysisStrip` は `role="status" aria-live="polite"`、Toast は `aria-live="assertive"` |
| 画面サイズ | デスクトップ最適。`min-width: 1024px` 未満はサイドバー既定で折りたたみ |
| Color | バッジは色 + テキスト二重表現 |

## 11. パフォーマンス

- `analysisTasks` は通常 2〜3 並走（40 分 / 1ターン 10-12 分 = 多くて 4 並走）
- agenda 描画は仮想化不要（最大 12 パターン + 深掘りで 30 行程度）
- SSE 接続はブラウザ同一オリジン同時接続数（Chrome 6）の制限内

## 12. スコープ外（MVP では実装しない）

| 項目 | 理由 |
|---|---|
| agenda の DB 永続化 | リロードは想定外運用、turns から再構築で十分 |
| 過去ターンの編集・再録音 | やり直し UX を別途設計が必要 |
| 候補3つ全部キープの未消化提案プール | 「選んだ1つだけ」に確定 |
| 録音中の質問テキスト編集 | スワップ禁止の方針 |
| 候補者画面 | プロダクトコンセプトとして "黒子" のため不要 |
| インタビュアー側のリアルタイム文字起こし | 既存通りバッチ表示 |
| 質問のドラッグ&ドロップ並び替え | ピッカー直接ピックで十分 |

## 13. 将来フェーズ（次の段階で実装予定）

ユーザー想定の次フェーズ:

```
[フェーズ N+1] 事前準備機能
1. 面接一覧画面（candidate × scheduled interview）
2. 面接選択 → 候補者情報表示（レジュメ + bulr 事前アンケート回答）
3. [面接プラン作成] ボタン
   └─ LLM で候補者分析 → 推奨パターン + 質問テキストを生成
4. プランレビュー画面（パターン追加/削除/並び替え、質問文編集）
5. [面接スタート] → 確定したプランで agenda 初期化 → 現フローへ
```

### MVP 設計時に "次フェーズ移行を楽にする" ための配慮

- **`AgendaItem` を JSON-safe な構造で固定**（関数参照や `Map` を含めない）→ 将来 `interview_plan` テーブルに `agenda_snapshot jsonb` として直接保存可能
- **agenda 初期化を関数化**（`buildInitialAgenda(source, turns)` の `source` を `{kind:'patterns'|'plan', ...}` の判別共用体に）→ 入力ソースを将来差し替え可能
- **`level_1_intro` 参照箇所を集約**（agenda 初期化と手動入力モーダルのプリセット候補のみ）→ 将来 plan の `question_text` 差し込みのみで切替可能
- **「面接スタート」イベント抽象化の余地**: 今は `session.started_at` が起点だが、将来は plan 確定タイミングが起点になり得る。`plan_confirmed_at` 等のカラム追加余地を残す

### 次フェーズで検討する項目

- 事前アンケートから `backgroundSummary` を構築する経路
- LLM プラン生成の品質保証（既存 `propose-next-questions.ts` 拡張か別関数か）
- プラン編集 UI（パターン追加・削除・並び替え）
- 「複数候補者の比較」マッピング UI（さらに先のフェーズ？）

## 14. オープン課題（実装計画フェーズで詰める）

- `next_pattern` intent の候補テキストと agenda 内次パターン `level_1_intro` が重複・近似する可能性。表示時の重複排除方針
- ピッカー画面で「直前の分析未完了」の場合の UI 詳細（プレースホルダー文言、agenda 直接ピックは可）
- `BackgroundAnalysisStrip` でチップが 4 件以上のときの折り返し / 省略表示

これらは writing-plans フェーズで具体化する。

## 15. 関連リソース

| 項目 | 場所 |
|---|---|
| 既存 spec | `.kiro/specs/interview-sse-progress/{requirements,design,tasks}.md` |
| 質問選定仕様 | `docs/04-pattern-selection.md` |
| 評価設計 | `.kiro/steering/assessment-design.md` |
| プロダクト方針 | `.kiro/steering/product.md` |
| 改修対象主要ファイル | `apps/web/app/(interviewer)/interviews/_components/interview-session-runner.tsx` |
| 既存 SSE パーサ | `apps/web/lib/interview/parse-sse-stream.ts` |
| 既存進捗 UI | `apps/web/app/(interviewer)/interviews/_components/interview-progress-steps.tsx`（Drawer 内で再利用検討） |
