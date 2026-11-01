'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCheck, ClipboardCheck, MessageSquare } from 'lucide-react';
import { Button } from './ui/button';
import { DataDiagnosis } from './data-diagnosis';
import { derivePriority, levels, type CaseRecord } from '@/lib/tickets/case-model';
import type { Actor, Attachment, Ticket } from '@/lib/tickets/model';
import { roleNames } from '@/lib/roles';

type Person = { id: string; display_name: string; role?: Actor['role'] };
export function AnalystWorkflow({ ticket, actor, people, records, attachments = [] }: { ticket: Ticket; actor: Actor; people: Person[]; records: CaseRecord[]; attachments?: Attachment[] }) {
  const engineer = actor.role === 'data_engineer';
  const specialist = engineer || actor.role === 'product_tech';
  const router = useRouter();
  const triage = records.find(record => record.kind === 'triage');
  const restoration = records.find(record => record.kind === 'restoration');
  const initial = triage?.data;
  const [impact, setImpact] = useState<typeof levels[number]>((initial?.impact as typeof levels[number]) ?? 'medium');
  const [urgency, setUrgency] = useState<typeof levels[number]>((initial?.urgency as typeof levels[number]) ?? (['high', 'critical'].includes(ticket.reported_urgency) ? 'high' : ticket.reported_urgency === 'low' ? 'low' : 'medium'));
  const [owner, setOwner] = useState(ticket.assigned_to ?? String(initial?.owner_id ?? actor.id));
  const [recordType, setRecordType] = useState(ticket.record_type ?? 'incident');
  const [major, setMajor] = useState(Boolean(initial?.major_incident));
  const [status, setStatus] = useState<Ticket['status']>(ticket.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const priority = derivePriority(impact, urgency);
  const ownerPerson = people.find(person => person.id === owner);
  const critical = recordType === 'incident' && (major || priority === 'critical');
  const terminal = ['Resolved', 'Closed'].includes(ticket.status);
  async function save(body: object) {
    setBusy(true); setError(''); setFeedback('');
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/workflow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, expected_updated_at: ticket.updated_at }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setFeedback('Saved successfully.'); router.refresh(); return true;
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save.'); return false; }
    finally { setBusy(false); }
  }
  if (ticket.status === 'Closed') return null;
  return <section className="analyst-workflow" aria-label="Ticket workflow">
    <div className="analyst-workflow-heading"><div><h2>{engineer ? 'Data Engineering workflow' : actor.role === 'product_tech' ? 'Product & Tech workflow' : 'Work on this ticket'}</h2><p className="customer-muted">{specialist ? 'Review & investigate → Record findings & progress → Verify & resolve' : 'Assess & assign → Post an update → Resolve'}</p></div><span className="customer-type">{ticket.status}</span></div>
    <div aria-live="polite">{error && <p className="rounded-lg bg-rose-50 p-4 text-sm text-rose-800" role="alert">{error}</p>}{feedback && <p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800" role="status">{feedback}</p>}</div>
    {specialist && !terminal && <section className="panel analyst-step"><h3 className="analyst-step-title"><ClipboardCheck size={18}/>1. {engineer ? 'Review & diagnose' : 'Review & investigate'}</h3><p className="customer-muted mt-3">Review the report and evidence above. Priority and assignment are already set by Support.</p><p className="analyst-derived mt-4">{ticket.category} · <strong className="capitalize">{ticket.priority} priority</strong> · {people.find(person => person.id === ticket.assigned_to)?.display_name ?? ticket.assigned_team ?? 'Unassigned'}</p>{['Reported', 'Triaged', 'Escalated'].includes(ticket.status) && <Button className="mt-4" disabled={busy} onClick={() => save({ action: 'update', status: 'Investigating' })}>{busy ? 'Saving…' : 'Start investigation'}</Button>}{engineer && <DataDiagnosis ticket={ticket} records={records} attachments={attachments}/>}</section>}
    {!specialist && !terminal && <details className="panel analyst-step" open={!triage || ticket.status === 'Reported'}><summary><ClipboardCheck size={18}/><span>1. Assess &amp; assign</span><span className="analyst-step-caption">{triage ? `${ticket.priority} priority · ${people.find(person => person.id === ticket.assigned_to)?.display_name ?? 'Review owner'}` : 'Set priority and ownership once'}</span></summary>
      <form className="mt-5 space-y-4" onSubmit={async event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        await save({ action: 'triage', impact, urgency, business_impact: form.get('business_impact'), owner_id: owner, record_type: recordType, major_incident: recordType === 'incident' && major, incident_lead: critical ? String(form.get('incident_lead') ?? '') : String(initial?.incident_lead ?? ''), update_cadence_minutes: Number(form.get('update_cadence_minutes')), record_version: triage?.version ?? null });
      }}>
        <label className="field-label">Customer impact<textarea name="business_impact" className="mt-2" rows={2} required minLength={3} maxLength={12000} defaultValue={String((initial?.business_impact ?? ticket.business_impact) || ticket.description)}/><span className="analyst-help">Prefilled from the existing report. Refine only if needed.</span></label>
        <div className="analyst-field-pair"><label className="field-label">Impact<select className="mt-2" value={impact} onChange={event => setImpact(event.target.value as typeof impact)}>{levels.map(level => <option key={level}>{level}</option>)}</select><span className="analyst-help">How widely is service disrupted?</span></label><label className="field-label">Urgency<select className="mt-2" value={urgency} onChange={event => setUrgency(event.target.value as typeof urgency)}>{levels.map(level => <option key={level}>{level}</option>)}</select><span className="analyst-help">How quickly is recovery needed?</span></label></div>
        <p className="analyst-derived">Calculated priority: <strong className="capitalize">{priority}</strong></p>
        <label className="field-label">Owner<select className="mt-2" value={owner} required onChange={event => setOwner(event.target.value)}>{people.map(person => <option key={person.id} value={person.id}>{person.display_name}{person.role ? ` · ${roleNames[person.role]}` : ''}</option>)}</select><span className="analyst-help">The responsible team is set from this person&apos;s role.</span></label>
        {critical && <label className="field-label">Major incident lead<input className="mt-2" name="incident_lead" required maxLength={120} defaultValue={String(initial?.incident_lead || ownerPerson?.display_name || actor.name)}/></label>}
        <details className="analyst-options"><summary>Classification &amp; communication settings</summary><div className="mt-4 space-y-4"><label className="field-label">Request type<select className="mt-2" value={recordType} onChange={event => { setRecordType(event.target.value as typeof recordType); if (event.target.value === 'service_request') setMajor(false); }}><option value="incident">Incident · something stopped working</option><option value="service_request">Service request · a planned request</option></select></label>{recordType === 'incident' && <label className="flex gap-3 text-sm"><input className="!w-auto" type="checkbox" checked={major} onChange={event => setMajor(event.target.checked)}/>Coordinate as a major incident</label>}<label className="field-label">Customer update interval (minutes)<input className="mt-2" name="update_cadence_minutes" type="number" min={5} max={1440} required defaultValue={Number(initial?.update_cadence_minutes ?? 30)}/></label></div></details>
        <Button disabled={busy}>{busy ? 'Saving…' : triage ? 'Save assessment & assignment' : 'Assess & assign ticket'}</Button>
      </form>
    </details>}
    <details className="panel analyst-step" open={terminal}><summary><MessageSquare size={18}/><span>{terminal ? 'Post an update or reopen' : specialist ? '2. Record findings & progress' : '2. Post an update'}</span><span className="analyst-step-caption">Optional while investigating</span></summary><form className="mt-5 space-y-4" onSubmit={async event => {
      event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
      if (await save({ action: 'update', body: data.get('body'), visibility: data.get('visibility'), ...(status !== ticket.status ? { status } : {}) })) form.reset();
    }}><label className="field-label">{specialist?"Findings or next action":"Message"}<textarea name="body" className="mt-2" rows={3} maxLength={20000} placeholder="What changed, what did you find, or what do you need from the customer?"/></label><div className="analyst-field-pair"><label className="field-label">Share with<select className="mt-2" name="visibility" defaultValue={specialist?"internal":"public"}><option value="public">Customer &amp; staff</option><option value="internal">Staff only</option></select></label><label className="field-label">Ticket status<select className="mt-2" value={status} onChange={event => setStatus(event.target.value as Ticket['status'])}>{[...new Set([ticket.status, ...(terminal ? ['Investigating'] : ['Investigating', 'Escalated', 'Fix in Progress', 'Waiting for Customer', 'Monitoring'])])].map(value => <option key={value}>{value}</option>)}</select></label></div><p className="analyst-help">One message and one save. Status changes are customer-visible; staff-only message text stays private.</p><Button disabled={busy}>{busy ? 'Saving…' : 'Save update'}</Button></form></details>
    {!terminal && <section className="panel analyst-step"><h3 className="analyst-step-title"><CheckCheck size={18}/>{specialist ? '3. Verify & resolve' : '3. Resolve ticket'}</h3><p className="analyst-help mt-3">Two details, one save. Complete this after testing the recovery.</p><form className="mt-5 space-y-4" onSubmit={async event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      await save({ action: 'resolve', resolution_summary: form.get('resolution_summary'), verification_result: form.get('verification_result'), verified: true, record_version: restoration?.version ?? null });
    }}><label className="field-label">What fixed it?<textarea className="mt-2" name="resolution_summary" rows={2} required minLength={3} maxLength={12000} defaultValue={ticket.resolution_summary ?? ''} placeholder="Explain the fix or workaround in language the customer can understand."/><span className="analyst-help">This becomes the customer-visible resolution summary and the recorded restoration method.</span></label><label className="field-label">How did you verify recovery?<textarea className="mt-2" name="verification_result" rows={3} required minLength={3} maxLength={12000} placeholder="Describe the test, result, and supporting evidence or attachment reference."/><span className="analyst-help">Include the check and its result, for example: retried the upload and all rows imported successfully.</span></label><Button disabled={busy}>{busy ? 'Saving…' : 'Confirm recovery & resolve'}</Button><p className="analyst-help">By resolving, you confirm that you tested recovery. The fix is shared with the customer, the time is saved automatically, and the customer confirms closure.</p></form></section>}
  </section>;
}
