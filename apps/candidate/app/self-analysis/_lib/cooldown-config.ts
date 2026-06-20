/**
 * cooldown-config.ts — 再回答クールダウン日数の解決。
 *
 * 既定は 30 日。環境変数 `SURVEY_COOLDOWN_DAYS` で上書きできる（サーバ専用）。
 *   - 開発・テスト時は `.env.local` に `SURVEY_COOLDOWN_DAYS=0` を置くとクールダウンを無効化できる
 *     （0 日 → 提出直後から再回答可能）。
 *   - 任意の日数に短縮することも可能（例: `SURVEY_COOLDOWN_DAYS=1`）。
 *
 * 本番は env を未設定にしておけば既定 30 日のまま（[[project_self_analysis_history]]）。
 *
 * 解決ロジックは raw 文字列を引数で受け取れるようにして純粋にテスト可能にする。
 */

/** 既定クールダウン日数 */
export const DEFAULT_COOLDOWN_DAYS = 30;

/**
 * 環境変数からクールダウン日数を解決する。
 * 未設定・空・非数値・負値は既定値（30）にフォールバックする。
 * 小数は切り捨て（floor）して整数日数として扱う。
 *
 * @param raw - 解決元の文字列（既定で process.env.SURVEY_COOLDOWN_DAYS を読む）
 */
export function resolveCooldownDays(
  raw: string | undefined = process.env.SURVEY_COOLDOWN_DAYS,
): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_COOLDOWN_DAYS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_COOLDOWN_DAYS;
  }

  return Math.floor(parsed);
}
