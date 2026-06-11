/**
 * TurnSegmenter — セグメント列から論理ターンを決定論的に確定する。
 *
 * 2 つの公開 API を提供する:
 *
 * 1. `evaluate()` — **純粋関数**（DB / LLM 依存なし）。
 *    final セグメントのリストを受け取り、確定した論理ターンを返す。
 *    同一入力に対して常に同一出力を返す（冪等）。
 *
 * 2. `runWithSessionLock()` — Postgres advisory lock ハーネス。
 *    `pg_advisory_xact_lock(hashtext(sessionId)::bigint)` でセッション単位の
 *    直列実行を保証し、並行する webhook / ポーリング tick による二重処理を防ぐ。
 *    task 4.2 の書き戻しトランザクション（segment claim + interview_turn insert）が
 *    このハーネスを消費する。
 *
 * --- 区切り判定ルール ---
 *
 *  「論理ターン = 1 つの面接官質問 + 1 つの候補者回答」
 *
 *  回答の**確定条件**（いずれかが成立 → ターンを emit する）:
 *  a. 話者交代: 次のセグメントが interviewer に変わった（ターン終了が明確）
 *  b. 無音間隔: 最後の回答セグメントと次のセグメントの開始間隔が silenceGapMs を超えている
 *     かつ回答テキスト長 >= minAnswerChars（短い相槌は結合して待機する）
 *  c. 最大ターン長: ターン先頭から末尾セグメント終了までが maxTurnDurationMs を超えた（強制区切り）
 *
 *  **テール（末尾）セグメントの扱い**:
 *  後続セグメントが存在しない場合、silence gap を判定できないため emit しない。
 *  ただし `forceCloseTrailing: true` が渡された場合（ポーリング tick による silence 検知や
 *  finalize フラッシュ）は末尾ターンも emit する。
 *  この契約を呼び出し元（task 3.3 の tick ロジック / FinalizeExtension）が管理する。
 *
 *  **unknown-only（対面モード）**:
 *  全セグメントが speaker_role='unknown' の場合、質問/回答の分離を保留した
 *  `保留 LogicalTurn`（pendingSplit=true, question 空）を返す。
 *  TurnPipeline が `splitInterviewerCandidate` で話者を事後分離する。
 *  同じ silence gap / maxTurnDuration ルールを適用してターンを区切る。
 *
 * --- Fingerprint ---
 *  構成 segmentIds を昇順ソートして SHA-256 ハッシュを取る。
 *  同一セグメント構成 → 同一 fingerprint（冪等キー）。
 *  interview_turn テーブルの turn_fingerprint 一意制約が最終防衛線として機能する。
 *
 * Requirements: 3.3, 4.1
 * Design: TurnSegmenter (Service Interface / Invariants / Concurrency Control)
 */

import 'server-only';

import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@bulr/db';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** 話者ロール（transcript_segment.speaker_role と対応） */
export type SpeakerRole = 'interviewer' | 'candidate' | 'unknown';

/**
 * evaluate() の入力セグメント形状。
 * transcript_segment DB 行と互換性があるが、DB 依存を持たないローカル型として定義する。
 */
export interface SegmentInput {
  /** セグメント UUID（transcript_segment.id） */
  id: string;
  /** セッション内連番（transcript_segment.seq） */
  seq: number;
  /** 話者ロール */
  speakerRole: SpeakerRole;
  /** 転写テキスト */
  text: string;
  /** セッション開始からの相対ミリ秒（発話開始） */
  startedAtMs: number;
  /** セッション開始からの相対ミリ秒（発話終了） */
  endedAtMs: number;
}

/** セグメンテーション設定 */
export interface SegmenterConfig {
  /**
   * 候補者発話後の無音間隔しきい値（ms）。
   * この間隔を超えた場合、回答が終了したとみなして論理ターンを確定する。
   * 既定: 4000
   */
  silenceGapMs: number;
  /**
   * 回答テキストの最小文字数。
   * 回答がこの文字数未満の場合、silence gap があっても区切らず次のセグメントと結合する。
   * 「はい」などの短い相槌が独立ターンになるのを防ぐ。
   * 既定: 40
   */
  minAnswerChars: number;
  /**
   * 1 論理ターンの最大継続時間（ms）。
   * ターン先頭（最初の質問セグメント開始）から最後の回答セグメント終了までがこの値を超えた場合、
   * 強制的にターンを区切る（上限保護）。
   * 既定: 360000（6 分）
   */
  maxTurnDurationMs: number;
}

/** SegmenterConfig のデフォルト値（design.md 仕様値） */
export const DEFAULT_SEGMENTER_CONFIG: SegmenterConfig = {
  silenceGapMs: 4000,
  minAnswerChars: 40,
  maxTurnDurationMs: 360_000,
};

/**
 * 論理ターン（質問 + 回答の確定ペア）。
 *
 * pendingSplit=true のターン（unknown-only）は TurnPipeline が
 * `splitInterviewerCandidate` で質問/回答に分離する必要がある。
 * 分離前は question が空のまま answer に全テキストが入る。
 */
export interface LogicalTurn {
  question: {
    text: string;
    speakerRole: SpeakerRole;
    /** 質問を構成する transcript_segment の UUID 列（順序付き） */
    segmentIds: string[];
  };
  answer: {
    text: string;
    speakerRole: SpeakerRole;
    /** 回答を構成する transcript_segment の UUID 列（順序付き） */
    segmentIds: string[];
  };
  /**
   * 構成 segmentIds の SHA-256 ハッシュ（冪等キー）。
   * interview_turn テーブルの turn_fingerprint 一意制約に使用する。
   */
  fingerprint: string;
  /**
   * unknown-only ターンのフラグ。true の場合は TurnPipeline が
   * splitInterviewerCandidate を呼び出して質問/回答を分離する。
   * 通常の話者付きターンは undefined（= falsy）。
   */
  pendingSplit?: true;
}

/** evaluate() の入力 */
export interface EvaluateInput {
  /** セッション ID（ログ / デバッグ用、evaluate 自体は純粋） */
  sessionId: string;
  /**
   * 未消費（logical_turn_id 未割当）の final セグメント。
   * 順序が保証されていなくてもよい（startedAtMs でソートして評価する）。
   */
  segments: SegmentInput[];
  /** セグメンテーション設定 */
  config: SegmenterConfig;
  /**
   * true の場合、末尾（後続セグメントなし）のターン候補も強制的に emit する。
   *
   * 用途:
   *  - ポーリング tick（task 3.3）が silence clock で無音閾値超過を検知した場合
   *  - FinalizeExtension が面接終了時に未処理セグメントをフラッシュする場合
   *
   * デフォルト: false（webhook/ingestion 呼び出しは末尾を emit しない）
   */
  forceCloseTrailing?: boolean;
}

// ---------------------------------------------------------------------------
// fingerprint 計算
// ---------------------------------------------------------------------------

/**
 * segment ID のリストから決定論的な fingerprint を計算する。
 * ソート後の ID を連結して SHA-256 ハッシュを取る（同一セグメント → 同一ハッシュ）。
 */
function computeFingerprint(segmentIds: string[]): string {
  const sorted = [...segmentIds].sort();
  return createHash('sha256').update(sorted.join(',')).digest('hex');
}

// ---------------------------------------------------------------------------
// LogicalTurn 構築
// ---------------------------------------------------------------------------

function buildKnownTurn(
  questionSegs: SegmentInput[],
  answerSegs: SegmentInput[],
): LogicalTurn {
  const questionText = questionSegs.map(s => s.text).join('');
  const answerText = answerSegs.map(s => s.text).join('');
  const allIds = [...questionSegs.map(s => s.id), ...answerSegs.map(s => s.id)];
  return {
    question: {
      text: questionText,
      speakerRole: 'interviewer',
      segmentIds: questionSegs.map(s => s.id),
    },
    answer: {
      text: answerText,
      speakerRole: 'candidate',
      segmentIds: answerSegs.map(s => s.id),
    },
    fingerprint: computeFingerprint(allIds),
  };
}

function buildPendingTurn(segs: SegmentInput[]): LogicalTurn {
  const text = segs.map(s => s.text).join('');
  return {
    question: {
      text: '',
      speakerRole: 'unknown',
      segmentIds: [],
    },
    answer: {
      text,
      speakerRole: 'unknown',
      segmentIds: segs.map(s => s.id),
    },
    fingerprint: computeFingerprint(segs.map(s => s.id)),
    pendingSplit: true,
  };
}

// ---------------------------------------------------------------------------
// evaluate() — 純粋関数
// ---------------------------------------------------------------------------

/**
 * セグメント列から確定した論理ターンのリストを返す（純粋関数）。
 *
 * 制約:
 *  - DB / LLM への I/O は一切行わない
 *  - 1 セグメントは最大 1 論理ターンに属する
 *  - 区切り判定に LLM を使用しない（決定論）
 */
export function evaluate(input: EvaluateInput): LogicalTurn[] {
  const forceClose = input.forceCloseTrailing ?? false;
  const config: SegmenterConfig = {
    ...DEFAULT_SEGMENTER_CONFIG,
    ...input.config,
  };

  // startedAtMs 昇順ソート（順序逆転を吸収、design.md: "started_at_ms ソートで吸収"）
  const sorted = [...input.segments].sort((a, b) => a.startedAtMs - b.startedAtMs);

  if (sorted.length === 0) return [];

  // unknown-only チェック（対面モード: 全セグメントが話者未確定）
  const allUnknown = sorted.every(s => s.speakerRole === 'unknown');
  if (allUnknown) {
    return evaluateUnknownOnly(sorted, config, forceClose);
  }

  return evaluateWithSpeakers(sorted, config, forceClose);
}

// ---------------------------------------------------------------------------
// 話者あり評価（interviewer / candidate が含まれる通常パス）
// ---------------------------------------------------------------------------

function evaluateWithSpeakers(
  sorted: SegmentInput[],
  config: SegmenterConfig,
  forceClose: boolean,
): LogicalTurn[] {
  const result: LogicalTurn[] = [];

  // 現在の積み上げ状態
  let questionSegs: SegmentInput[] = [];
  let answerSegs: SegmentInput[] = [];

  /**
   * 現在積み上げ中のターンを emit して状態をリセットする。
   * 質問・回答ともにセグメントがある場合のみ emit する。
   */
  const emitTurn = (): void => {
    if (questionSegs.length > 0 && answerSegs.length > 0) {
      result.push(buildKnownTurn(questionSegs, answerSegs));
    }
    questionSegs = [];
    answerSegs = [];
  };

  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i]!;
    const next = sorted[i + 1] ?? null;

    const inAnswer = answerSegs.length > 0;

    if (!inAnswer) {
      // ────────────────────────────────────────────────────
      // 質問収集フェーズ（もしくは IDLE で最初の質問を待機中）
      // ────────────────────────────────────────────────────
      if (seg.speakerRole === 'interviewer') {
        questionSegs.push(seg);
      } else if (seg.speakerRole === 'candidate') {
        if (questionSegs.length > 0) {
          // 質問の後の最初の候補者発話 → 回答フェーズへ移行
          answerSegs.push(seg);
          // 回答を追加した直後に確定条件を確認
          checkClosingConditions(seg, next, config, questionSegs, answerSegs, emitTurn);
        }
        // 質問なしの孤立候補者発話は無視（質問が先に来る制約）
      }
      // unknown セグメントは質問フェーズでは無視（話者情報なしのため質問に帰属させない）
    } else {
      // ────────────────────────────────────────────────────
      // 回答収集フェーズ
      // ────────────────────────────────────────────────────
      if (seg.speakerRole === 'candidate' || seg.speakerRole === 'unknown') {
        answerSegs.push(seg);
        // 確定条件を確認（silence gap / maxTurnDuration）
        checkClosingConditions(seg, next, config, questionSegs, answerSegs, emitTurn);
      } else if (seg.speakerRole === 'interviewer') {
        // 話者交代（candidateからinterviewerへ）→ 現在のターンを確定し、新しい質問を開始
        // 注意: minAnswerChars チェックを行わない。話者交代は明確なターン終了シグナル。
        emitTurn();
        questionSegs.push(seg);
      }
    }
  }

  // テールクローズ（forceCloseTrailing=true の場合のみ）
  if (forceClose) {
    emitTurn();
  }

  return result;
}

/**
 * 確定条件（silence gap / maxTurnDuration）を評価し、条件成立時に emitTurn() を呼ぶ。
 *
 * 呼び出しタイミング: 回答セグメントを answerSegs に追加した直後。
 * emitTurn() は answerSegs / questionSegs を内部でクリアする。
 */
function checkClosingConditions(
  currentSeg: SegmentInput,
  nextSeg: SegmentInput | null,
  config: SegmenterConfig,
  questionSegs: SegmentInput[],
  answerSegs: SegmentInput[],
  emitTurn: () => void,
): void {
  // ── maxTurnDuration チェック（最優先。上限保護） ──────────────────────
  // ターン先頭（最初の質問セグ開始）から現在の回答セグ終了までの継続時間を確認する
  const turnStart = questionSegs[0]?.startedAtMs ?? currentSeg.startedAtMs;
  if (currentSeg.endedAtMs - turnStart > config.maxTurnDurationMs) {
    emitTurn();
    return; // emit 後は以降の条件をチェックしない
  }

  // ── silence gap チェック ──────────────────────────────────────────────
  // 後続セグメントが存在する場合のみ判定可能。
  // テール（後続なし）は呼び出し元が forceCloseTrailing で制御する。
  if (nextSeg !== null) {
    const answerText = answerSegs.map(s => s.text).join('');
    if (answerText.length >= config.minAnswerChars) {
      const gap = nextSeg.startedAtMs - currentSeg.endedAtMs;
      if (gap > config.silenceGapMs) {
        emitTurn();
      }
    }
    // answerText.length < minAnswerChars の場合: 短い回答は次のセグメントと結合
    // （短い相槌をターン終了と判断しない = minAnswerChars の意図）
  }
}

// ---------------------------------------------------------------------------
// unknown-only 評価（対面モード: 全セグメントが話者未確定）
// ---------------------------------------------------------------------------

function evaluateUnknownOnly(
  sorted: SegmentInput[],
  config: SegmenterConfig,
  forceClose: boolean,
): LogicalTurn[] {
  const result: LogicalTurn[] = [];
  let buffer: SegmentInput[] = [];

  const emitPending = (): void => {
    if (buffer.length > 0) {
      result.push(buildPendingTurn(buffer));
      buffer = [];
    }
  };

  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i]!;
    const next = sorted[i + 1] ?? null;

    buffer.push(seg);

    // maxTurnDuration チェック
    const turnStart = buffer[0]!.startedAtMs;
    if (seg.endedAtMs - turnStart > config.maxTurnDurationMs) {
      emitPending();
      continue;
    }

    // silence gap チェック（後続セグメントあり + バッファが minAnswerChars 以上）
    if (next !== null) {
      const bufferText = buffer.map(s => s.text).join('');
      if (bufferText.length >= config.minAnswerChars) {
        const gap = next.startedAtMs - seg.endedAtMs;
        if (gap > config.silenceGapMs) {
          emitPending();
        }
      }
    }
  }

  // テールクローズ
  if (forceClose) {
    emitPending();
  }

  return result;
}

// ---------------------------------------------------------------------------
// runWithSessionLock — Postgres advisory lock ハーネス
// ---------------------------------------------------------------------------

/**
 * セッション単位の Postgres advisory lock でクリティカルセクションを直列化する。
 *
 * 用途:
 *  - webhook / ポーリング tick が並行して同一セッションに対して evaluate + 書き戻しを
 *    実行しても、二重の論理ターンが生成されないことを保証する。
 *  - task 4.2 の書き戻しトランザクション（segment claim UPDATE + interview_turn insert）が
 *    このハーネスを消費する。evaluate 自体はハーネス外で呼び出してもよい。
 *
 * ロックキー:
 *  `pg_advisory_xact_lock(hashtext(sessionId)::bigint)` を使用する。
 *  hashtext は Postgres の int4 ハッシュを返すが bigint にキャストして使う
 *  （design.md と webhook/recall/transcript/route.ts の実装を踏襲）。
 *  異なる sessionId のハッシュ衝突リスクはあるが、MVPフェーズでは許容する。
 *
 * ライフサイクル:
 *  `db.transaction` のコミット時に advisory lock が自動解放される（xact ロック仕様）。
 *
 * @param sessionId - ロック対象のセッション UUID
 * @param fn - トランザクション内で実行する関数（tx: Drizzle transaction を受け取る）
 * @returns fn の戻り値
 */
export async function runWithSessionLock<T>(
  sessionId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // セッション ID のハッシュ値で advisory lock を取得する
    // 同一セッションの並行呼び出しはここでブロックされる
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${sessionId})::bigint)`,
    );
    return fn(tx);
  });
}
