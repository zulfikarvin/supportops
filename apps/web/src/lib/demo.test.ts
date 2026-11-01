import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoRoles, isDemoMode, isLocalDemoMode, isPortfolioMode, portfolioPersonas, parseDemoRole } from './demo';
import { roles } from './roles';
afterEach(() => vi.unstubAllEnvs());
describe('demo access boundary', () => {
  it('defaults to password-free demo access', () => {
    vi.stubEnv('SUPPORTOPS_AUTH_MODE', undefined);
    expect(isDemoMode()).toBe(true);
  });
  it('disables demo access in Supabase mode and for invalid configuration', () => {
    for (const mode of ['supabase', 'invalid']) {
      vi.stubEnv('SUPPORTOPS_AUTH_MODE', mode);
      expect(isDemoMode()).toBe(false);
    }
  });
  it('accepts all five personas and rejects arbitrary roles', () => {
    expect(demoRoles.map(item => parseDemoRole(item.role))).toEqual([...roles]);
    for (const value of ['admin', '', null, undefined, {}, 'Customer']) expect(parseDemoRole(value)).toBeNull();
  });
  it('uses the role picker with Supabase storage in hosted portfolio mode', () => {
    vi.stubEnv('SUPPORTOPS_AUTH_MODE', 'portfolio');
    expect(isDemoMode()).toBe(true);
    expect(isPortfolioMode()).toBe(true);
    expect(isLocalDemoMode()).toBe(false);
    expect(portfolioPersonas.map(person=>person.role)).toEqual([...roles]);
    expect(new Set(portfolioPersonas.map(person=>person.id)).size).toBe(5);
  });
});
