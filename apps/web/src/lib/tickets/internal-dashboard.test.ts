import { describe, expect, it } from 'vitest';
import { DemoStore, demoActor, demoPeople } from './demo-store';
import { internalDashboardModel } from './internal-dashboard';
import { workspaceNames } from '../roles';
import type { Actor, Entry, Ticket } from './model';
import type { CaseRecord } from './case-model';

const now = '2026-11-01T12:00:00.000Z';
const earlier = '2026-11-01T11:00:00.000Z';
const customer = demoActor('customer');
const analyst = demoActor('support_analyst');
const engineer = demoActor('data_engineer');
const product = demoActor('product_tech');
function ticket(id: string, changes: Partial<Ticket> = {}): Ticket {
  return { id, number: 1000 + Number(id), organization_id: 'atlas', organization_name: 'Atlas', created_by: customer.id, title: `Incident ${id}`, description: 'Synthetic incident', category: 'Data Upload Failure', status: 'Investigating', priority: 'normal', reported_urgency: 'normal', first_occurred_at: null, users_affected: null, error_message: null, assigned_team: null, assigned_to: null, resolution_summary: null, resolved_at: null, confirmed_at: null, reopened_count: 0, created_at: earlier, updated_at: earlier, record_type: 'incident', ...changes };
}
function record(ticketId: string, kind: CaseRecord['kind'], data: Record<string, unknown>, changes: Partial<CaseRecord> = {}): CaseRecord {
  return { id: `${ticketId}-${kind}`, ticket_id: ticketId, kind, status: 'Recorded', version: 1, data, created_by: analyst.id, author_name: analyst.name, reviewed_by: null, created_at: earlier, updated_at: earlier, ...changes };
}
function message(id: string, ticketId: string, actor: Actor, visibility: Entry['visibility'] = 'public', created_at = earlier): Entry {
  return { id, ticket_id: ticketId, created_by: actor.id, author_name: actor.name, visibility, body: `Message ${id}`, created_at };
}
const model = (actor: Actor, tickets: Ticket[], records: CaseRecord[] = [], updates: Entry[] = [], activity: Entry[] = [], at = now) => internalDashboardModel(actor, tickets, records, updates, activity, demoPeople, at);
const values = (result: ReturnType<typeof model>) => Object.fromEntries(result.metrics.map(metric => [metric.label, metric.value]));

describe('role-specific internal dashboard models', () => {
  it('uses actual role-specific workspace titles and rejects customer access to internal models and stored events', () => {
    expect(workspaceNames.support_analyst).toBe('Technical Support Analyst Workspace');
    expect(workspaceNames.customer_success).toBe('Customer Success Manager Workspace');
    expect(workspaceNames.data_engineer).toBe('Data Engineering Workspace');
    expect(workspaceNames.product_tech).toBe('Product & Tech Workspace');
    expect(() => model(customer, [])).toThrow('Internal workspace');
    const store = new DemoStore(':memory:', false);
    try { expect(() => store.dashboardEntries(customer, [])).toThrow('Internal workspace'); } finally { store.close(); }
  });
  it('scopes support triage, ownership and pending specialist escalation using stored assignment fields', () => {
    const tickets = [ticket('1', { status: 'Reported' }), ticket('2', { assigned_to: analyst.id, priority: 'critical' }), ticket('3', { status: 'Escalated', assigned_team: 'Support' }), ticket('4', { status: 'Escalated', assigned_team: 'Data Engineering' }), ticket('5', { status: 'Closed' }), ticket('6', { status: 'Reported', record_type: 'service_request' })];
    const result = model(analyst, tickets);
    expect(values(result)).toEqual({ 'Untriaged Incidents': 1, 'Assigned to Me': 1, 'High-Priority Incidents': 1, 'Awaiting Technical Escalation': 1 });
    expect(result.queues.find(queue => queue.title === 'Triage Queue')!.tickets.map(ticket => ticket.id)).toEqual(['1']);
    expect(result.attention.find(item => item.ticket.id === '3')!.reasons.join(' ')).toContain('technical team');
    expect(result.attention.some(item => item.ticket.id === '4')).toBe(false);
  });
  it('uses triage ownership only when there is no assigned employee', () => {
    const result = model(analyst, [ticket('1'), ticket('2', { assigned_to: engineer.id })], [record('1', 'triage', { owner_id: analyst.id }), record('2', 'triage', { owner_id: analyst.id })]);
    expect(values(result)['Assigned to Me']).toBe(1);
  });
  it('counts CSM incidents across authorized accounts, follows public customer replies, and excludes private messages and service requests', () => {
    const tickets = [ticket('1'), ticket('2', { organization_id: 'northstar', organization_name: 'Northstar', priority: 'high' }), ticket('3', { status: 'Resolved' }), ticket('4', { status: 'Closed', confirmed_at: now }), ticket('5', { record_type: 'service_request' })];
    const publicReply = message('reply', '1', customer);
    const result = model(demoActor('customer_success'), tickets, [], [publicReply, message('private', '1', engineer, 'internal', now), message('request', '5', customer), message('unavailable', '99', customer)]);
    expect(values(result)).toEqual({ 'Open Customer Incidents': 2, 'Customer Updates Needed': 2, 'High-Priority Customer Incidents': 1, 'Awaiting Customer Confirmation': 1 });
    expect(result.accounts.map(account => account.name)).toEqual(['Atlas', 'Northstar']);
    expect(result.events).toEqual([publicReply]);
    expect(result.attention.find(item => item.ticket.id === '3')!.reasons[0]).toContain('confirm');
  });
  it('derives communication deadlines only from configured cadence and resets them after a staff public update', () => {
    const tickets = [ticket('1')];
    const csm = demoActor('customer_success');
    expect(values(model(csm, tickets))['Customer Updates Needed']).toBe(0);
    const policy = record('1', 'triage', { update_cadence_minutes: 60 });
    expect(values(model(csm, tickets, [policy], [], [], '2026-11-01T11:59:00.000Z'))['Customer Updates Needed']).toBe(0);
    expect(values(model(csm, tickets, [policy]))['Customer Updates Needed']).toBe(1);
    expect(values(model(csm, tickets, [policy], [message('staff', '1', analyst, 'public', '2026-11-01T11:50:00.000Z')]))['Customer Updates Needed']).toBe(0);
    expect(values(model(csm, tickets, [], [message('customer', '1', customer), message('staff', '1', analyst, 'public', now)]))['Customer Updates Needed']).toBe(0);
  });
  it('shows only assigned data work and relevant engineering events with actual diagnostic records', () => {
    const tickets = [ticket('1', { assigned_team: 'Data Engineering', status: 'Monitoring', priority: 'high' }), ticket('2', { assigned_to: engineer.id, category: 'Data Refresh Delay' }), ticket('3', { assigned_team: 'Product & Tech', category: 'Product Bug' }), ticket('4', { assigned_team: 'Data Engineering', status: 'Resolved' })];
    const diagnostic = record('1', 'diagnostic', { source_id: 'approved-fixture', summary: { failed_checks: 2 } });
    const event = message('engineering', '1', engineer, 'internal');
    const result = model(engineer, tickets, [diagnostic], [event, message('product', '3', product, 'internal')]);
    expect(values(result)).toEqual({ 'Assigned Data Incidents': 2, 'Failed Upload Investigations': 1, 'High-Priority Data Issues': 1, 'Awaiting Verification': 1 });
    expect(result.events).toEqual([event]);
    expect(result.latestRecord(tickets[0], 'diagnostic')).toEqual(diagnostic);
    expect(result.queues[0].tickets.map(ticket => ticket.id)).toEqual(['1', '2']);
  });
  it('distinguishes product reproduction, active fixes and verification without inventing ticket states', () => {
    const tickets = [ticket('1', { category: 'Product Bug', assigned_team: 'Product & Tech', status: 'Escalated' }), ticket('2', { category: 'Product Bug', assigned_team: 'Product & Tech' }), ticket('3', { category: 'Product Bug', assigned_team: 'Product & Tech', status: 'Fix in Progress' }), ticket('4', { assigned_to: product.id, status: 'Monitoring' }), ticket('5', { category: 'Product Bug', assigned_team: 'Data Engineering' })];
    const result = model(product, tickets, [record('2', 'investigation', { reproduction_steps: 'Approved sample reproduces the error.' })]);
    expect(values(result)).toEqual({ 'Assigned Product Defects': 3, 'Awaiting Reproduction': 1, 'Fixes in Progress': 1, 'Awaiting Verification': 1 });
    expect(result.queues.find(queue => queue.title === 'Bugs Requiring Investigation')!.tickets.map(ticket => ticket.id)).toEqual(['1']);
    expect(result.queues.find(queue => queue.title === 'Escalated Product Issues')!.tickets.map(ticket => ticket.id)).toEqual(['1']);
  });
  it('uses honest zero and empty states for every internal role with no records', () => {
    for (const role of ['support_analyst', 'customer_success', 'data_engineer', 'product_tech'] as const) {
      const result = model(demoActor(role), []);
      expect(result.metrics.every(metric => metric.value === 0)).toBe(true);
      expect(result.events).toEqual([]);
      expect(result.attention).toEqual([]);
    }
  });
  it('recognizes findings entered through the focused workflow without requiring a duplicate advanced record', () => {
    const tickets = [ticket('1', { assigned_team: 'Data Engineering', category: 'Data Refresh Delay' })];
    const before = model(engineer, tickets);
    expect(before.attention[0].reasons[0]).toContain('Record the data investigation');
    const after = model(engineer, tickets, [], [message('findings', '1', engineer, 'internal')]);
    expect(after.attention).toEqual([]);
  });
});
