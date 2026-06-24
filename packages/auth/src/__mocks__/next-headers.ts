// vitest 用 next/headers スタブ。
// requireCompanyUser の DB 呼び出しはテスト対象外（resolveCompanyAccess のみテスト）。
// 実際に呼ばれた場合は空の Headers を返す。
export const headers = async () => new Headers();
