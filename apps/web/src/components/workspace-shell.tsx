import Link from 'next/link';
import { LifeBuoy, LayoutDashboard, Tickets, Plus, ArrowLeftRight } from 'lucide-react';
import { logout } from '@/app/login/actions';
import { isDemoMode } from '@/lib/demo';
import type { Actor } from '@/lib/tickets/model';
import { demoRoles } from '@/lib/demo';
import { LiveRefresh } from './live-refresh';
export function WorkspaceShell({actor,children}:{actor:Actor;children:React.ReactNode}) {
  return <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
    <aside className="border-b border-slate-200 bg-white p-6 lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0">
      <Link href="/workspace" className="flex items-center gap-2 text-xl font-bold"><LifeBuoy className="text-teal-700"/>SupportOps</Link>
      <p className="mt-2 text-xs text-slate-500">{actor.role==='customer'?'Customer portal':'Internal workspace'}</p>
      <nav aria-label="Workspace" className="mt-8 flex flex-wrap gap-2 lg:flex-col">
        <Link className="nav-link" href="/workspace"><LayoutDashboard size={18}/>Overview</Link>
        <Link className="nav-link" href="/workspace/tickets"><Tickets size={18}/>{actor.role==='customer'?'My tickets':'Ticket management'}</Link>
        {actor.role==='customer'&&<Link className="nav-link" href="/workspace/tickets/new"><Plus size={18}/>Report an issue</Link>}
        {actor.role!=='customer'&&<Link className="nav-link" href="/workspace/learning"><LayoutDashboard size={18}/>Problems & improvement</Link>}
        {actor.role!=='customer'&&<Link className="nav-link" href={`/workspace/tickets?team=${encodeURIComponent(actor.role==='data_engineer'?'Data Engineering':actor.role==='product_tech'?'Product & Tech':actor.role==='customer_success'?'Customer Success':'Support')}`}><Tickets size={18}/>My team’s queue</Link>}
      </nav>
      <div className="mt-8 border-t border-slate-100 pt-5 lg:absolute lg:right-6 lg:bottom-6 lg:left-6"><p className="text-sm font-semibold">{actor.name}</p><p className="mt-1 text-xs text-slate-500">{demoRoles.find(item=>item.role===actor.role)?.title}</p>
        {isDemoMode()&&<Link href="/login" className="mt-4 flex items-center gap-2 text-sm text-teal-700"><ArrowLeftRight size={14}/>Switch role</Link>}
        <form action={logout}><button className="mt-3 text-sm text-slate-500 hover:text-slate-900">{isDemoMode()?'Exit demo':'Sign out'}</button></form>
      </div>
    </aside>
    <main className="min-w-0 p-5 sm:p-8 xl:p-10"><LiveRefresh demo={isDemoMode()}/>{children}</main>
  </div>;
}
