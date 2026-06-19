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
  const name =
    session.kind === 'stage2' ? session.candidateProfile.displayName : session.candidate.name;
  const role = session.kind === 'stage2' ? session.opening.title : session.session.role;

  return (
    <header className="flex items-center gap-4 rounded-xl border border-hairline bg-card p-6">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-nav-active text-lg font-medium text-nav-active-ink">
        {name.charAt(0)}
      </span>
      <div className="space-y-0.5">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{name}</h1>
        <p className="text-sm text-body">{role}</p>
      </div>
    </header>
  );
}
