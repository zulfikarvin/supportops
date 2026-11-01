import { z } from 'zod';
import { assertChange, changeSchema, statuses, TicketError, type Actor, type ChangeInput, type Entry, type Ticket } from './model';
import { derivePriority, levels, validateRecord, type CaseRecord, type RecordInput } from './case-model';

const base = { expected_updated_at: z.iso.datetime({ offset: true }) };
export const workflowSchema = z.discriminatedUnion('action', [
  z.object({ ...base, action: z.literal('triage'), impact: z.enum(levels), urgency: z.enum(levels), business_impact: z.string().trim().min(3).max(12000), owner_id: z.uuid(), record_type: z.enum(['incident', 'service_request']), major_incident: z.boolean(), incident_lead: z.string().trim().max(120), update_cadence_minutes: z.number().int().min(5).max(1440), record_version: z.number().int().min(1).nullable() }).strict(),
  z.object({ ...base, action: z.literal('update'), status: z.enum(statuses).optional(), body: z.string().trim().max(20000).default(''), visibility: z.enum(['public', 'internal']).default('public') }).strict(),
  z.object({ ...base, action: z.literal('resolve'), resolution_summary: z.string().trim().min(3).max(12000), verification_result: z.string().trim().min(3).max(12000), verified: z.literal(true), record_version: z.number().int().min(1).nullable() }).strict(),
]);
export type WorkflowInput = z.infer<typeof workflowSchema>;
export type WorkflowPlan = { records: RecordInput[]; change?: ChangeInput; update?: { body: string; visibility: Entry['visibility'] } };
type Person = { id: string; display_name: string; role?: Actor['role'] };

export function planWorkflow(actor: Actor, ticket: Ticket, records: CaseRecord[], people: Person[], raw: unknown, now: string): WorkflowPlan {
  const input = workflowSchema.parse(raw);
  if (!['support_analyst', 'data_engineer', 'product_tech'].includes(actor.role)) throw new TicketError('A technical role is required.', 403);
  if (ticket.status === 'Closed') throw new TicketError('This ticket is closed.', 409);
  if (ticket.updated_at !== input.expected_updated_at) throw new TicketError('This ticket changed. Reload before saving.', 409);
  const result: WorkflowPlan = { records: [] };
  const existing = (kind: CaseRecord['kind']) => records.filter(record => record.ticket_id === ticket.id && record.kind === kind).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const recordInput = (kind: CaseRecord['kind'], status: string, data: Record<string, unknown>, version: number | null): RecordInput => {
    const previous = existing(kind);
    if ((previous?.version ?? null) !== version) throw new TicketError('This record changed. Reload before saving.', 409);
    return validateRecord(actor, { ...(previous ? { id: previous.id, version: previous.version } : {}), kind, status, data }, ticket, previous, records, people);
  };
  if (input.action === 'triage') {
    if (actor.role !== 'support_analyst') throw new TicketError('Only Support can assess and assign tickets.', 403);
    if (ticket.status === 'Resolved') throw new TicketError('Reopen the investigation before changing its assessment.', 409);
    const owner = people.find(person => person.id === input.owner_id && person.role && person.role !== 'customer');
    if (!owner) throw new TicketError('Choose an internal owner.');
    const assigned_team = owner.role === 'data_engineer' ? 'Data Engineering' : owner.role === 'product_tech' ? 'Product & Tech' : owner.role === 'customer_success' ? 'Customer Success' : 'Support';
    const data = { impact: input.impact, urgency: input.urgency, business_impact: input.business_impact, owner_id: input.owner_id, record_type: input.record_type, major_incident: input.major_incident, incident_lead: input.incident_lead, update_cadence_minutes: input.update_cadence_minutes };
    // One owner selection supplies both assignment and the accountable-owner record.
    result.records.push(recordInput('triage', 'Recorded', data, input.record_version));
    result.change = changeSchema.parse({ assigned_team, assigned_to: owner.id, priority: derivePriority(input.impact, input.urgency), ...(ticket.status === 'Reported' ? { status: 'Triaged' } : {}) });
  } else if (input.action === 'resolve') {
    if (ticket.status === 'Resolved') throw new TicketError('This ticket is already resolved.', 409);
    // These are the same facts entered once, reused in the existing restoration and ticket records.
    result.records.push(recordInput('restoration', 'Verified', { restored_at: now, restoration_method: input.resolution_summary, verification_result: input.verification_result, closure_evidence: input.verification_result }, input.record_version));
    result.change = changeSchema.parse({ status: 'Resolved', resolution_summary: input.resolution_summary });
  } else {
    if (input.status === 'Resolved') throw new TicketError('Use Resolve ticket to record the fix and verification.');
    if (input.status && input.status !== ticket.status) result.change = changeSchema.parse({ status: input.status });
    if (input.body) result.update = { body: input.body, visibility: input.visibility };
    if (!result.change && !result.update) throw new TicketError('Write an update or choose a different status.');
    if (input.status === 'Waiting for Customer' && ticket.status !== input.status && (!input.body || input.visibility !== 'public')) throw new TicketError('Include a customer-visible question when requesting a reply.');
  }
  if (result.change) assertChange(actor, ticket, result.change);
  return result;
}
