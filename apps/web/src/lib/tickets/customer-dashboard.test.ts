import { describe, expect, it } from 'vitest';
import { DemoStore, demoActor, demoOrganizations } from './demo-store';
import { createSchema, type Ticket } from './model';
import { customerTicketSummary } from './customer-dashboard';

const customer = demoActor('customer');
const input = createSchema.parse({ organization_id: demoOrganizations[0].id, title: 'Upload needs review', description: 'The employee upload did not complete.', category: 'Data Upload Failure' });

describe('customer dashboard data', () => {
  it('counts waiting as part of open and requests only replies or unconfirmed resolutions', () => {
    const store = new DemoStore(':memory:', false);
    try {
      const base = store.create(customer, input);
      const tickets: Ticket[] = ['Reported', 'Waiting for Customer', 'Resolved', 'Closed', 'Resolved'].map((status, i) => ({ ...base, id: String(i), status: status as Ticket['status'], confirmed_at: i === 4 ? base.created_at : null }));
      const result = customerTicketSummary(tickets);
      expect(result.open.map(ticket => ticket.id)).toEqual(['0', '1']);
      expect(result.waiting.map(ticket => ticket.id)).toEqual(['1']);
      expect(result.resolved).toHaveLength(3);
      expect(result.actions.map(ticket => ticket.id)).toEqual(['1', '2']);
      expect(customerTicketSummary([]).actions).toEqual([]);
    } finally { store.close(); }
  });
  it('limits active tickets to the five most recently updated open tickets', () => {
    const store = new DemoStore(':memory:', false);
    try {
      const base = store.create(customer, input);
      const tickets = Array.from({ length: 7 }, (_, i) => ({ ...base, id: String(i), updated_at: `2026-10-${20 + i}T12:00:00.000Z` }));
      expect(customerTicketSummary(tickets).active.map(ticket => ticket.id)).toEqual(['6', '5', '4', '3', '2']);
    } finally { store.close(); }
  });
  it('returns actual public messages and timestamps, excluding internal and other-organization updates before limiting', () => {
    const store = new DemoStore(':memory:', false);
    try {
      const own = store.create(customer, input);
      const otherCustomer = { ...customer, organizationIds: [demoOrganizations[1].id] };
      const other = store.create(otherCustomer, { ...input, organization_id: demoOrganizations[1].id });
      const analyst = demoActor('support_analyst');
      const messages = Array.from({ length: 7 }, (_, i) => store.addUpdate(analyst, own.id, `Public progress ${i}`, 'public'));
      store.addUpdate(analyst, own.id, 'PRIVATE engineering findings', 'internal');
      store.addUpdate(analyst, other.id, 'Other organization secret', 'public');
      const updates = store.publicUpdates(customer, [own.id, other.id], 5);
      const expected = messages.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).slice(0, 5);
      expect(updates).toEqual(expected);
      expect(store.publicUpdates(customer, [other.id], 5)).toEqual([]);
      expect(store.publicUpdates(customer, [], 5)).toEqual([]);
      expect(store.publicUpdates(customer, [own.id], 1)).toEqual(expected.slice(0, 1));
    } finally { store.close(); }
  });
});
