// vitest 用 createAuth スタブ。
// guards.ts は内部で createAuth() を呼ぶが、resolveCompanyAccess のユニットテストでは
// 実際の Better Auth インスタンスは不要なため no-op を返す。
export const createAuth = (_opts: unknown) => ({
  api: {
    getSession: async () => null,
  },
});
