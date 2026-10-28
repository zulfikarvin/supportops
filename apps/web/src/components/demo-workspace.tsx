import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LifeBuoy, ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import { DEMO_COOKIE, demoRoles, parseDemoRole } from '@/lib/demo';
import { logout } from '@/app/login/actions';
import { Button } from '@/components/ui/button';

export async function DemoWorkspace() {
  const role = parseDemoRole((await cookies()).get(DEMO_COOKIE)?.value);
  if (!role) redirect('/login');
  const persona = demoRoles.find(item => item.role === role)!;
  return <main className="mx-auto max-w-5xl px-6 py-10">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <Link href="/" className="flex items-center gap-2 text-xl font-bold"><LifeBuoy className="text-teal-700"/>SupportOps</Link>
      <div className="flex items-center gap-4"><Link href="/login" className="flex items-center gap-2 text-sm font-medium text-teal-700"><ArrowLeftRight size={16}/>Switch role</Link><form action={logout}><Button variant="outline">Exit demo</Button></form></div>
    </header>
    <section className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">Demo workspace</span>
      <h1 className="mt-5 text-3xl font-semibold">Welcome, {persona.name}</h1>
      <p className="mt-3 text-slate-600">{persona.description}</p>
      <dl className="mt-8 grid gap-6 border-t border-slate-100 pt-6 sm:grid-cols-2"><div><dt className="text-sm text-slate-500">Current role</dt><dd className="mt-2 font-medium">{persona.title}</dd></div><div><dt className="text-sm text-slate-500">{role === 'customer' ? 'Organization' : 'Team'}</dt><dd className="mt-2 font-medium">{persona.team}</dd></div></dl>
    </section>
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6"><h2 className="flex items-center gap-2 font-semibold"><CheckCircle2 size={18} className="text-teal-700"/>You’re ready to explore</h2><p className="mt-3 text-sm leading-6 text-slate-600">Role selection is available now. Ticket submission, investigation tools, and activity timelines are coming in the next development phase.</p></section>
  </main>;
}
