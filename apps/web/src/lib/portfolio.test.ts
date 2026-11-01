import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { portfolioPersonas } from './demo';

const mocks = vi.hoisted(() => ({ createAdmin: vi.fn(), createSession: vi.fn(), getUser: vi.fn(), createUser: vi.fn(), link: vi.fn(), verify: vi.fn(), upsert: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createAdmin }));
vi.mock('./supabase/server', () => ({ createClient: mocks.createSession }));
import { startPortfolioSession } from './portfolio';
import { POST } from '@/app/api/demo-session/route';

const identity = (id: string) => ({ id, email: portfolioPersonas.find(person => person.id === id)!.email, app_metadata: { supportops_portfolio: true } });
function request(role: string, origin = 'https://supportops.example') {
  return new NextRequest('https://supportops.example/api/demo-session', { method: 'POST', headers: { origin, host: 'supportops.example' }, body: new URLSearchParams({ role }) });
}
beforeEach(() => {
  vi.stubEnv('SUPPORTOPS_AUTH_MODE', 'portfolio');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable-test-key');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'server-only-test-secret');
  mocks.createAdmin.mockReturnValue({ auth: { admin: { getUserById: mocks.getUser, createUser: mocks.createUser, generateLink: mocks.link } }, from: () => ({ upsert: mocks.upsert }) });
  mocks.createSession.mockResolvedValue({ auth: { verifyOtp: mocks.verify } });
  mocks.getUser.mockImplementation(async (id: string) => ({ data: { user: identity(id) }, error: null }));
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.link.mockImplementation(async ({ email }: { email: string }) => ({ data: { user: portfolioPersonas.find(person => person.email === email), properties: { hashed_token: 'server-only-one-time-token' } }, error: null }));
  mocks.verify.mockImplementation(async () => ({ data: { user: portfolioPersonas.find(person => person.email === mocks.link.mock.calls.at(-1)![0].email), session: { access_token: 'test-session' } }, error: null }));
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

describe('hosted portfolio role selection', () => {
  it('starts every fixed persona without passwords, emails, or browser token links', async () => {
    for (const person of portfolioPersonas) {
      const response = await POST(request(person.role));
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('/workspace');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('set-cookie')).not.toContain('server-only-one-time-token');
      expect(response.headers.get('set-cookie')).not.toContain('test-session');
      expect(mocks.link).toHaveBeenLastCalledWith({ type: 'magiclink', email: person.email });
      expect(mocks.verify).toHaveBeenLastCalledWith({ type: 'email', token_hash: 'server-only-one-time-token' });
    }
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
  it('provisions only the fixed demo identities and their real database role profiles', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 404 } });
    mocks.createUser.mockResolvedValue({ error: null });
    await startPortfolioSession('customer');
    expect(mocks.createUser).toHaveBeenCalledTimes(5);
    for (const person of portfolioPersonas) expect(mocks.createUser).toHaveBeenCalledWith({ id: person.id, email: person.email, email_confirm: true, app_metadata: { supportops_portfolio: true } });
    expect(mocks.upsert).toHaveBeenCalledWith(portfolioPersonas.map(person => ({ id: person.id, display_name: person.name, role: person.role })), { onConflict: 'id' });
    expect(mocks.upsert).toHaveBeenCalledWith({ organization_id: '10000000-0000-4000-8000-000000000001', user_id: portfolioPersonas[0].id }, { onConflict: 'organization_id,user_id' });
  });
  it('rejects unknown roles and cross-origin submissions before touching Supabase', async () => {
    expect((await POST(request('admin'))).headers.get('location')).toBe('/login?error=role');
    expect((await POST(request('customer', 'https://untrusted.example'))).status).toBe(403);
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });
  it('keeps normal authenticated mode closed to public role selection', async () => {
    vi.stubEnv('SUPPORTOPS_AUTH_MODE', 'supabase');
    expect((await POST(request('product_tech'))).status).toBe(404);
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    await expect(startPortfolioSession('customer')).rejects.toThrow('disabled');
  });
  it('never converts an unrelated existing account into a demo persona', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: portfolioPersonas[0].id, email: 'unrelated@example.com', app_metadata: {} } }, error: null });
    await expect(startPortfolioSession('customer')).rejects.toThrow('identity');
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it('does not create accounts without the server-only configuration', async () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', undefined);
    await expect(startPortfolioSession('customer')).rejects.toThrow('configuration');
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });
  it('does not issue a session when profile provisioning fails', async () => {
    mocks.upsert.mockResolvedValue({ error: { message: 'database failure' } });
    await expect(startPortfolioSession('customer')).rejects.toThrow('profiles');
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
});
