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
  return <main className="role-layout">
    <Link href="/" className="brand mb-8"><span className="brand-mark"><LifeBuoy size={22}/></span>SupportOps</Link>
    <div className="role-shell"><section className="role-intro">
      <p className="eyebrow">A connected support workspace</p>
      <h1 className="mt-8 text-4xl font-semibold leading-tight tracking-tight">Different perspectives.<br/><span className="text-teal-700">One shared solution.</span></h1>
      <p className="mt-6 max-w-xs text-sm leading-7 text-slate-500">Bring customer context and technical expertise together. From the first report to the final resolution.</p>
      <div className="mt-12 inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-[10px] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-teal-700"/>Built for the whole support journey</div>
    </section><section className="role-options">
      <p className="eyebrow">{demo ? 'Explore the workspace' : 'Welcome back'}</p>
      <h2 className="mt-3 text-2xl font-semibold">{demo ? 'Choose your role' : 'Sign in to SupportOps'}</h2>
      <p className="mt-3 text-xs leading-6 text-slate-500">{demo ? 'Step into a customer or team perspective. No account or password needed.' : 'Sign in with your administrator-provisioned account.'}</p>
      {demo ? <>
        {error && <p role="alert" className="mt-5 text-sm text-red-700">Choose a valid role to continue.</p>}
        <div className="mt-7 grid gap-3">{demoRoles.map((item, index) => {
          const Icon = icons[index];
          return <form key={item.role} action="/api/demo-session" method="post">
            <input type="hidden" name="role" value={item.role}/>
            <button className="role-option" type="submit">
              <span className="role-option-icon"><Icon size={20}/></span>
              <span className="flex-1"><span className="block text-[13px] font-semibold">{item.title}</span><span className="mt-1 block text-[11px] leading-5 text-slate-500">{item.description}</span></span>
              <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-teal-700"/>
            </button>
          </form>;
        })}</div>
        <p className="mt-6 text-xs text-slate-500">You can switch roles at any time from the workspace.</p>
      </> : isConfigured() ? <LoginForm/> : <p role="status" className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Configure Supabase in apps/web/.env.local to enable account sign-in.</p>}
    </section></div>
  </main>;
}
