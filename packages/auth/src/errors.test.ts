import { describe, it, expect } from 'vitest';
import { AuthError } from './errors';
import type { AuthErrorCode } from './errors';

describe('AuthError', () => {
  it('既存のコードで構築できる', () => {
    const err = new AuthError('UNAUTHORIZED');
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.name).toBe('AuthError');
    expect(err instanceof Error).toBe(true);
  });

  it('COMPANY_INACTIVE で構築でき、code と name が正しい', () => {
    const err = new AuthError('COMPANY_INACTIVE');
    expect(err.code).toBe('COMPANY_INACTIVE');
    expect(err.name).toBe('AuthError');
  });

  it('COMPANY_INACTIVE が AuthErrorCode 型に代入可能である（型レベルチェック）', () => {
    // この代入が型エラーにならないことがコンパイル時に保証される
    const code: AuthErrorCode = 'COMPANY_INACTIVE';
    expect(code).toBe('COMPANY_INACTIVE');
  });
});
