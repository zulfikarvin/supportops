import 'server-only';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from './supabase/server';
import { isPortfolioMode, portfolioPersonas, parseDemoRole } from './demo';

export class PortfolioError extends Error {
  constructor(public stage: string) { super(`Portfolio setup failed: ${stage}`); }
}

export async function startPortfolioSession(requestedRole: unknown) {
  if (!isPortfolioMode()) throw new PortfolioError('disabled');
  const role = parseDemoRole(requestedRole);
  const persona = portfolioPersonas.find(person => person.role === role);
  if (!persona) throw new PortfolioError('role');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) throw new PortfolioError('configuration');
  const admin = createAdminClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

  // Bootstrap all five known personas so the assignment picker works from the first visit.
  // No existing administrator-provisioned account is reused or given a different role.
  await Promise.all(portfolioPersonas.map(async person => {
    const found = await admin.auth.admin.getUserById(person.id);
    if (found.error && found.error.status !== 404) throw new PortfolioError('personas');
    if (found.data.user) {
      if (found.data.user.email !== person.email || found.data.user.app_metadata?.supportops_portfolio !== true) throw new PortfolioError('identity');
      return;
    }
    const created = await admin.auth.admin.createUser({ id: person.id, email: person.email, email_confirm: true, app_metadata: { supportops_portfolio: true } });
    if (created.error) {
      // A second serverless instance may have created this same fixed identity concurrently.
      const retry = await admin.auth.admin.getUserById(person.id);
      if (retry.error || retry.data.user?.email !== person.email || retry.data.user.app_metadata?.supportops_portfolio !== true) throw new PortfolioError('personas');
    }
  }));
  const profiles = await admin.from('profiles').upsert(portfolioPersonas.map(person => ({ id: person.id, display_name: person.name, role: person.role })), { onConflict: 'id' });
  if (profiles.error) throw new PortfolioError('profiles');
  const organizationId = '10000000-0000-4000-8000-000000000001';
  const organization = await admin.from('organizations').upsert({ id: organizationId, name: 'Atlas Industries' }, { onConflict: 'id', ignoreDuplicates: true });
  if (organization.error) throw new PortfolioError('organization');
  const membership = await admin.from('organization_memberships').upsert({ organization_id: organizationId, user_id: portfolioPersonas[0].id }, { onConflict: 'organization_id,user_id' });
  if (membership.error) throw new PortfolioError('membership');

  // Generate and consume the token entirely on the server: no email, password, or magic-link click.
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: persona.email });
  if (link.error || link.data.user?.id !== persona.id || !link.data.properties?.hashed_token) throw new PortfolioError('link');
  const client = await createClient();
  const session = await client.auth.verifyOtp({ type: 'email', token_hash: link.data.properties.hashed_token });
  if (session.error || session.data.user?.id !== persona.id || !session.data.session) throw new PortfolioError('session');
}
