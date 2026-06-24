// vitest 用 @bulr/db スタブ。
// guards.ts の resolveCompanyAccess はピュア関数であり DB 呼び出しを行わないため、
// db / schema の実体はスタブとして提供する。
// requireCompanyUser の DB 呼び出しはインテグレーションテスト（task 7.2）でカバーする。

export const db = {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
};

export const schema = {};
