/**
 * class-diagnosis-query — 保存・履歴・cooldown・代表クラス（実 DB 接続）統合テスト
 *
 * 検証内容（task 4.2 / Req 6.1, 6.2, 6.4, 10.2, 10.3, 11.3）:
 *  1. 版追記（append-only）: 異なる sourceSignature で upsert すると別版として保持され、
 *     getClassDiagnosisHistory は全版を、getLatestClassDiagnosis は最新版を返す（Req 6.1, 6.2）。
 *  2. 版デデュープ: 同一 sourceSignature で 2 回 upsert すると 1 行のまま最後の payload を反映（Req 6.1）。
 *  3. 再生成 cooldown: fresh signature は nextCount 1 で許可、窓内で上限到達すると拒否（Req 6.4）。
 *  4. 代表クラス最小開示: getRepresentativeClass は className/primaryVocation/title のみを返し、
 *     sourceSnapshot/result/vocationVector 等の根拠を含めない。診断が無ければ null（Req 10.2, 10.3, 11.3）。
 *  5. 本人スコープ: 別候補者の診断は返さない（Req 11.3）。
 *
 * 実行前提: ローカル Postgres が起動し DATABASE_URL が指す DB に接続できること。
 *   DATABASE_URL 未設定時はスイートごと skip する（CI はテストを実行しない）。
 * スキーマは drizzle migrator で自己適用する（適用済みなら no-op）。
 */

import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import type {
  ClassResult,
  ClassDiagnosisSourceSnapshot,
  ClassFlavor,
  ClassDiagnosisMetadata,
  Vocation,
} from '@bulr/types/class-diagnosis';

import type { DB } from '../client';
import { classDiagnosis } from '../schema/class-diagnosis';
import { candidateProfile } from '../schema/candidate-profile';
import { user } from '../schema/auth';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  console.warn('[class-diagnosis-query.integration] DATABASE_URL 未設定のためスキップします。');
}

// 動的 import で取得する値（DATABASE_URL があるときのみ client を評価する）
let db: DB;
let q: typeof import('../queries/class-diagnosis/class-diagnosis-query');

// 後始末用に作成したレコード ID
const created: { userIds: string[]; profileIds: string[] } = {
  userIds: [],
  profileIds: [],
};

// ---------------------------------------------------------------------------
// フィクスチャビルダー（JSON はテーブルにとって不透明なので直接組む）
// ---------------------------------------------------------------------------

function makeVocationVector(): Record<Vocation, number> {
  return {
    vanguard: 20,
    rearguard: 80,
    guardian: 10,
    sage: 15,
    commander: 5,
    strategist: 5,
    ranger: 30,
  };
}

function makeResult(overrides: Partial<ClassResult> = {}): ClassResult {
  return {
    primaryVocation: 'rearguard',
    subVocations: ['ranger'],
    vocationVector: makeVocationVector(),
    temperament: 'deepener_solo',
    temperamentBalanced: false,
    title: 'specialist',
    representativeVocation: 'rearguard',
    className: '深淵の後衛',
    confidence: 'normal',
    ...overrides,
  };
}

function makeSnapshot(): ClassDiagnosisSourceSnapshot {
  return {
    skillResponses: [
      {
        surveyId: `srv-${randomUUID()}`,
        responseId: `resp-${randomUUID()}`,
        submittedAt: new Date().toISOString(),
        overallCoverageRatio: 0.8,
      },
    ],
    playstyleResponseId: `ps-${randomUUID()}`,
    playstyleSubmittedAt: new Date().toISOString(),
  };
}

const flavor: ClassFlavor = {
  tagline: 'tag',
  description: 'desc',
  nextStepHint: 'hint',
};

const metadata: ClassDiagnosisMetadata = {
  llm_cost_estimate: { input_tokens: 100, output_tokens: 50, estimated_usd: 0.001 },
};

/** user + candidateProfile を 1 組作成し profileId を返す */
async function seedCandidate(displayName: string): Promise<string> {
  const now = new Date();
  const userId = `it-${randomUUID()}`;
  created.userIds.push(userId);
  await db
    .insert(user)
    .values({ id: userId, email: `${userId}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
  const [prof] = await db
    .insert(candidateProfile)
    .values({ userId, displayName })
    .returning({ id: candidateProfile.id });
  created.profileIds.push(prof!.id);
  return prof!.id;
}

describeDb('class-diagnosis-query 統合テスト', () => {
  beforeAll(async () => {
    const clientMod = await import('../client');
    db = clientMod.db;
    q = await import('../queries/class-diagnosis/class-diagnosis-query');

    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(db, { migrationsFolder });
  });

  afterAll(async () => {
    if (!db) return;
    if (created.profileIds.length > 0) {
      await db.delete(classDiagnosis).where(inArray(classDiagnosis.candidateProfileId, created.profileIds));
      await db.delete(candidateProfile).where(inArray(candidateProfile.id, created.profileIds));
    }
    if (created.userIds.length > 0) {
      await db.delete(user).where(inArray(user.id, created.userIds));
    }
  });

  it('異なる signature は別版として追記され、history は全版・latest は最新版を返す (Req 6.1, 6.2)', async () => {
    const profileId = await seedCandidate('history-test');
    const now = new Date();

    // 版 A（古い generatedAt になるよう先に upsert）
    const recA = await q.upsertClassDiagnosis({
      candidateProfileId: profileId,
      sourceSignature: 'sig-A',
      sourceSnapshot: makeSnapshot(),
      result: makeResult({ className: 'クラスA' }),
      llmFlavor: flavor,
      metadata,
      regenerationCount: 1,
      regenerationWindowStart: now,
    });

    // わずかに時間を空けて版 B（より新しい generatedAt）
    await new Promise((r) => setTimeout(r, 5));
    const recB = await q.upsertClassDiagnosis({
      candidateProfileId: profileId,
      sourceSignature: 'sig-B',
      sourceSnapshot: makeSnapshot(),
      result: makeResult({ className: 'クラスB' }),
      llmFlavor: null,
      metadata: null,
      regenerationCount: 1,
      regenerationWindowStart: now,
    });

    // history は 2 版すべて（generatedAt 降順）
    const history = await q.getClassDiagnosisHistory(profileId);
    expect(history).toHaveLength(2);
    expect(history.map((r) => r.sourceSignature)).toEqual(['sig-B', 'sig-A']);
    // llmFlavor/metadata null がそのまま保持される
    const persistedB = history.find((r) => r.sourceSignature === 'sig-B')!;
    expect(persistedB.llmFlavor).toBeNull();
    expect(persistedB.metadata).toBeNull();
    expect(recA.id).not.toBe(recB.id);

    // latest は最新 generatedAt の版 B
    const latest = await q.getLatestClassDiagnosis(profileId);
    expect(latest).not.toBeNull();
    expect(latest!.sourceSignature).toBe('sig-B');
    expect(latest!.result.className).toBe('クラスB');
  });

  it('同一 signature の 2 回目 upsert は 1 行のまま最後の payload を反映（版デデュープ）(Req 6.1)', async () => {
    const profileId = await seedCandidate('dedup-test');
    const now = new Date();

    const first = await q.upsertClassDiagnosis({
      candidateProfileId: profileId,
      sourceSignature: 'sig-dup',
      sourceSnapshot: makeSnapshot(),
      result: makeResult({ className: '初回' }),
      llmFlavor: null,
      metadata: null,
      regenerationCount: 1,
      regenerationWindowStart: now,
    });

    const second = await q.upsertClassDiagnosis({
      candidateProfileId: profileId,
      sourceSignature: 'sig-dup',
      sourceSnapshot: makeSnapshot(),
      result: makeResult({ className: '再生成' }),
      llmFlavor: flavor,
      metadata,
      regenerationCount: 2,
      regenerationWindowStart: now,
    });

    // 同一行が in-place で更新される
    expect(second.id).toBe(first.id);

    const history = await q.getClassDiagnosisHistory(profileId);
    expect(history).toHaveLength(1);
    expect(history[0]!.result.className).toBe('再生成');
    expect(history[0]!.regenerationCount).toBe(2);
    expect(history[0]!.llmFlavor).not.toBeNull();
  });

  it('checkClassRegenerationAllowed: fresh は nextCount 1、窓内上限到達で拒否 (Req 6.4)', async () => {
    const profileId = await seedCandidate('cooldown-test');

    // fresh signature（行なし）→ 許可 nextCount 1
    const fresh = await q.checkClassRegenerationAllowed(profileId, 'sig-fresh');
    expect(fresh.allowed).toBe(true);
    if (fresh.allowed) {
      expect(fresh.nextCount).toBe(1);
    }

    // 窓内で上限（10）に到達した行を作る
    const windowStart = new Date(); // 現在＝窓内
    await q.upsertClassDiagnosis({
      candidateProfileId: profileId,
      sourceSignature: 'sig-limit',
      sourceSnapshot: makeSnapshot(),
      result: makeResult(),
      llmFlavor: null,
      metadata: null,
      regenerationCount: 10,
      regenerationWindowStart: windowStart,
    });

    const blocked = await q.checkClassRegenerationAllowed(profileId, 'sig-limit');
    expect(blocked.allowed).toBe(false);
  });

  it('getRepresentativeClass は className/primaryVocation/title のみを返す（根拠非開示）(Req 10.2, 10.3, 11.3)', async () => {
    const profileId = await seedCandidate('representative-test');

    // 診断なし → null
    const none = await q.getRepresentativeClass(profileId);
    expect(none).toBeNull();

    const now = new Date();
    await q.upsertClassDiagnosis({
      candidateProfileId: profileId,
      sourceSignature: 'sig-rep',
      sourceSnapshot: makeSnapshot(),
      result: makeResult({ primaryVocation: 'vanguard', title: 'sage_hero', className: '英雄の前衛' }),
      llmFlavor: flavor,
      metadata,
      regenerationCount: 1,
      regenerationWindowStart: now,
    });

    const rep = await q.getRepresentativeClass(profileId);
    expect(rep).not.toBeNull();
    expect(rep).toEqual({
      className: '英雄の前衛',
      primaryVocation: 'vanguard',
      title: 'sage_hero',
    });
    // 根拠列を絶対に含めない（sourceSnapshot / result / vocationVector / answers 等）
    expect(Object.keys(rep!).sort()).toEqual(['className', 'primaryVocation', 'title']);
    expect('sourceSnapshot' in rep!).toBe(false);
    expect('result' in rep!).toBe(false);
    expect('vocationVector' in rep!).toBe(false);
  });

  it('本人スコープ: 別候補者の診断は返さない (Req 11.3)', async () => {
    const ownerId = await seedCandidate('owner-test');
    const otherId = await seedCandidate('other-test');
    const now = new Date();

    await q.upsertClassDiagnosis({
      candidateProfileId: otherId,
      sourceSignature: 'sig-other',
      sourceSnapshot: makeSnapshot(),
      result: makeResult({ className: '他者のクラス' }),
      llmFlavor: null,
      metadata: null,
      regenerationCount: 1,
      regenerationWindowStart: now,
    });

    // owner には診断が無いので latest / representative は null、history は空
    expect(await q.getLatestClassDiagnosis(ownerId)).toBeNull();
    expect(await q.getRepresentativeClass(ownerId)).toBeNull();
    expect(await q.getClassDiagnosisHistory(ownerId)).toEqual([]);

    // other 本人には返る
    const otherLatest = await q.getLatestClassDiagnosis(otherId);
    expect(otherLatest).not.toBeNull();
    expect(otherLatest!.result.className).toBe('他者のクラス');
  });
});
