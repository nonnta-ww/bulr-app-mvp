/**
 * cooldown.ts — 30日（既定）クールダウン判定。
 *
 * `canReAnswer` は純関数・決定論的。`now` と `cooldownDays` を引数注入することで
 * 副作用（Date.now() / argless new Date()）を持たない。
 * 同一アンケートの再回答を前回提出から cooldownDays 日間（既定30日）抑止する。
 *
 * Requirements 対応: 2.1, 2.2, 2.3, 2.4
 */

export interface CooldownVerdict {
  /** true = 再回答可能、false = クールダウン中 */
  allowed: boolean;
  /**
   * allowed=false のとき、再回答が解禁される日時。
   * allowed=true のときは null。
   */
  nextAvailableAt: Date | null;
}

/**
 * 最新提出日時と現在時刻から、同一アンケートの再回答可否と再開日時を算出する。
 *
 * @param lastSubmittedAt - 最新の回答提出日時。null は未回答（初回）を意味する。
 * @param now             - 判定基準の現在時刻（引数注入で決定論化）。
 * @param cooldownDays    - クールダウン日数（既定30日）。
 * @returns CooldownVerdict
 *
 * ロジック:
 * - lastSubmittedAt === null (初回・未回答) → allowed=true (Req 2.4 — クールダウン対象外)
 * - nextAvailableAt = lastSubmittedAt + cooldownDays * 24h (ミリ秒精度で計算)
 *   - now >= nextAvailableAt → allowed=true (Req 2.3 — 30日以上経過)
 *   - now <  nextAvailableAt → allowed=false, nextAvailableAt を返す (Req 2.1, 2.2)
 */
export function canReAnswer(
  lastSubmittedAt: Date | null,
  now: Date,
  cooldownDays: number = 30,
): CooldownVerdict {
  // 初回（履歴なし）は常に許可 (Req 2.4)
  if (lastSubmittedAt === null) {
    return { allowed: true, nextAvailableAt: null };
  }

  // 再開日時をミリ秒精度で算出（date math を一貫してミリ秒演算で行う）
  const nextAvailableAt = new Date(
    lastSubmittedAt.getTime() + cooldownDays * 24 * 60 * 60 * 1000,
  );

  // now >= nextAvailableAt なら解禁（Req 2.3）
  if (now.getTime() >= nextAvailableAt.getTime()) {
    return { allowed: true, nextAvailableAt: null };
  }

  // クールダウン中（Req 2.1, 2.2）
  return { allowed: false, nextAvailableAt };
}
