import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { roles } from '@/lib/roles';
export async function requireUser() {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect('/login');
  const { data: profile } = await client.from('profiles').select('id, display_name, role').eq('id', user.id).single();
  if (!profile || !roles.includes(profile.role)) throw new Error('Your account needs administrator provisioning.');
  return { client, user, profile };
}
