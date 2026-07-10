/**
 * RPG クラス診断 ページ（Server Component, task 8.1）
 *
 * 認証済み候補者の最新クラス診断と診断入力（skill/playstyle）を取得し、陳腐化を算出して
 * ClassDiagnosisView（Client）へ委譲する。表示状態の分岐（NoVocation / Empty /
 * PartialNoTemperament / Complete / VizOnly / Stale）は view 側が props から導出する。
 *
 * 手順:
 *   1. 認証ガード（requireCandidate）。未認証は sign-in / onboarding へ redirect（Req 11.1）。
 *   2. 本人所有スコープで record / source / playstyle を取得（candidateProfile.id フィルタ）。
 *   3. フラグ算出:
 *        hasSkill    = source.surveys.length > 0
 *        hasPlaystyle = playstyle !== null
 *        currentSig  = buildSourceSignature(source, playstyle?.responseId ?? null)
 *        isStale     = record !== null && record.sourceSignature !== currentSig（Req 6.2/6.3）
 *   4. ClassDiagnosisView へシリアライズ可能な props を渡す。数値スコアは表示しない（Req 4.4, view 側）。
 *
 * Requirements: 4.1, 4.4, 6.2, 6.3, 8.1, 8.2, 11.1
 * Boundary: class-diagnosis page
 */

import { redirect } from 'next/navigation';

import { AuthError, requireCandidate } from '@bulr/auth/server';
import {
  getLatestClassDiagnosis,
  getCandidateVocationSource,
  getCandidatePlaystyleResponse,
  getPlaystyleSurveyId,
  getCandidateWorklifeDispositionResponse,
} from '@bulr/db';

import { ClassDiagnosisView } from './_components/class-diagnosis-view';
import { buildSourceSignature } from './_lib/build-diagnosis';
import { mapTemperamentAnswers } from '../_lib/temperament/answers';
import { scoreTemperament } from '../_lib/temperament/score';
import { normalizeClassResultTemperament } from '../_lib/temperament/legacy';
import { mapWorklifeDispositionAnswers } from './_lib/worklife-disposition/answers';
import { scoreWorklifeDispositions } from './_lib/worklife-disposition/score';

export default async function ClassDiagnosisPage() {
  // ── アクセス制御 ──（Req 11.1）
  let candidateProfileId: string;
  try {
    const { candidateProfile } = await requireCandidate();
    candidateProfileId = candidateProfile.id;
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'UNAUTHORIZED') redirect('/sign-in');
      if (err.code === 'CANDIDATE_PROFILE_MISSING') redirect('/onboarding');
    }
    throw err;
  }

  // ── 本人所有スコープでレコード・診断入力 + playstyle/志向 アンケートを取得 ──
  const [record, source, playstyle, playstyleSurveyId, worklifeResponse] =
    await Promise.all([
      getLatestClassDiagnosis(candidateProfileId),
      getCandidateVocationSource(candidateProfileId),
      getCandidatePlaystyleResponse(candidateProfileId),
      getPlaystyleSurveyId(),
      getCandidateWorklifeDispositionResponse(candidateProfileId),
    ]);

  // ── フラグ算出 ──
  const hasSkill = source.surveys.length > 0;
  const hasPlaystyle = playstyle !== null;

  // 現在の診断入力署名（保存済み署名との差分で陳腐化を判定）（Req 6.2/6.3）。
  const currentSig = buildSourceSignature(source, playstyle?.responseId ?? null);
  const isStale = record !== null && record.sourceSignature !== currentSig;

  // playstyle 回答をライブ算出（気質のみ回答者への気質結果提示に用いる, Req 6.2）。
  const playstyleProfile = scoreTemperament(mapTemperamentAnswers(playstyle));

  // 働き方の志向をライブ算出（未回答時は {} で既存挙動と一致, worklife-disposition-survey R3.1/4.1）。
  const dispositions = scoreWorklifeDispositions(
    mapWorklifeDispositionAnswers(worklifeResponse),
  );

  // 気質アンケートへの deep-link（未 seed 時は一覧へフォールバック, Req 6.1/error-handling）。
  const playstyleSurveyHref = playstyleSurveyId
    ? `/skill-survey/${playstyleSurveyId}`
    : '/skill-survey';

  // 既存レコードの気質を legacy 正規化してから描画する（旧行を partial 化, Req 7.4）。
  const normalizedRecord = record
    ? {
        ...record,
        result: {
          ...record.result,
          temperament: normalizeClassResultTemperament(
            record.result.temperament,
          ),
        },
      }
    : null;

  return (
    <main className="mx-auto w-full max-w-[1000px] px-4 py-8 md:px-12 md:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
          あなたのWebエンジニアクラス
        </h1>
        <p className="mt-2 text-sm text-muted">
          これまでのスキル・気質アンケートの回答から、あなたのクラスを判定します。
        </p>
      </header>

      <ClassDiagnosisView
        record={normalizedRecord}
        flavor={normalizedRecord?.llmFlavor ?? null}
        hasSkill={hasSkill}
        hasPlaystyle={hasPlaystyle}
        isStale={isStale}
        playstyleProfile={playstyleProfile}
        playstyleSurveyHref={playstyleSurveyHref}
        dispositions={dispositions}
      />
    </main>
  );
}
