import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { LockKeyhole, MessageSquare } from 'lucide-react';
import { EvidenceAttachments } from '@/components/evidence-attachments';
import { AnalystWorkflow } from '@/components/analyst-workflow';
import { pageContext, pageError } from '@/lib/tickets/page-context';
import { directory, ticketDetail, listTickets } from '@/lib/tickets/service';
import { records as loadRecords } from '@/lib/tickets/case-service';
import { CaseWorkspace } from '@/components/case-workspace';
import { StatusBadge, PriorityBadge, dateTime } from '@/components/ticket-ui';
import { TicketActions } from '@/components/ticket-actions';
import type { Entry } from '@/lib/tickets/model';
function Timeline({items}:{items:Entry[]}){return items.length?<ol className="space-y-5">{items.map(item=><li key={item.id} className="border-l-2 border-slate-200 pl-4"><div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold text-slate-700">{item.author_name}</span><span className="text-slate-400">{dateTime(item.created_at)}</span>{item.visibility==='internal'&&<span className="rounded bg-amber-50 px-2 py-1 text-amber-800">Internal</span>}</div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{item.body}</p></li>)}</ol>:<p className="text-sm text-slate-500">No updates yet.</p>;}
function TicketHistory({timeline,internal}:{timeline:Entry[];internal:boolean}){
  return <div className="space-y-6"><section className="panel"><h2 className="mb-5 flex items-center gap-2 font-semibold"><MessageSquare size={18} className="text-teal-700"/>Customer-visible timeline</h2><Timeline items={timeline.filter(item=>item.visibility==='public')}/></section>{internal&&<section className="panel border-amber-200"><h2 className="mb-2 flex items-center gap-2 font-semibold"><LockKeyhole size={18} className="text-amber-700"/>Internal investigation notes</h2><p className="mb-5 text-xs text-slate-500">Private to internal teams. Never included in customer responses.</p><Timeline items={timeline.filter(item=>item.visibility==='internal')}/></section>}</div>;
}
export default async function DetailPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{saved?:string}>}){
  const {id}=await params;if(!z.uuid().safeParse(id).success)notFound();const ctx=await pageContext();
  const detail=await ticketDetail(ctx,id).catch(pageError);const {people}=await directory(ctx);const {ticket}=detail;const {saved}=await searchParams;
  const caseRecords=await loadRecords(ctx,id);const allRecords=ctx.actor.role==='customer'?caseRecords:await loadRecords(ctx);const allTickets=ctx.actor.role==='customer'?[ticket]:await listTickets(ctx);
  const timeline=[...detail.activity,...detail.updates].sort((a,b)=>a.created_at.localeCompare(b.created_at));
  const focused=ctx.actor.role==='support_analyst'||ctx.actor.role==='data_engineer';
  const caseWorkspace=<CaseWorkspace actor={ctx.actor} ticket={ticket} records={caseRecords} allRecords={allRecords} people={people} tickets={allTickets} attachments={detail.attachments}/>;
  return <><Link className="text-sm text-teal-700" href="/workspace/tickets">← Back to tickets</Link><div className="mt-6"><p className="eyebrow">SUP-{ticket.number} · {ticket.organization_name}</p><h1 className="page-title">{ticket.title}</h1><div className="mt-4 flex flex-wrap items-center gap-4"><StatusBadge value={(ticket.record_type ?? "incident").replace("_", " ")}/><StatusBadge value={ticket.status}/><PriorityBadge value={ticket.priority}/><span className="text-sm text-slate-500">{ticket.category}</span></div></div>
    {saved==='created'&&<p role="status" className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">Your issue has been reported. Follow progress and reply here.</p>}
    <div className={focused?"mt-8 analyst-ticket-layout":"mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"}><div className="min-w-0 space-y-6">
      <section className="panel"><h2 className="font-semibold">Original report</h2><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">{ticket.description}</p><dl className="mt-6 grid gap-5 border-t border-slate-100 pt-5 text-sm sm:grid-cols-2">{[['Responsible team',ticket.assigned_team??'Unassigned'],['Assigned employee',people.find(p=>p.id===ticket.assigned_to)?.display_name??(ticket.assigned_to?'Support team member':'Unassigned')],['Reported urgency',ticket.reported_urgency],['Users affected',ticket.users_affected??'Not specified'],['First occurred',ticket.first_occurred_at?dateTime(ticket.first_occurred_at):'Not specified'],['Created',dateTime(ticket.created_at)]].map(([label,value])=><div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1.5 capitalize">{value}</dd></div>)}</dl>{ticket.error_message&&<div className="mt-5"><h3 className="text-sm font-medium">Reported error</h3><pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-4 text-xs whitespace-pre-wrap">{ticket.error_message}</pre></div>}</section>
      {ctx.actor.role!=='customer'&&<EvidenceAttachments ticketId={id} files={detail.attachments} preview/>}
      {focused&&<AnalystWorkflow key={ticket.updated_at} actor={ctx.actor} ticket={ticket} people={people} records={caseRecords} attachments={detail.attachments}/>}
      {focused&&<TicketActions ticket={ticket} actor={ctx.actor}/>}
      {ticket.resolution_summary&&<section className="panel border-emerald-200"><h2 className="font-semibold">Resolution summary</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{ticket.resolution_summary}</p></section>}
      {!focused&&<TicketHistory timeline={timeline} internal={ctx.actor.role!=='customer'}/>}
      {ctx.actor.role==='customer'&&<EvidenceAttachments ticketId={id} files={detail.attachments}/>}
      {!focused&&caseWorkspace}
    </div>{focused?<aside className="ticket-activity-sidebar" aria-label="Ticket activity and optional tools" tabIndex={0}><TicketHistory timeline={timeline} internal/>{caseWorkspace}</aside>:<TicketActions ticket={ticket} actor={ctx.actor}/>}</div></>;
}
