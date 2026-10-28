import { NextRequest, NextResponse } from 'next/server';
import { DEMO_COOKIE, isDemoMode, parseDemoRole } from '@/lib/demo';
export async function POST(request: NextRequest) {
  if (!isDemoMode()) return new NextResponse('Demo access is disabled.', { status: 404 });
  const origin = request.headers.get('origin');
  try {
    if (!origin || new URL(origin).host !== request.headers.get('host')) return new NextResponse('Invalid origin.', { status: 403 });
  } catch { return new NextResponse('Invalid origin.', { status: 403 }); }
  let role;
  try { role = parseDemoRole((await request.formData()).get('role')); }
  catch { return new NextResponse('Invalid form.', { status: 400 }); }
  if (!role) return new NextResponse(null, { status: 303, headers: { Location: '/login?error=role' } });
  const response = new NextResponse(null, { status: 303, headers: { Location: '/workspace' } });
  // This selects a fictional persona only. It is never Supabase authorization.
  response.cookies.set(DEMO_COOKIE, role, { httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:', path: '/', maxAge: 60 * 60 * 8 });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
