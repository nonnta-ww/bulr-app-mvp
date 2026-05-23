/**
 * apps/candidate トップページ（プレースホルダ）
 *
 * monorepo-app-split Task 5.1 で配置するスケルトン。
 * 本タスクでは候補者向け業務機能（履歴書登録・スキルアンケート・自己診断・
 * 模擬面接・エントリー）は実装せず、後続 Wave 2〜4 で拡張する。
 *
 * 認証配線（Better Auth Magic Link / sign-in ページ）は Task 5.2 で追加するため、
 * 現時点では誰でも到達可能な静的プレースホルダのみを返す。
 *
 * Requirements: 4.1, 4.6, 1.4, 1.6, 8.3, 10.1
 */

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">bulr 候補者ポータル</h1>
      <p className="text-sm text-gray-600">Welcome — Coming soon</p>
    </main>
  );
}
