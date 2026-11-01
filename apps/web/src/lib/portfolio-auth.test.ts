import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { portfolioPersonas } from './demo';

const state = vi.hoisted(() => ({ profile: { id: '', display_name: '', role: '' }, signOut: vi.fn(), redirect: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: state.redirect }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('./supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: { id: state.profile.id } }, error: null }), signOut: state.signOut }, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: state.profile }) }) }) }) })) }));

import { requireUser } from './auth';
import { logout } from '@/app/login/actions';

beforeEach(() => {
  vi.stubEnv('SUPPORTOPS_AUTH_MODE', 'portfolio');
  state.profile = { id: portfolioPersonas[1].id, display_name: 'Alex Morgan', role: 'support_analyst' };
  state.signOut.mockResolvedValue({ error: null });
  state.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe('hosted portfolio session boundaries', () => {
  it('accepts only a fixed persona with its actual matching database role', async () => {
    expect((await requireUser()).profile.role).toBe('support_analyst');
    state.profile = { ...state.profile, role: 'product_tech' };
    await expect(requireUser()).rejects.toThrow('redirect:/login');
  });
  it('does not reuse a normal provisioned user as a portfolio identity', async () => {
    state.profile = { id: 'unrelated-user', display_name: 'Existing employee', role: 'support_analyst' };
    await expect(requireUser()).rejects.toThrow('redirect:/login');
    vi.stubEnv('SUPPORTOPS_AUTH_MODE', 'supabase');
    expect((await requireUser()).profile.id).toBe('unrelated-user');
  });
  it('exits only the current browser session so other reviewers can keep using a shared persona', async () => {
    await expect(logout()).rejects.toThrow('redirect:/login');
    expect(state.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
