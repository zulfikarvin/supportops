import 'server-only';
import { demoPeople } from './demo-store';
import { records } from './case-service';
import { demoStore, type Context } from './service';
import { TicketError, type Entry, type Ticket } from './model';
import type { DashboardPerson } from './internal-dashboard';

export async function internalDashboardData(ctx: Context, tickets: Ticket[]) {
  if (ctx.actor.role === 'customer') throw new TicketError('Internal workspace access required.', 403);
  const publicOnly = ctx.actor.role === 'customer_success';
  const caseRecords = records(ctx);
  if (!ctx.client) return { ...demoStore().dashboardEntries(ctx.actor, tickets.map(ticket => ticket.id), publicOnly), records: await caseRecords, people: demoPeople as DashboardPerson[] };
  const client = ctx.client;
  const readEvents = async (table: 'ticket_updates' | 'ticket_activity'): Promise<Entry[]> => {
    const result: Entry[] = [];
    for (let offset = 0; offset < tickets.length; offset += 100) {
      const ids = tickets.slice(offset, offset + 100).map(ticket => ticket.id);
      for (let start = 0; ; start += 500) {
        let query = client.from(table).select('*').in('ticket_id', ids).order('created_at', { ascending: false }).order('id', { ascending: false }).range(start, start + 499);
        if (publicOnly) query = query.eq('visibility', 'public');
        const { data, error } = await query;
        if (error) throw new TicketError('Unable to load dashboard activity.', 503);
        result.push(...(data ?? []).map(row => ({ ...row, body: table === 'ticket_activity' ? row.summary : row.body, author_name: row.author_name ?? 'Team member' })) as Entry[]);
        if ((data?.length ?? 0) < 500) break;
      }
    }
    return result;
  };
  const readPeople = async () => {
    const result: DashboardPerson[] = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await client.from('profiles').select('id,display_name,role').order('id').range(start, start + 499);
      if (error) throw new TicketError('Unable to load dashboard owners.', 503);
      result.push(...(data ?? []) as DashboardPerson[]);
      if ((data?.length ?? 0) < 500) return result;
    }
  };
  const [updates, activity, people, allRecords] = await Promise.all([readEvents('ticket_updates'), publicOnly ? Promise.resolve([]) : readEvents('ticket_activity'), readPeople(), caseRecords]);
  return { updates, activity, people, records: allRecords };
}
