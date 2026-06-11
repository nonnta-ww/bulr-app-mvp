// @vitest-environment jsdom
/**
 * TranscriptTab コンポーネントのテスト
 *
 * 検証内容:
 *  - 話者ロール（interviewer/candidate/unknown）に対応するラベル（面接官/候補者/未確定）の表示（Req 5.4）
 *  - セグメントの時系列（started_at_ms + seq 昇順）での表示順序（Req 5.4）
 *  - セグメントが空の場合の空状態メッセージ（旧方式セッション等で transcript_segment がない場合）
 *  - speaker_label（参加者表示名）が存在する場合の表示
 *
 * Requirements: 5.4
 * Design: TranscriptView（report 配下タブ、transcript_segment 由来、話者ラベル付き）
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TranscriptTab, type TranscriptSegmentData } from './transcript-tab';

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function makeSegment(
  seq: number,
  speakerRole: TranscriptSegmentData['speakerRole'],
  text: string,
  options?: { startedAtMs?: number; speakerLabel?: string | null },
): TranscriptSegmentData {
  return {
    seq,
    speakerRole,
    speakerLabel: options?.speakerLabel ?? null,
    text,
    startedAtMs: options?.startedAtMs ?? seq * 5000,
  };
}

// ---------------------------------------------------------------------------
// セットアップ
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('TranscriptTab', () => {
  // -------------------------------------------------------------------------
  // Req 5.4: 話者ラベルの表示
  // -------------------------------------------------------------------------

  describe('話者ラベル (Req 5.4)', () => {
    it('interviewer ロールのセグメントに「面接官」ラベルが表示される', () => {
      const segments = [makeSegment(1, 'interviewer', '自己紹介をお願いします。')];
      render(<TranscriptTab segments={segments} />);

      expect(screen.getByText('面接官')).toBeInTheDocument();
      expect(screen.getByText('自己紹介をお願いします。')).toBeInTheDocument();
    });

    it('candidate ロールのセグメントに「候補者」ラベルが表示される', () => {
      const segments = [makeSegment(2, 'candidate', 'はい、田中と申します。')];
      render(<TranscriptTab segments={segments} />);

      expect(screen.getByText('候補者')).toBeInTheDocument();
      expect(screen.getByText('はい、田中と申します。')).toBeInTheDocument();
    });

    it('unknown ロールのセグメントに「未確定」ラベルが表示される', () => {
      const segments = [makeSegment(3, 'unknown', '聞こえていますか？')];
      render(<TranscriptTab segments={segments} />);

      expect(screen.getByText('未確定')).toBeInTheDocument();
      expect(screen.getByText('聞こえていますか？')).toBeInTheDocument();
    });

    it('複数ロールが混在する場合、各セグメントに正しいラベルが表示される', () => {
      const segments = [
        makeSegment(1, 'interviewer', '質問です。'),
        makeSegment(2, 'candidate', '回答です。'),
        makeSegment(3, 'unknown', '不明な発話'),
      ];
      render(<TranscriptTab segments={segments} />);

      expect(screen.getByText('面接官')).toBeInTheDocument();
      expect(screen.getByText('候補者')).toBeInTheDocument();
      expect(screen.getByText('未確定')).toBeInTheDocument();

      expect(screen.getByText('質問です。')).toBeInTheDocument();
      expect(screen.getByText('回答です。')).toBeInTheDocument();
      expect(screen.getByText('不明な発話')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Req 5.4: 時系列（started_at_ms 昇順）での表示順序
  // -------------------------------------------------------------------------

  describe('時系列表示 (Req 5.4)', () => {
    it('セグメントは started_at_ms 昇順で表示される', () => {
      // 意図的に seq と順番を変えて started_at_ms で順序が決まることを確認
      const segments = [
        makeSegment(1, 'interviewer', '1番目の発話', { startedAtMs: 1000 }),
        makeSegment(2, 'candidate', '2番目の発話', { startedAtMs: 5000 }),
        makeSegment(3, 'unknown', '3番目の発話', { startedAtMs: 9000 }),
      ];
      render(<TranscriptTab segments={segments} />);

      const items = screen.getAllByRole('listitem');
      expect(items[0]).toHaveTextContent('1番目の発話');
      expect(items[1]).toHaveTextContent('2番目の発話');
      expect(items[2]).toHaveTextContent('3番目の発話');
    });

    it('started_at_ms が同じ場合は seq 昇順でタイブレーク', () => {
      const segments = [
        makeSegment(2, 'candidate', 'seq=2 の発話', { startedAtMs: 3000 }),
        makeSegment(1, 'interviewer', 'seq=1 の発話', { startedAtMs: 3000 }),
      ];
      render(<TranscriptTab segments={segments} />);

      const items = screen.getAllByRole('listitem');
      expect(items[0]).toHaveTextContent('seq=1 の発話');
      expect(items[1]).toHaveTextContent('seq=2 の発話');
    });
  });

  // -------------------------------------------------------------------------
  // 空状態（旧方式セッション等で transcript_segment がない場合）
  // -------------------------------------------------------------------------

  describe('空状態', () => {
    it('segments が空の場合、空状態メッセージ「トランスクリプトがありません」が表示される', () => {
      render(<TranscriptTab segments={[]} />);

      expect(screen.getByText('トランスクリプトがありません')).toBeInTheDocument();
    });

    it('segments が空の場合、リストアイテムは表示されない', () => {
      render(<TranscriptTab segments={[]} />);

      expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // speaker_label（参加者表示名）の表示
  // -------------------------------------------------------------------------

  describe('speaker_label の表示', () => {
    it('speakerLabel が存在する場合、参加者名が表示される', () => {
      const segments = [makeSegment(1, 'interviewer', 'テスト発話', { speakerLabel: '山田太郎' })];
      render(<TranscriptTab segments={segments} />);

      expect(screen.getByText('面接官')).toBeInTheDocument();
      expect(screen.getByText('山田太郎')).toBeInTheDocument();
    });

    it('speakerLabel が null の場合、参加者名のテキストは表示されない', () => {
      const segments = [makeSegment(1, 'candidate', 'テスト発話', { speakerLabel: null })];
      render(<TranscriptTab segments={segments} />);

      expect(screen.getByText('候補者')).toBeInTheDocument();
      // speakerLabel=null なら表示要素なし
      expect(screen.queryByLabelText('参加者名')).toBeNull();
    });
  });
});
