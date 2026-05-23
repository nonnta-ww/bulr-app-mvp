/**
 * selectProposalChoice Server Action
 *
 * 面接官が候補質問を選択したとき、question_proposal.selected_index を更新する。
 * 所有権チェックにより、他の面接官のプロポーザルは更新できない。
 *
 * Requirements: 6.5, 6.6
 */

'use server';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@bulr/db';
import { interviewSession, questionProposal } from '@bulr/db/schema';

import { requireSessionOwnership } from '@bulr/auth/server';
import { authedAction } from '@bulr/auth/server';

const schema = z.object({
  proposalId: z.string(),
  selectedIndex: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]),
});

export const selectProposalChoice = authedAction(
  schema,
  async (input, { userId }) => {
    // プロポーザルを取得して session_id を得る
    const proposal = await db.query.questionProposal.findFirst({
      where: eq(questionProposal.id, input.proposalId),
    });

    // セッション取得と所有権チェック
    const session = proposal
      ? await db.query.interviewSession.findFirst({
          where: eq(interviewSession.id, proposal.session_id),
        })
      : null;

    requireSessionOwnership(
      session ? { interviewerId: session.interviewer_id } : null,
      userId,
    );

    // selected_index を更新
    await db
      .update(questionProposal)
      .set({ selected_index: input.selectedIndex })
      .where(eq(questionProposal.id, input.proposalId));
  },
);
