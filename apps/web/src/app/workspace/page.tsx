import Link from 'next/link';
import { ArrowRight, Activity } from 'lucide-react';
import { TicketTable } from '@/components/ticket-ui';
import { pageContext } from '@/lib/tickets/page-context';
import { listTickets } from '@/lib/tickets/service';
import { categories, teams } from '@/lib/tickets/model';
export default async function Overview(){
  const ctx=await pageContext();const tickets=await listTickets(ctx);const customer=ctx.actor.role==='customer';
  const open=tickets.filter(ticket=>!['Resolved','Closed'].includes(ticket.status));
  const stats=customer?[['Total tickets',tickets.length],['Open tickets',open.length],['Waiting for your reply',tickets.filter(t=>t.status==='Waiting for Customer').length],['Resolved tickets',tickets.filter(t=>['Resolved','Closed'].includes(t.status)).length]]:[['Open tickets',open.length],['High priority',open.filter(t=>['high','critical'].includes(t.priority)).length],['Unassigned',open.filter(t=>!t.assigned_team).length],['Waiting for customer',open.filter(t=>t.status==='Waiting for Customer').length]];
  return <><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="eyebrow">{customer?'Customer support':'Support operations'}</p><h1 className="page-title">{customer?'Your support, connected.':'Support overview'}</h1><p className="mt-2 text-sm text-slate-500">{customer?'Report a problem and follow every step toward a resolution.':`Welcome, ${ctx.actor.name}. Here’s what needs your team’s attention.`}</p></div><Link href={customer?'/workspace/tickets/new':'/workspace/tickets'} className="primary-link">{customer?'+ Report an issue':'View ticket queue'}<ArrowRight size={16}/></Link></div>
    <div className="my-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(([label,value])=><section className="panel" key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-3xl font-semibold">{value}</p></section>)}</div>
    {!customer&&<div className="mb-8 grid gap-5 xl:grid-cols-2">{[['Tickets by category',categories,'category'],['Tickets by responsible team',teams,'assigned_team']].map(([title,items,field])=><section className="panel" key={String(title)}><h2 className="mb-5 font-semibold">{String(title)}</h2><div className="space-y-3">{(items as readonly string[]).map(item=>{const count=tickets.filter(t=>t[field as 'category'|'assigned_team']===item).length;return <div key={item} className="flex justify-between gap-3 border-b border-slate-100 pb-2 text-sm"><span className="text-slate-600">{item}</span><span className="font-medium">{count}</span></div>;})}</div></section>)}</div>}
    <div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><Activity size={18} className="text-teal-700"/>Recently updated tickets</h2><Link className="text-sm text-teal-700" href="/workspace/tickets">View all →</Link></div><TicketTable tickets={tickets.slice(0,6)} customer={customer}/>
  </>;
}
