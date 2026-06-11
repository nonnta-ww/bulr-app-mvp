// @vitest-environment jsdom
/**
 * LiveTranscriptPane コンポーネントのテスト
 *
 * 検証内容:
 *  - 話者ラベル（面接官/候補者/未確定）の表示（Req 2.2, 2.3）
 *  - セグメントの逐次追加表示：rerender で新セグメントが自動反映（Req 2.1）
 *  - staleTranscript フラグによる「転写が遅延しています」表示（Req 2.5）
 *  - セグメント追加時の自動スクロール（scrollIntoView 呼び出し）（Req 2.1）
 *
 * Requirements: 2.1, 2.2, 2.3, 2.5
 * Design: LiveCaptureRunner / … LiveTranscriptPane / …
 *
 * # Auto-scroll テスト方法
 *
 * jsdom は `scrollIntoView` を実装しないため、テスト前に
 * `Element.prototype.scrollIntoView` を vi.fn() に置き換える。
 * コンポーネントは `bottomRef.current?.scrollIntoView` の存在を確認してから呼ぶため、
 * spy を設定するとその呼び出しがキャプチャされる。
 * afterEach でオリジナル値（undefined）を復元してテスト間の干渉を防ぐ。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { LiveSegment } from '../../../../../lib/capture/live-state';
import { LiveTranscriptPane } from './live-transcript-pane';

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function makeSegment(
  seq: number,
  role: LiveSegment['speakerRole'],
  text: string,
  speakerLabel?: string,
): LiveSegment {
  return {
    seq,
    speakerRole: role,
    speakerLabel: speakerLabel ?? null,
    text,
    startedAtMs: seq * 5000,
    endedAtMs: seq * 5000 + 4000,
  };
}

// ---------------------------------------------------------------------------
// セットアップ
// ---------------------------------------------------------------------------

let scrollIntoViewMock: ReturnType<typeof vi.fn>;
let originalScrollIntoView: unknown;

beforeEach(() => {
  // jsdom は scrollIntoView を実装しないため、テスト前に mock を設定する
  originalScrollIntoView = Element.prototype.scrollIntoView;
  scrollIntoViewMock = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoViewMock as unknown as typeof Element.prototype.scrollIntoView;
});

afterEach(() => {
  // DOM クリーンアップとモック復元
  cleanup();
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = originalScrollIntoView as typeof Element.prototype.scrollIntoView;
});

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('LiveTranscriptPane', () => {
  // -------------------------------------------------------------------------
  // Req 2.2 / 2.3: 話者ラベルの表示
  // -------------------------------------------------------------------------

  describe('話者ラベル (Req 2.2, 2.3)', () => {
    it('interviewer ロールのセグメントに「面接官」ラベルが表示される', () => {
      const segments = [makeSegment(1, 'interviewer', '自己紹介をお願いします。')];
      render(<LiveTranscriptPane segments={segments} staleTranscript={false} />);

      expect(screen.getByText('面接官')).toBeInTheDocument();
      expect(screen.getByText('自己紹介をお願いします。')).toBeInTheDocument();
    });

    it('candidate ロールのセグメントに「候補者」ラベルが表示される', () => {
      const segments = [makeSegment(2, 'candidate', 'はい、田中と申します。')];
      render(<LiveTranscriptPane segments={segments} staleTranscript={false} />);

      expect(screen.getByText('候補者')).toBeInTheDocument();
      expect(screen.getByText('はい、田中と申します。')).toBeInTheDocument();
    });

    it('unknown ロールのセグメントに「未確定」ラベルが表示される', () => {
      const segments = [makeSegment(3, 'unknown', '聞こえていますか？')];
      render(<LiveTranscriptPane segments={segments} staleTranscript={false} />);

      expect(screen.getByText('未確定')).toBeInTheDocument();
      expect(screen.getByText('聞こえていますか？')).toBeInTheDocument();
    });

    it('複数ロールが混在する場合、各セグメントに正しいラベルが表示される', () => {
      const segments = [
        makeSegment(1, 'interviewer', '質問です。', '面接官A'),
        makeSegment(2, 'candidate', '回答です。', '候補者B'),
        makeSegment(3, 'unknown', '不明な発話'),
      ];
      render(<LiveTranscriptPane segments={segments} staleTranscript={false} />);

      expect(screen.getByText('面接官')).toBeInTheDocument();
      expect(screen.getByText('候補者')).toBeInTheDocument();
      expect(screen.getByText('未確定')).toBeInTheDocument();

      expect(screen.getByText('質問です。')).toBeInTheDocument();
      expect(screen.getByText('回答です。')).toBeInTheDocument();
      expect(screen.getByText('不明な発話')).toBeInTheDocument();
    });

    it('speakerLabel（参加者名）が存在する場合、合わせて表示される', () => {
      const segments = [makeSegment(1, 'interviewer', 'テスト発話', '山田太郎')];
      render(<LiveTranscriptPane segments={segments} staleTranscript={false} />);

      // ロールラベル（主要シグナル）
      expect(screen.getByText('面接官')).toBeInTheDocument();
      // 参加者名（生値）
      expect(screen.getByText('山田太郎')).toBeInTheDocument();
    });

    it('speakerLabel が null の場合、参加者名の要素は表示されない', () => {
      const segments = [makeSegment(1, 'candidate', 'テスト発話', undefined)];
      render(<LiveTranscriptPane segments={segments} staleTranscript={false} />);

      expect(screen.getByText('候補者')).toBeInTheDocument();
      // speakerLabel=null のとき参加者名は描画されない
      expect(screen.queryByLabelText('参加者名')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Req 2.1: 逐次追加表示（手動操作なし）
  // -------------------------------------------------------------------------

  describe('セグメント追加表示 (Req 2.1)', () => {
    it('rerender で新セグメントが追加されると、追加されたセグメントのテキストが表示される', () => {
      const seg1 = makeSegment(1, 'interviewer', '1つ目の発話');
      const { rerender } = render(
        <LiveTranscriptPane segments={[seg1]} staleTranscript={false} />,
      );

      expect(screen.getByText('1つ目の発話')).toBeInTheDocument();
      expect(screen.queryByText('2つ目の発話')).toBeNull();

      // ポーリングで新セグメントが追加された状態をシミュレート（手動操作なし）
      const seg2 = makeSegment(2, 'candidate', '2つ目の発話');
      rerender(<LiveTranscriptPane segments={[seg1, seg2]} staleTranscript={false} />);

      expect(screen.getByText('1つ目の発話')).toBeInTheDocument();
      expect(screen.getByText('2つ目の発話')).toBeInTheDocument();
    });

    it('セグメントは seq 順（到着順）で表示される', () => {
      const segments = [
        makeSegment(1, 'interviewer', '1番目'),
        makeSegment(2, 'candidate', '2番目'),
        makeSegment(3, 'unknown', '3番目'),
      ];
      render(<LiveTranscriptPane segments={segments} staleTranscript={false} />);

      // DOM 上の順序を確認
      const items = screen.getAllByRole('listitem');
      expect(items[0]).toHaveTextContent('1番目');
      expect(items[1]).toHaveTextContent('2番目');
      expect(items[2]).toHaveTextContent('3番目');
    });
  });

  // -------------------------------------------------------------------------
  // Req 2.5: staleTranscript フラグによる遅延表示
  // -------------------------------------------------------------------------

  describe('stale 表示 (Req 2.5)', () => {
    it('staleTranscript=true のとき「転写が遅延しています」が表示される', () => {
      render(<LiveTranscriptPane segments={[]} staleTranscript={true} />);

      expect(screen.getByText('転写が遅延しています')).toBeInTheDocument();
    });

    it('staleTranscript=false のとき「転写が遅延しています」は表示されない', () => {
      render(<LiveTranscriptPane segments={[]} staleTranscript={false} />);

      expect(screen.queryByText('転写が遅延しています')).toBeNull();
    });

    it('stale 表示には role="status" または role="alert" が付与されている', () => {
      render(<LiveTranscriptPane segments={[]} staleTranscript={true} />);

      // role="status" または role="alert" で取得できることを確認
      const notice =
        screen.queryByRole('status') ?? screen.queryByRole('alert');
      expect(notice).toBeInTheDocument();
      expect(notice).toHaveTextContent('転写が遅延しています');
    });

    it('staleTranscript が true から false に変わると表示が消える', () => {
      const { rerender } = render(
        <LiveTranscriptPane segments={[]} staleTranscript={true} />,
      );
      expect(screen.getByText('転写が遅延しています')).toBeInTheDocument();

      rerender(<LiveTranscriptPane segments={[]} staleTranscript={false} />);
      expect(screen.queryByText('転写が遅延しています')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Req 2.1: 自動スクロール
  //
  // 実装: useEffect のキーを segments.length にし、
  //       bottomRef.current?.scrollIntoView を呼ぶ。
  // jsdom での検証: beforeEach で Element.prototype.scrollIntoView を vi.fn() に
  //                 差し替え、呼び出し回数をアサートする。
  // -------------------------------------------------------------------------

  describe('自動スクロール (Req 2.1)', () => {
    it('初期レンダリング時（セグメントあり）に scrollIntoView が呼ばれる', () => {
      const segments = [makeSegment(1, 'interviewer', 'テスト')];
      render(<LiveTranscriptPane segments={segments} staleTranscript={false} />);

      expect(scrollIntoViewMock).toHaveBeenCalled();
    });

    it('セグメントが追加された際に scrollIntoView が再び呼ばれる', () => {
      const seg1 = makeSegment(1, 'interviewer', '1つ目');
      const { rerender } = render(
        <LiveTranscriptPane segments={[seg1]} staleTranscript={false} />,
      );

      const callCountAfterFirstRender = scrollIntoViewMock.mock.calls.length;

      const seg2 = makeSegment(2, 'candidate', '2つ目');
      rerender(<LiveTranscriptPane segments={[seg1, seg2]} staleTranscript={false} />);

      // rerender 後に追加で呼ばれている
      expect(scrollIntoViewMock.mock.calls.length).toBeGreaterThan(callCountAfterFirstRender);
    });

    it('セグメントが変化しない rerender では scrollIntoView が追加呼び出しされない', () => {
      const segments = [makeSegment(1, 'interviewer', 'テスト')];
      const { rerender } = render(
        <LiveTranscriptPane segments={segments} staleTranscript={false} />,
      );

      const callCountAfterFirstRender = scrollIntoViewMock.mock.calls.length;

      // セグメント数は変えず staleTranscript だけ更新
      rerender(<LiveTranscriptPane segments={segments} staleTranscript={true} />);

      // scrollIntoView は追加で呼ばれていない
      expect(scrollIntoViewMock.mock.calls.length).toBe(callCountAfterFirstRender);
    });
  });
});
