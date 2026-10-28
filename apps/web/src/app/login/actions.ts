'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { DEMO_COOKIE, isDemoMode } from '@/lib/demo';
export async function login(_state: { error: string }, form: FormData) {
  if (isDemoMode()) return { error: 'Choose a demo role to continue.' };
  const parsed = z.object({ email: z.email(), password: z.string().min(1).max(256) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'Enter a valid email address and password.' };
  try {
    const client = await createClient();
    const { error } = await client.auth.signInWithPassword(parsed.data);
    if (error) return { error: 'Unable to sign in. Check your credentials and try again.' };
  } catch { return { error: 'Authentication is unavailable. Check the server configuration.' }; }
  redirect('/workspace');
}
export async function logout() {
  if (isDemoMode()) {
    (await cookies()).delete(DEMO_COOKIE);
    redirect('/login');
  }
  const client = await createClient();
  const { error } = await client.auth.signOut();
  if (error) throw new Error('Sign out failed. Please try again.');
  redirect('/login');
}
