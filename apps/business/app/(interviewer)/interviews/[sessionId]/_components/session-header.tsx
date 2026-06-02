/**
 * SessionHeader コンポーネント
 *
 * Stage 1（candidate.name + session.role）と
 * Stage 2（candidateProfile.displayName + opening.title）の分岐ヘッダー表示。
 *
 * Requirements: 5.1, 5.2
 */

import type { InterviewSessionResult } from '@bulr/db/queries';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SessionHeaderProps {
  session: InterviewSessionResult;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SessionHeader({ session }: SessionHeaderProps) {
  if (session.kind === 'stage2') {
    return (
      <header className="rounded-xl bg-white p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {session.candidateProfile.displayName}
          </h1>
          <p className="text-sm text-gray-500">{session.opening.title}</p>
        </div>
      </header>
    );
  }

  // stage1: candidate.name + session.role（applied_role 相当）
  return (
    <header className="rounded-xl bg-white p-6 shadow-sm">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">{session.candidate.name}</h1>
        <p className="text-sm text-gray-500">{session.session.role}</p>
      </div>
    </header>
  );
}
