import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { records, MissingStudyCaseMigration } from './case-service';
import type { Context } from './service';

function context(code: string): Context {
  const query = { order: () => query, range: async () => ({ data: null, error: { code } }) };
  return { actor: { role: 'support_analyst' }, client: { from: () => ({ select: () => query }) } } as unknown as Context;
}
describe('staff schema readiness', () => {
  it.each(['PGRST205', '42P01'])('identifies missing investigation tables (%s)', async code => {
    await expect(records(context(code))).rejects.toBeInstanceOf(MissingStudyCaseMigration);
  });
  it('does not treat permission failures as missing migrations', async () => {
    const error = await records(context('42501')).catch(error => error);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(MissingStudyCaseMigration);
  });
});
