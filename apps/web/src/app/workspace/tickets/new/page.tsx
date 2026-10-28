import { redirect } from 'next/navigation';
import { NewTicketForm } from '@/components/new-ticket-form';
import { pageContext } from '@/lib/tickets/page-context';
import { directory } from '@/lib/tickets/service';
export default async function NewTicketPage(){const ctx=await pageContext();if(ctx.actor.role!=='customer')redirect('/workspace/tickets');const {organizations}=await directory(ctx);return <><p className="eyebrow">Customer portal</p><h1 className="page-title">Report an issue</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Tell us what’s going wrong. We’ll use this shared ticket to investigate and keep you informed.</p>{!organizations.length&&<p className="mt-5 text-sm text-rose-700">Your account needs an organization membership before reporting an issue.</p>}<NewTicketForm organizations={organizations}/></>;}
