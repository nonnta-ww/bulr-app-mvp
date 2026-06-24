import { describe, it, expect } from 'vitest';
import { companyRoleSchema, companyStatusSchema } from './schemas';

describe('companyRoleSchema', () => {
  it('admin を受け入れる', () => {
    expect(companyRoleSchema.parse('admin')).toBe('admin');
  });

  it('member を受け入れる', () => {
    expect(companyRoleSchema.parse('member')).toBe('member');
  });

  it('列挙外の値を拒否する', () => {
    expect(() => companyRoleSchema.parse('owner')).toThrow();
    expect(() => companyRoleSchema.parse('')).toThrow();
    expect(() => companyRoleSchema.parse('viewer')).toThrow();
  });
});

describe('companyStatusSchema', () => {
  it('active を受け入れる', () => {
    expect(companyStatusSchema.parse('active')).toBe('active');
  });

  it('suspended を受け入れる', () => {
    expect(companyStatusSchema.parse('suspended')).toBe('suspended');
  });

  it('terminated を受け入れる', () => {
    expect(companyStatusSchema.parse('terminated')).toBe('terminated');
  });

  it('列挙外の値を拒否する', () => {
    expect(() => companyStatusSchema.parse('inactive')).toThrow();
    expect(() => companyStatusSchema.parse('disabled')).toThrow();
    expect(() => companyStatusSchema.parse('')).toThrow();
  });
});
