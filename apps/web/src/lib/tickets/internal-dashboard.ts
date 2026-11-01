import { TicketError, type Actor, type Entry, type Ticket } from './model';
import type { CaseRecord } from './case-model';

export type DashboardPerson = { id: string; display_name: string; role: Actor['role'] };
export type DashboardMetric = { label: string; value: number; note: string };
export type DashboardAttention = { ticket: Ticket; reasons: string[] };
export type DashboardQueue = { title: string; tickets: Ticket[]; description: string };
const open = (ticket: Ticket) => !['Resolved', 'Closed'].includes(ticket.status);
const high = (ticket: Ticket) => ['high', 'critical'].includes(ticket.priority);
const newest = <T extends { created_at: string; id: string }>(items: T[]) => [...items].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));

export function internalDashboardModel(actor: Actor, tickets: Ticket[], records: CaseRecord[], updates: Entry[], activity: Entry[], people: DashboardPerson[], now: string) {
  if (actor.role === 'customer') throw new TicketError('Internal workspace access required.', 403);
  const incidents = tickets.filter(ticket => ticket.record_type !== 'service_request');
  const active = incidents.filter(open);
  const ids = new Set(incidents.map(ticket => ticket.id));
  const scopedRecords = records.filter(record => ids.has(record.ticket_id));
  const customerIds = new Set(people.filter(person => person.role === 'customer').map(person => person.id));
  const staffIds = new Set(people.filter(person => person.role !== 'customer').map(person => person.id));
  const publicMessages = newest(updates.filter(entry => ids.has(entry.ticket_id) && entry.visibility === 'public'));
  const latestRecord = (ticket: Ticket, kind: CaseRecord['kind']) => scopedRecords.filter(record => record.ticket_id === ticket.id && record.kind === kind).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id))[0];
  const roleAuthors = new Set(people.filter(person => person.role === actor.role).map(person => person.id));
  const hasInvestigationProgress = (ticket: Ticket) => Boolean(latestRecord(ticket, 'investigation')) || updates.some(entry => entry.ticket_id === ticket.id && roleAuthors.has(entry.created_by) && entry.body.trim());
  const latestPublic = (ticket: Ticket) => publicMessages.find(entry => entry.ticket_id === ticket.id);
  const latestStaff = (ticket: Ticket) => publicMessages.find(entry => entry.ticket_id === ticket.id && staffIds.has(entry.created_by));
  const ownerId = (ticket: Ticket) => ticket.assigned_to ?? String(latestRecord(ticket, 'triage')?.data.owner_id ?? '');
  const mine = (ticket: Ticket) => ownerId(ticket) === actor.id;
  const team = actor.role === 'data_engineer' ? 'Data Engineering' : actor.role === 'product_tech' ? 'Product & Tech' : 'Support';
  const assigned = active.filter(ticket => ticket.assigned_team === team || mine(ticket));
  const awaitingVerification = (ticket: Ticket) => ticket.status === 'Monitoring';
  const missingReproduction = (ticket: Ticket) => !['Fix in Progress', 'Monitoring', 'Waiting for Customer'].includes(ticket.status) && !String(latestRecord(ticket, 'investigation')?.data.reproduction_steps ?? '').trim();
  const attention: DashboardAttention[] = [];
  const add = (ticket: Ticket, reason: string) => {
    const item = attention.find(item => item.ticket.id === ticket.id);
    if (item) item.reasons.push(reason); else attention.push({ ticket, reasons: [reason] });
  };
  let metrics: DashboardMetric[] = [];
  let queues: DashboardQueue[] = [];
  let relevant: Ticket[] = [];
  let description = '';
  let primary = { label: 'Open Ticket Queue', href: '/workspace/tickets' };
  if (actor.role === 'customer_success') {
    description = 'Keep customers informed, follow up on replies, and coordinate resolution confirmation.';
    const updatesNeeded = new Set<string>();
    for (const ticket of active) {
      const last = latestPublic(ticket);
      if (last && customerIds.has(last.created_by)) { add(ticket, 'Follow up on the latest customer reply.'); updatesNeeded.add(ticket.id); }
      const triage = latestRecord(ticket, 'triage');
      const cadence = Number(triage?.data.update_cadence_minutes);
      const staff = latestStaff(ticket);
      if (triage && cadence >= 5 && cadence <= 1440) {
        const baseline = Math.max(Date.parse(triage.created_at), staff ? Date.parse(staff.created_at) : 0);
        if (Date.parse(now) >= baseline + cadence * 60000) { add(ticket, `Send a customer update: the configured ${cadence}-minute communication cadence has elapsed.`); updatesNeeded.add(ticket.id); }
      }
      if (high(ticket) && !staff) { add(ticket, 'Share an initial public progress update for this high-priority incident.'); updatesNeeded.add(ticket.id); }
    }
    const confirmations = incidents.filter(ticket => ticket.status === 'Resolved' && !ticket.confirmed_at);
    confirmations.forEach(ticket => add(ticket, 'Follow up with the customer to confirm the resolution.'));
    metrics = [
      { label: 'Open Customer Incidents', value: active.length, note: 'Across all customer accounts you can access' },
      { label: 'Customer Updates Needed', value: updatesNeeded.size, note: 'Replies, configured cadences, or missing initial high-priority updates' },
      { label: 'High-Priority Customer Incidents', value: active.filter(high).length, note: 'Open incidents with high or critical priority' },
      { label: 'Awaiting Customer Confirmation', value: confirmations.length, note: 'Resolved incidents not yet confirmed' },
    ];
    queues = [{ title: 'Active Customer Incidents', tickets: active, description: 'Open incidents across your authorized customer accounts.' }];
    relevant = incidents;
    primary = { label: 'Review Customer Follow-ups', href: '#needs-attention' };
  } else if (actor.role === 'support_analyst') {
    description = 'Triage incoming incidents, own investigations, and coordinate technical escalations.';
    const untriaged = active.filter(ticket => ticket.status === 'Reported');
    const investigations = active.filter(mine);
    const escalated = active.filter(ticket => ticket.status === 'Escalated');
    const escalationNeeded = escalated.filter(ticket => !ticket.assigned_team || ticket.assigned_team === 'Support');
    untriaged.forEach(ticket => add(ticket, 'Classify impact and urgency, set priority, and assign an accountable owner.'));
    active.filter(ticket => (!ticket.assigned_team || ticket.assigned_team === 'Support') && !ownerId(ticket) && ticket.status !== 'Reported').forEach(ticket => add(ticket, 'Assign an accountable owner to this support incident.'));
    escalationNeeded.forEach(ticket => add(ticket, 'Assign a technical team to the escalated incident.'));
    investigations.filter(ticket => ticket.status === 'Investigating' && !hasInvestigationProgress(ticket)).forEach(ticket => add(ticket, 'Record investigation steps and evidence for your assigned incident.'));
    investigations.filter(awaitingVerification).forEach(ticket => add(ticket, 'Verify service recovery and record the restoration evidence.'));
    metrics = [
      { label: 'Untriaged Incidents', value: untriaged.length, note: 'Open incidents in Reported status' },
      { label: 'Assigned to Me', value: investigations.length, note: 'Assigned employee, or accountable triage owner if unassigned' },
      { label: 'High-Priority Incidents', value: active.filter(high).length, note: 'High or critical incidents in the authorized queue' },
      { label: 'Awaiting Technical Escalation', value: escalationNeeded.length, note: 'Escalated without a specialist team assigned' },
    ];
    queues = [{ title: 'Triage Queue', tickets: untriaged, description: 'New incidents requiring classification and ownership.' }, { title: 'My Active Investigations', tickets: investigations, description: 'Open incidents assigned to you.' }, { title: 'Escalated Issues', tickets: escalated, description: 'Specialist escalations to coordinate.' }];
    relevant = incidents;
    primary = { label: 'Open Triage Queue', href: '/workspace/tickets?status=Reported' };
  } else if (actor.role === 'data_engineer') {
    description = 'Investigate assigned data issues, review recorded diagnostics, and verify recovery.';
    const failed = assigned.filter(ticket => ticket.category === 'Data Upload Failure' || String(latestRecord(ticket, 'investigation')?.data.error_code ?? '').toLowerCase().includes('schema'));
    const verification = assigned.filter(awaitingVerification);
    failed.filter(ticket => !latestRecord(ticket, 'diagnostic')).forEach(ticket => add(ticket, 'Review approved upload evidence and run diagnostics where applicable.'));
    verification.forEach(ticket => add(ticket, 'Verify the data recovery and record the restoration result.'));
    assigned.filter(ticket => ticket.status === 'Escalated').forEach(ticket => add(ticket, 'Review the assigned escalation and begin the data investigation.'));
    assigned.filter(ticket => ticket.status === 'Investigating' && !hasInvestigationProgress(ticket)).forEach(ticket => add(ticket, 'Record the data investigation steps and available evidence.'));
    metrics = [
      { label: 'Assigned Data Incidents', value: assigned.length, note: 'Assigned to you or the Data Engineering team' },
      { label: 'Failed Upload Investigations', value: assigned.filter(ticket => ticket.category === 'Data Upload Failure').length, note: 'Reported upload failures; diagnostic outcomes shown separately' },
      { label: 'High-Priority Data Issues', value: assigned.filter(high).length, note: 'Assigned open incidents with high or critical priority' },
      { label: 'Awaiting Verification', value: verification.length, note: 'Assigned incidents in Monitoring status' },
    ];
    queues = [{ title: 'My Data Investigations', tickets: assigned, description: 'Your assignments and the Data Engineering team queue.' }, { title: 'Failed Upload and Schema Issues', tickets: failed, description: 'Reported upload failures or recorded schema error codes.' }];
    relevant = incidents.filter(ticket => ticket.assigned_team === team || mine(ticket));
    primary = { label: 'Open Data Team Queue', href: '/workspace/tickets?team=Data%20Engineering' };
  } else {
    description = 'Reproduce assigned product issues, progress fixes, and verify engineering resolutions.';
    const defects = assigned.filter(ticket => ticket.category === 'Product Bug');
    const reproduction = defects.filter(missingReproduction);
    const verification = assigned.filter(awaitingVerification);
    reproduction.forEach(ticket => add(ticket, 'Record reproduction steps and supporting evidence before progressing the defect.'));
    assigned.filter(ticket => ticket.status === 'Escalated' && ticket.category !== 'Product Bug').forEach(ticket => add(ticket, 'Review the assigned engineering escalation and record investigation evidence.'));
    verification.forEach(ticket => add(ticket, 'Verify the fix and document service restoration.'));
    metrics = [
      { label: 'Assigned Product Defects', value: defects.length, note: 'Assigned open incidents categorized as Product Bug' },
      { label: 'Awaiting Reproduction', value: reproduction.length, note: 'Assigned defects without recorded reproduction steps' },
      { label: 'Fixes in Progress', value: assigned.filter(ticket => ticket.status === 'Fix in Progress').length, note: 'Your assignments and the Product & Tech team queue' },
      { label: 'Awaiting Verification', value: verification.length, note: 'Assigned incidents in Monitoring status' },
    ];
    queues = [{ title: 'Active Product Investigations', tickets: assigned, description: 'Your assignments and the Product & Tech team queue.' }, { title: 'Escalated Product Issues', tickets: assigned.filter(ticket => ticket.status === 'Escalated'), description: 'Assigned product and engineering escalations.' }, { title: 'Bugs Requiring Investigation', tickets: reproduction, description: 'Assigned defects still requiring reproduction evidence.' }, { title: 'Fixes Awaiting Verification', tickets: verification, description: 'Incidents being monitored before verified resolution.' }];
    relevant = incidents.filter(ticket => ticket.assigned_team === team || mine(ticket));
    primary = { label: 'Open Product Team Queue', href: '/workspace/tickets?team=Product%20%26%20Tech' };
  }
  const relevantIds = new Set(relevant.map(ticket => ticket.id));
  const events = actor.role === 'customer_success' ? publicMessages : newest([...updates, ...activity].filter(entry => relevantIds.has(entry.ticket_id)));
  const sortTickets = (items: Ticket[]) => [...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const accounts = [...new Set(active.map(ticket => ticket.organization_id))].map(id => {
    const ongoing = active.filter(ticket => ticket.organization_id === id);
    const ticketIds = new Set(ongoing.map(ticket => ticket.id));
    const priorities = ['low', 'normal', 'high', 'critical'];
    const priority = [...ongoing].sort((a, b) => priorities.indexOf(b.priority) - priorities.indexOf(a.priority))[0].priority;
    return { id, name: ongoing[0].organization_name, ongoing: ongoing.length, priority, communication: publicMessages.find(entry => ticketIds.has(entry.ticket_id)), next: attention.find(item => ticketIds.has(item.ticket.id)) };
  });
  return { metrics, attention, queues: queues.map(queue => ({ ...queue, tickets: sortTickets(queue.tickets) })), relevant, events: events.slice(0, 8), accounts, description, primary, scopedRecords, latestRecord, latestPublic, ownerId };
}
