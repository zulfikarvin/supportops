import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { cookieReader } = vi.hoisted(() => ({ cookieReader: vi.fn(async () => ({ get: () => ({ value: 'product_tech' }) })) }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: cookieReader }));
vi.mock('../auth', () => ({ requireUser: vi.fn(async () => ({
  profile: { id: 'real-user', display_name: 'Authenticated Engineer', role: 'data_engineer' },
  client: { from: () => ({ select: () => ({ eq: async () => ({ data: [{ organization_id: 'authorized-org' }], error: null }) }) }) },
})) }));

import { ticketContext } from './service';
import { POST } from '@/app/api/demo-session/route';

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('dashboard authorization boundary', () => {
  it('uses the authenticated profile rather than a demo role cookie in Supabase mode', async () => {
    vi.stubEnv('SUPPORTOPS_AUTH_MODE', 'supabase');
    const context = await ticketContext();
    expect(context.actor).toEqual({ id: 'real-user', name: 'Authenticated Engineer', role: 'data_engineer', organizationIds: ['authorized-org'] });
    expect(cookieReader).not.toHaveBeenCalled();
  });
  it('refuses demo role switching in Supabase mode without issuing a session cookie', async () => {
    vi.stubEnv('SUPPORTOPS_AUTH_MODE', 'supabase');
    const request = new NextRequest('http://localhost:3000/api/demo-session', { method: 'POST', headers: { origin: 'http://localhost:3000', host: 'localhost:3000' }, body: new URLSearchParams({ role: 'product_tech' }) });
    const response = await POST(request);
    expect(response.status).toBe(404);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
  it('uses real Supabase authorization instead of the local role cookie in portfolio mode', async () => {
    vi.stubEnv('SUPPORTOPS_AUTH_MODE', 'portfolio');
    const context = await ticketContext();
    expect(context.client).not.toBeNull();
    expect(context.actor.id).toBe('real-user');
    expect(cookieReader).not.toHaveBeenCalled();
  });
});
