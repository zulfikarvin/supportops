'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { categories, priorities } from '@/lib/tickets/model';
import { Button } from './ui/button';
export function NewTicketForm({organizations}:{organizations:{id:string;name:string}[]}){
  const router=useRouter();const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [savedId,setSavedId]=useState('');
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');const form=new FormData(event.currentTarget);
    try{
      const occurred=String(form.get('first_occurred_at')??'');
      const response=await fetch('/api/tickets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({organization_id:form.get('organization_id'),title:form.get('title'),description:form.get('description'),category:form.get('category'),reported_urgency:form.get('reported_urgency'),first_occurred_at:occurred?new Date(occurred).toISOString():null,users_affected:form.get('users_affected')?Number(form.get('users_affected')):null,error_message:form.get('error_message')||null})});
      const result=await response.json();if(!response.ok)throw new Error(result.error);setSavedId(result.id);
      const file=form.get('file');if(file instanceof File&&file.size){const upload=new FormData();upload.set('file',file);upload.set('visibility','public');const attached=await fetch(`/api/tickets/${result.id}/attachments`,{method:'POST',body:upload});if(!attached.ok)throw new Error(`Ticket saved, but attachment failed: ${(await attached.json()).error} Open the ticket to retry the upload.`);}
      router.push(`/workspace/tickets/${result.id}?saved=created`);router.refresh();
    }catch(error){setError(error instanceof Error?error.message:'Unable to submit the ticket.');}finally{setBusy(false);}
  }
  return <form className="panel mt-7 max-w-3xl space-y-6" onSubmit={submit}>
    <div><label className="field-label" htmlFor="organization">Organization</label><select id="organization" name="organization_id" required className="mt-2">{organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}</select></div>
    <div><label className="field-label" htmlFor="title">Issue title</label><input className="mt-2" id="title" name="title" required minLength={3} maxLength={200} placeholder="e.g. Scheduled employee upload failed"/></div>
    <div className="grid gap-5 sm:grid-cols-2"><div><label htmlFor="category" className="field-label">Category</label><select className="mt-2" id="category" name="category" required>{categories.map(value=><option key={value}>{value}</option>)}</select></div><div><label htmlFor="urgency" className="field-label">Reported urgency</label><select className="mt-2" id="urgency" name="reported_urgency" defaultValue="normal">{priorities.map(value=><option key={value}>{value}</option>)}</select><p className="mt-2 text-xs text-slate-500">Support will assess the investigation priority.</p></div></div>
    <div><label htmlFor="description" className="field-label">What happened?</label><textarea className="mt-2" id="description" name="description" rows={5} minLength={10} maxLength={20000} required placeholder="Describe what you expected, what happened, and how we can reproduce it."/></div>
    <div className="grid gap-5 sm:grid-cols-2"><div><label htmlFor="occurred" className="field-label">When did it first occur?</label><input className="mt-2" type="datetime-local" id="occurred" name="first_occurred_at"/></div><div><label htmlFor="affected" className="field-label">Number of users affected</label><input className="mt-2" type="number" min={0} max={100000000} id="affected" name="users_affected"/></div></div>
    <div><label htmlFor="error" className="field-label">Error message (optional)</label><textarea className="mt-2" id="error" name="error_message" maxLength={10000} rows={2}/></div>
    <div><label htmlFor="evidence" className="field-label">Supporting evidence (optional)</label><input className="mt-2 text-sm" type="file" id="evidence" name="file" accept=".png,.jpg,.jpeg,.txt,.log,.csv"/><p className="mt-2 text-xs leading-5 text-slate-500">PNG, JPEG, sanitized text/logs, or an approved sample CSV. Maximum 5 MB. Do not upload an entire HR dataset or personal employee information.</p></div>
    {error&&<p role="alert" className="rounded-lg bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {savedId?<Link className="primary-link" href={`/workspace/tickets/${savedId}`}>Open saved ticket →</Link>:<Button disabled={busy||!organizations.length} type="submit">{busy?'Submitting…':'Submit issue'}</Button>}
  </form>;
}
