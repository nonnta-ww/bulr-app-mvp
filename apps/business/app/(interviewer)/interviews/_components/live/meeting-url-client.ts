/**
 * クライアントサイド会議 URL バリデーター（UX フィードバック専用）
 *
 * # クライアント・サーバー分離の注記
 *
 * `apps/business/lib/capture/recall-client.ts` の `meetingUrlSchema` は同ファイル冒頭に
 * `import 'server-only'` があるため、クライアントコンポーネントからインポートできない。
 * このファイルは同じ 3 サービス判定ロジック（Zoom / Google Meet / Microsoft Teams）を
 * クライアント側に複製し、入力時の即時フィードバックに使う。
 *
 * **検証の真実源はサーバーアクション `startCapture` の `meetingUrlSchema`（Zod）**であり、
 * このファイルの `isValidMeetingUrl` は UI の UX フィードバックのみを目的とする。
 * サーバー側の検証に加えてクライアント側でも弾くことで二重保護を実現するが、
 * クライアント側の検証を迂回しても startCapture が最終判定を行う。
 *
 * 正規表現パターンは recall-client.ts の定義と同一にすること（drift 防止）。
 * パターンを変更する場合は両ファイルを同時に更新する。
 *
 * Requirements: 1.2, 7.2
 */

/** Zoom: zoom.us/j/{id} または zoom.us/my/{room} */
const ZOOM_REGEX =
  /^https:\/\/(?:[a-z0-9-]+\.)?zoom\.us\/(j|my)\/[a-zA-Z0-9?=&._-]+/;

/** Google Meet: meet.google.com/{code} (xxx-xxxx-xxx パターン) */
const MEET_REGEX =
  /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\/.*)?$/;

/** Microsoft Teams: teams.microsoft.com/l/meetup-join/... または teams.live.com/meet/... */
const TEAMS_REGEX =
  /^https:\/\/(teams\.microsoft\.com\/l\/meetup-join\/|teams\.live\.com\/meet\/)[a-zA-Z0-9%@._~:/?#[\]!$&'()*+,;=-]+/;

/**
 * 会議 URL が Zoom / Google Meet / Microsoft Teams の形式か判定する。
 *
 * @param url - 検証対象の URL 文字列
 * @returns 3 サービスのいずれかに一致すれば true
 *
 * @remarks
 * この関数はクライアントコンポーネントから呼び出せるよう `server-only` を持たない。
 * UX フィードバック専用であり、サーバーアクション `startCapture` の Zod 検証が
 * 認可の最終判定を行う。
 */
export function isValidMeetingUrl(url: string): boolean {
  return ZOOM_REGEX.test(url) || MEET_REGEX.test(url) || TEAMS_REGEX.test(url);
}
