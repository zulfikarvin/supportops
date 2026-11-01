import Link from 'next/link';
import { LifeBuoy, ChevronDown, ArrowLeftRight, LogOut, UsersRound } from 'lucide-react';
import { logout } from '@/app/login/actions';
import { isDemoMode } from '@/lib/demo';
import type { Actor } from '@/lib/tickets/model';
import { roleNames } from '@/lib/roles';
import { LiveRefresh } from './live-refresh';
import { WorkspaceNav } from './workspace-nav';
export function WorkspaceShell({actor,children}:{actor:Actor;children:React.ReactNode}) {
  const demo=isDemoMode();
  const team=actor.role==='data_engineer'?'Data Engineering':actor.role==='product_tech'?'Product & Tech':actor.role==='customer_success'?'Customer Success':'Support';
  const initials=actor.name.split(' ').slice(0,2).map(name=>name[0]).join('');
  return <div className="app-shell">
    <header className="app-topbar">
      <Link href="/workspace" className="brand"><span className="brand-mark"><LifeBuoy size={22}/></span>SupportOps<span className="ml-1 h-1.5 w-1.5 rounded-full bg-teal-700"/></Link>
      <WorkspaceNav customer={actor.role==='customer'}/>
      <div className="flex items-center gap-4">
        {demo&&<Link className="icon-link" href="/login" aria-label="Switch demo role" title="Switch demo role"><ArrowLeftRight size={17}/></Link>}
        <details className="profile-menu"><summary><span className="profile-greeting">Hi, <strong>{actor.name.split(' ')[0]}</strong></span><span className="profile-avatar" aria-hidden="true">{initials}</span><ChevronDown size={13}/><span className="sr-only">Account menu for {actor.name}</span></summary>
          <div className="profile-dropdown"><p className="font-semibold">{actor.name}</p><p className="mt-1 text-xs text-slate-500">{roleNames[actor.role]}</p>
            {demo&&<Link href="/login"><ArrowLeftRight size={15}/>Switch demo role</Link>}
            {actor.role!=='customer'&&<Link href={`/workspace/tickets?team=${encodeURIComponent(team)}`}><UsersRound size={15}/>My team’s queue</Link>}
            <form action={logout}><button><LogOut size={15}/>{demo?'Exit demo':'Sign out'}</button></form>
          </div>
        </details>
      </div>
    </header>
    <main className="workspace-content"><LiveRefresh demo={demo}/>{children}</main>
  </div>;
}
