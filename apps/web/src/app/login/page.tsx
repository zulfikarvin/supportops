import Link from 'next/link';
import { ArrowRight, Building2, Headset, HeartHandshake, Database, Code2, LifeBuoy } from 'lucide-react';
import { LoginForm } from './form';
import { isConfigured } from '@/lib/env';
import { demoRoles, isDemoMode } from '@/lib/demo';

const icons = [Building2, Headset, HeartHandshake, Database, Code2];
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const demo = isDemoMode();
  const { error } = await searchParams;
  return <main className={`mx-auto px-6 py-12 sm:py-16 ${demo ? 'max-w-3xl' : 'max-w-md'}`}>
    <Link href="/" className="flex items-center gap-2 font-bold"><LifeBuoy className="text-teal-700"/>SupportOps</Link>
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">{demo ? 'Explore the workspace' : 'Welcome back'}</p>
      <h1 className="mt-3 text-3xl font-semibold">{demo ? 'Choose your role' : 'Sign in to SupportOps'}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{demo ? 'Step into a customer or team perspective. No account or password needed.' : 'Sign in with your administrator-provisioned account.'}</p>
      {demo ? <>
        {error && <p role="alert" className="mt-5 text-sm text-red-700">Choose a valid role to continue.</p>}
        <div className="mt-7 grid gap-3">{demoRoles.map((item, index) => {
          const Icon = icons[index];
          return <form key={item.role} action="/api/demo-session" method="post">
            <input type="hidden" name="role" value={item.role}/>
            <button className="group flex w-full items-center gap-4 rounded-xl border border-slate-200 p-4 text-left transition hover:border-teal-600 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600" type="submit">
              <span className="rounded-lg bg-teal-50 p-3 text-teal-700"><Icon size={22}/></span>
              <span className="flex-1"><span className="block text-sm font-semibold">{item.title}</span><span className="mt-1 block text-sm leading-5 text-slate-500">{item.description}</span></span>
              <ArrowRight size={18} aria-hidden="true" className="shrink-0 text-slate-400 group-hover:text-teal-700"/>
            </button>
          </form>;
        })}</div>
        <p className="mt-6 text-xs text-slate-500">You can switch roles at any time from the workspace.</p>
      </> : isConfigured() ? <LoginForm/> : <p role="status" className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Configure Supabase in apps/web/.env.local to enable account sign-in.</p>}
    </section>
  </main>;
}
