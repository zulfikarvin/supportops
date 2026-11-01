import { afterEach, describe, expect, it } from 'vitest';
import { DemoStore, demoActor, demoOrganizations, demoPeople } from './demo-store';
import { createSchema } from './model';
import { planWorkflow } from './workflow';

const analyst = demoActor('support_analyst');
const engineer = demoActor('data_engineer');
const customer = demoActor('customer');
const stores: DemoStore[] = [];
function setup() {
  const store = new DemoStore(':memory:', false); stores.push(store);
  const ticket = store.create(customer, createSchema.parse({ organization_id: demoOrganizations[0].id, title: 'Upload failed', description: 'The employee upload failed today.', category: 'Data Upload Failure' }));
  const triage = { action: 'triage', expected_updated_at: ticket.updated_at, impact: 'medium', urgency: 'high', business_impact: 'Customer reporting is delayed.', owner_id: engineer.id, record_type: 'incident', major_incident: false, incident_lead: '', update_cadence_minutes: 30, record_version: null };
  const run = (input: object, actor = analyst) => {
    const detail = store.detail(actor, ticket.id);
    const plan = planWorkflow(actor, detail.ticket, store.records(actor, ticket.id), demoPeople, input, new Date().toISOString());
    return store.applyWorkflow(actor, ticket.id, detail.ticket.updated_at, plan);
  };
  return { store, ticket, triage, run };
}
afterEach(() => stores.splice(0).forEach(store => store.close()));
describe('focused analyst workflow', () => {
  it('assesses, calculates priority, sets one owner/team, and moves Reported to Triaged in one save', () => {
    const { store, ticket, triage, run } = setup();
    const result = run(triage);
    expect(result.ticket).toMatchObject({ status: 'Triaged', priority: 'high', assigned_to: engineer.id, assigned_team: 'Data Engineering', business_impact: triage.business_impact });
    expect(store.records(analyst, ticket.id)[0].data.owner_id).toBe(engineer.id);
    expect(store.records(analyst, ticket.id)[0].version).toBe(1);
  });
  it('reuses each resolution fact once and resolves with actual verification evidence', () => {
    const { store, ticket, run } = setup();
    const result = run({ action: 'resolve', expected_updated_at: ticket.updated_at, resolution_summary: 'Corrected the approved import mapping.', verification_result: 'Repeated the approved upload; all 10 rows imported successfully.', verified: true, record_version: null });
    expect(result.ticket.status).toBe('Resolved');
    const record = store.records(analyst, ticket.id)[0];
    expect(record.data.restoration_method).toBe(result.ticket.resolution_summary);
    expect(record.data.closure_evidence).toBe(record.data.verification_result);
    expect(record.data.restored_at).toBeTruthy();
    store.confirm(customer, ticket.id);
    expect(store.detail(customer, ticket.id).ticket.status).toBe('Closed');
  });
  it('rejects resolving without verification or through the ordinary status selector', () => {
    const { ticket, run } = setup();
    expect(() => run({ action: 'resolve', expected_updated_at: ticket.updated_at, resolution_summary: 'Corrected mapping.', verification_result: 'Upload passed.', verified: false, record_version: null })).toThrow();
    expect(() => run({ action: 'update', expected_updated_at: ticket.updated_at, status: 'Resolved' })).toThrow('Use Resolve');
  });
  it('saves a single private message alongside a public status change without leaking the note', () => {
    const { store, ticket, run } = setup();
    const result = run({ action: 'update', expected_updated_at: ticket.updated_at, status: 'Investigating', body: 'PRIVATE hypothesis awaiting evidence', visibility: 'internal' });
    expect(result.updates).toHaveLength(1);
    expect(result.ticket.status).toBe('Investigating');
    expect(JSON.stringify(store.detail(customer, ticket.id))).not.toContain('PRIVATE');
  });
  it('requires a public question before waiting for a customer and saves it only once', () => {
    const { ticket, run } = setup();
    expect(() => run({ action: 'update', expected_updated_at: ticket.updated_at, status: 'Waiting for Customer', body: '', visibility: 'public' })).toThrow('customer-visible question');
    expect(() => run({ action: 'update', expected_updated_at: ticket.updated_at, status: 'Waiting for Customer', body: 'Private request', visibility: 'internal' })).toThrow('customer-visible question');
    const result = run({ action: 'update', expected_updated_at: ticket.updated_at, status: 'Waiting for Customer', body: 'Please attach an approved sample of the failed upload.', visibility: 'public' });
    expect(result.updates).toHaveLength(1);
    expect(result.activity.filter(event => event.event_type === 'status')).toHaveLength(1);
  });
  it('rolls back the assessment, history and ticket if assignment fails after the record save', () => {
    const { store, ticket, triage } = setup();
    const plan = planWorkflow(analyst, ticket, [], demoPeople, triage, new Date().toISOString());
    plan.change!.assigned_to = customer.id;
    expect(() => store.applyWorkflow(analyst, ticket.id, ticket.updated_at, plan)).toThrow('internal employee');
    expect(store.records(analyst, ticket.id)).toEqual([]);
    expect(store.detail(analyst, ticket.id).ticket).toEqual(ticket);
    expect(store.detail(analyst, ticket.id).activity).toHaveLength(1);
  });
  it('rejects stale ticket and record versions rather than overwriting another edit', () => {
    const { store, ticket, triage, run } = setup();
    expect(() => run({ ...triage, expected_updated_at: '2000-01-01T00:00:00.000Z' })).toThrow('ticket changed');
    expect(() => store.applyWorkflow(analyst, ticket.id, '2000-01-01T00:00:00.000Z', { records: [] })).toThrow('ticket changed');
    const result = run(triage);
    expect(() => run({ ...triage, expected_updated_at: result.ticket.updated_at })).toThrow('record changed');
  });
  it('preserves role permissions and the major-incident lead requirement', () => {
    const { ticket, triage } = setup();
    for (const role of ['customer', 'customer_success'] as const) expect(() => planWorkflow(demoActor(role), ticket, [], demoPeople, triage, new Date().toISOString())).toThrow('technical role');
    expect(() => planWorkflow(engineer, ticket, [], demoPeople, triage, new Date().toISOString())).toThrow('Only Support');
    expect(() => planWorkflow(analyst, ticket, [], demoPeople, { ...triage, impact: 'high' }, new Date().toISOString())).toThrow('incident lead');
  });
  it('allows a technical specialist to resolve, but requires new verification after a customer dispute', () => {
    const { store, ticket, run } = setup();
    run({ action: 'resolve', expected_updated_at: ticket.updated_at, resolution_summary: 'Applied the workaround.', verification_result: 'Approved sample completed successfully.', verified: true, record_version: null }, engineer);
    store.dispute(customer, ticket.id, 'The next approved sample still fails.');
    const reopened = store.detail(analyst, ticket.id).ticket;
    expect(() => store.change(analyst, ticket.id, { status: 'Resolved', explanation: '' })).toThrow('verified service restoration');
    const result = run({ action: 'resolve', expected_updated_at: reopened.updated_at, resolution_summary: 'Corrected the remaining mapping.', verification_result: 'Both approved samples now complete successfully.', verified: true, record_version: 1 });
    expect(result.ticket.status).toBe('Resolved');
    expect(store.records(analyst, ticket.id)[0].data.reopen_count).toBe(1);
  });
});
