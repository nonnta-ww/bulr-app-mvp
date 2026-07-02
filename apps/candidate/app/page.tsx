/**
 * apps/candidate トップページ（サインイン済みホーム）
 *
 * - 未サインインなら `/sign-in` にリダイレクト
 * - サインイン済みかつ candidate_profile 未存在なら `/onboarding` にリダイレクト
 * - サインイン済みかつ candidate_profile 存在なら本ページ（成長ダッシュボード）を表示
 *
 * candidate-auth-onboarding Requirements: 4.3, 4.4
 * Wave 1 既存 Requirements: 4.2, 4.4, 4.5, 4.7
 * candidate-self-analysis Requirements: 8.1, 8.2
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { getCurrentUser } from '@bulr/auth/server';
import { db } from '@bulr/db';
import { candidateProfile } from '@bulr/db/schema';

/** ホーム右カラムに並べる導線カード */
const SECONDARY_CARDS = [
  {
    href: '/skill-survey',
    symbol: 'assessment',
    title: 'スキルアンケート',
    description: '現在の技術スタックと習熟度を記録し、自己分析の精度を高めます。',
  },
  {
    href: '/resume',
    symbol: 'description',
    title: '履歴書',
    description: '自己分析の結果を元に、あなたの魅力が伝わる職務経歴書を作成します。',
  },
  {
    href: '/mock-interview',
    symbol: 'forum',
    title: '模擬面接',
    description: 'AI を活用した実践的な面接練習で、本番での対応力を磨きます。',
  },
] as const;

export default async function Page() {
  const user = await getCurrentUser();
  if (user === null) {
    redirect('/sign-in');
  }

  const [profile] = await db
    .select({ id: candidateProfile.id, displayName: candidateProfile.displayName })
    .from(candidateProfile)
    .where(eq(candidateProfile.userId, user.id))
    .limit(1);

  if (!profile) {
    redirect('/onboarding');
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-12 md:py-12">
      {/* 挨拶ヘッダ */}
      <div className="mb-10 md:mb-12">
        <h1 className="text-2xl font-bold text-ink md:text-3xl">
          こんにちは、{profile.displayName} さん
        </h1>
        <p className="mt-2 text-base text-body md:text-lg">
          今日も成長に向けた一歩を踏み出しましょう。
        </p>
      </div>

      {/* Bento グリッド */}
      <div className="grid auto-rows-min grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
        {/* メインカード: 自己分析（デスクトップで 2 カラム分） */}
        <section className="relative flex flex-col justify-between overflow-hidden rounded-card border border-hairline bg-card p-6 shadow-ambient md:col-span-2 md:p-10">
          {/* 装飾グラデーション */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-bl-full bg-gradient-to-br from-primary/15 to-transparent opacity-60"
          />
          <div>
            <div className="mb-4 flex items-center gap-3">
              <span className="material-symbols-outlined text-3xl text-primary" aria-hidden="true">
                psychology
              </span>
              <h2 className="text-2xl font-bold text-ink">自己分析を見る</h2>
            </div>
            <p className="mb-6 max-w-lg text-base text-body">
              あなたの強みや適性を深く理解し、キャリアの方向性を明確にします。客観的なデータに基づいたインサイトを提供します。
            </p>
            <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2">
              <span className="material-symbols-outlined text-[18px] text-slate" aria-hidden="true">
                info
              </span>
              <span className="text-xs text-navy-soft">
                ※ スキルアンケートの回答が必要です
              </span>
            </div>
          </div>
          <div className="mt-auto flex justify-end">
            <Link
              href="/self-analysis"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3 text-sm font-bold text-on-primary shadow-sm transition-opacity hover:opacity-90"
            >
              分析を開始する
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          </div>
        </section>

        {/* 右カラム: 導線カードのスタック */}
        <div className="flex flex-col gap-6 md:gap-8">
          {SECONDARY_CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group flex h-full flex-col rounded-card border border-hairline bg-card p-6 shadow-ambient transition-colors hover:border-slate hover:bg-surface-2"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {card.symbol}
                  </span>
                  <h3 className="text-lg font-medium text-ink">{card.title}</h3>
                </div>
                <span
                  className="material-symbols-outlined text-hairline transition-colors group-hover:text-slate"
                  aria-hidden="true"
                >
                  chevron_right
                </span>
              </div>
              <p className="mt-auto text-xs text-body">{card.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
