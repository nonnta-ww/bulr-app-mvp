/**
 * 面接中ページ（Server Component）
 *
 * draft / in_progress セッション: LiveCaptureRunner（新方式のみ）を表示する（Req 6.1）。
 * completed セッション: 既存レポートページへリダイレクト（互換維持）。
 *
 * 設計方針:
 * - Server Component で DB / 認証を処理し、平易な props として client runner に渡す。
 * - 進行状態（capture_status 等）のポーリングは LiveCaptureRunner 内の useLiveState が担う。
 * - エントリー由来のセッション（session-from-entry）は SessionHeader が候補者情報を表示する。
 *   planned_pattern_codes は live-state ポーリング（/api/interview/sessions/{id}/live-state）
 *   経由でランナーに届くため、ページから直接渡す必要はない（Req 6.3）。
 *
 * Requirements: 6.1, 6.3
 */

import { notFound, redirect } from 'next/navigation';

import { getInterviewSession, loadSessionWithTurns } from '@bulr/db/queries';
import { requireUser } from '@bulr/auth/server';

import { LiveCaptureRunner } from '../_components/live/live-capture-runner';
import { SessionHeader } from './_components/session-header';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  params: Promise<{ sessionId: string }>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function InterviewSessionPage({ params }: Props) {
  const { sessionId } = await params;

  // 認証チェック
  let user: { id: string; email: string };
  try {
    user = await requireUser();
  } catch {
    redirect('/sign-in');
  }

  // セッション + ターンをロード（userId でスコープ済み = 所有権チェック）
  // 新方式では turns / proposals は LiveCaptureRunner + useLiveState が管理するが、
  // loadSessionWithTurns は所有権チェック + status の取得に引き続き使用する。
  const sessionData = await loadSessionWithTurns(sessionId, user.id);

  if (!sessionData) {
    notFound();
  }

  const { session } = sessionData;

  // 完了済みの場合はレポートページへリダイレクト（既存互換）
  if (session.status === 'completed') {
    redirect('/interviews/' + sessionId + '/report');
  }

  // SessionHeader 用 + capture 系カラム（capture_status / consent_obtained_at / meeting_url）取得
  const interviewSessionResult = await getInterviewSession(sessionId);

  if (!interviewSessionResult) {
    notFound();
  }

  // 同意取得済みフラグ（Req 1.6）
  // consent_obtained_at は DB 上 notNull だが、型上 null チェックを行って CaptureStartPanel に渡す
  const consentObtained =
    interviewSessionResult.session.consent_obtained_at !== null;

  // 前回試行した会議 URL（CaptureStartPanel の初期値、失敗後のリトライに使う）
  const initialMeetingUrl = interviewSessionResult.session.meeting_url ?? null;

  return (
    <main className="px-6 py-8 md:px-10">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
        {/* SessionHeader: 候補者名・役職を表示（Stage 1 / Stage 2 分岐。エントリー由来の場合も対応）（Req 6.3） */}
        <SessionHeader session={interviewSessionResult} />

        {/* LiveCaptureRunner: 新キャプチャ方式のみ提供（旧 状態A/B UI は提供しない）（Req 6.1） */}
        <LiveCaptureRunner
          sessionId={sessionId}
          consentObtained={consentObtained}
          initialMeetingUrl={initialMeetingUrl}
        />
      </div>
    </main>
  );
}
