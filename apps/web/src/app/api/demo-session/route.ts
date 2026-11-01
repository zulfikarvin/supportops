import { NextRequest, NextResponse } from 'next/server';
import { DEMO_COOKIE, isDemoMode, isPortfolioMode, parseDemoRole } from '@/lib/demo';
import { PortfolioError, startPortfolioSession } from '@/lib/portfolio';
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
  if (isPortfolioMode()) {
    try { await startPortfolioSession(role); }
    catch (error) {
      console.error('Portfolio session could not start:', error instanceof PortfolioError ? error.stage : 'unavailable');
      return new NextResponse(null, { status: 303, headers: { Location: '/login?error=portfolio', 'Cache-Control': 'private, no-store' } });
    }
    const response = new NextResponse(null, { status: 303, headers: { Location: '/workspace', 'Cache-Control': 'private, no-store' } });
    response.cookies.delete(DEMO_COOKIE);
    return response;
  }
  const response = new NextResponse(null, { status: 303, headers: { Location: '/workspace' } });
  // This selects a fictional persona only. It is never Supabase authorization.
  response.cookies.set(DEMO_COOKIE, role, { httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:', path: '/', maxAge: 60 * 60 * 8 });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
