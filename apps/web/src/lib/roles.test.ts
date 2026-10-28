import { describe, expect, it } from 'vitest';
import { roles, isInternal, canTriage, canInvestigate } from './roles';
describe('capability model', () => {
  it('denies customer internal capabilities', () => {
    expect(isInternal('customer')).toBe(false);
    expect(canTriage('customer')).toBe(false);
    expect(canInvestigate('customer')).toBe(false);
  });
  it('limits triage to support analysts', () => {
    expect(roles.filter(canTriage)).toEqual(['support_analyst']);
  });
  it('allows technical teams to investigate', () => {
    expect(roles.filter(canInvestigate)).toEqual(['support_analyst','data_engineer','product_tech']);
    expect(isInternal('customer_success')).toBe(true);
  });
});
