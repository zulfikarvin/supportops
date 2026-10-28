import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { demoRoles } from '../demo';
import { assertChange, assertRead, TicketError, type Actor, type Ticket, type Detail, type Entry, type Attachment, type CreateInput, type ChangeInput } from './model';

export const demoOrganizations = [
  { id: '10000000-0000-4000-8000-000000000001', name: 'Atlas Industries' },
  { id: '10000000-0000-4000-8000-000000000002', name: 'Northstar Logistics' },
  { id: '10000000-0000-4000-8000-000000000003', name: 'Meridian Group' },
];
export const demoPeople = demoRoles.map((person, i) => ({ id: `20000000-0000-4000-8000-00000000000${i+1}`, display_name: person.name, role: person.role }));
export function demoActor(role: Actor['role']): Actor {
  const person = demoPeople.find(person => person.role === role)!;
  return { id: person.id, name: person.display_name, role, organizationIds: role === 'customer' ? [demoOrganizations[0].id] : [] };
}
export class DemoStore {
  private db: DatabaseSync;
  constructor(path: string, seed = true) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS tickets(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES tickets(id), kind TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attachments(id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES tickets(id), data TEXT NOT NULL, bytes BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES tickets(id), event_type TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, payload TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    if (seed && !this.db.prepare('SELECT value FROM metadata WHERE key=?').get('seed-v1')) this.seed();
  }
  close() { this.db.close(); }
  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = work(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private raw(id: string): Ticket {
    const row = this.db.prepare('SELECT data FROM tickets WHERE id=?').get(id) as { data: string } | undefined;
    if (!row) throw new TicketError('Ticket not found.', 404);
    return JSON.parse(row.data);
  }
  private save(ticket: Ticket) { this.db.prepare('INSERT INTO tickets(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(ticket.id, JSON.stringify(ticket)); }
  private entry(actor: Actor, ticket: Ticket, kind: string, body: string, visibility: Entry['visibility'] = 'public', previous?: string) {
    const entry: Entry = { id: randomUUID(), ticket_id: ticket.id, created_by: actor.id, author_name: actor.name, visibility, body, created_at: new Date().toISOString(), event_type: kind, previous_status: previous ?? null, new_status: kind === 'status' ? ticket.status : null };
    this.db.prepare('INSERT INTO entries VALUES (?,?,?,?)').run(entry.id, ticket.id, kind === 'message' ? 'update' : 'activity', JSON.stringify(entry));
    return entry;
  }
  private notify(actor: Actor, ticket: Ticket, event: string, eventId: string) {
    const id = randomUUID();
    this.db.prepare('INSERT OR IGNORE INTO notifications VALUES (?,?,?,?,?,?)').run(id, ticket.id, event, `${event}:${eventId}`, JSON.stringify({ ticket_id: ticket.id, organization_id: ticket.organization_id, event_type: event, actor_id: actor.id }), new Date().toISOString());
  }
  list(actor: Actor): Ticket[] {
    const records = this.db.prepare('SELECT data FROM tickets').all() as { data: string }[];
    return records.map(row => JSON.parse(row.data) as Ticket).filter(ticket => actor.role !== 'customer' || actor.organizationIds.includes(ticket.organization_id)).sort((a,b) => b.updated_at.localeCompare(a.updated_at));
  }
  detail(actor: Actor, id: string): Detail {
    const ticket = this.raw(id); assertRead(actor, ticket);
    const rows = this.db.prepare('SELECT kind,data FROM entries WHERE ticket_id=? ORDER BY rowid').all(id) as { kind: string; data: string }[];
    const visible = rows.map(row => ({ kind: row.kind, entry: JSON.parse(row.data) as Entry })).filter(({ entry }) => actor.role !== 'customer' || entry.visibility === 'public');
    const files = this.db.prepare('SELECT data FROM attachments WHERE ticket_id=?').all(id) as { data: string }[];
    return { ticket, updates: visible.filter(row => row.kind === 'update').map(row => row.entry), activity: visible.filter(row => row.kind === 'activity').map(row => row.entry), attachments: files.map(row => JSON.parse(row.data) as Attachment).filter(file => actor.role !== 'customer' || file.visibility === 'public') };
  }
  create(actor: Actor, input: CreateInput) {
    if (actor.role !== 'customer') throw new TicketError('Use the customer role to report an issue.', 403);
    if (!actor.organizationIds.includes(input.organization_id)) throw new TicketError('Organization access denied.', 403);
    return this.transaction(() => {
      const count = this.db.prepare('SELECT COUNT(*) count FROM tickets').get() as { count: number };
      const now = new Date().toISOString();
      const ticket: Ticket = { ...input, id: randomUUID(), number: count.count + 1001, organization_name: demoOrganizations.find(org => org.id === input.organization_id)?.name ?? 'Demo organization', created_by: actor.id, status: 'Reported', priority: 'normal', assigned_team: null, assigned_to: null, resolution_summary: null, resolved_at: null, confirmed_at: null, reopened_count: 0, created_at: now, updated_at: now };
      this.save(ticket); const entry = this.entry(actor, ticket, 'created', 'Issue reported.'); this.notify(actor,ticket,'ticket.created',entry.id); return ticket;
    });
  }
  change(actor: Actor, id: string, input: ChangeInput) {
    return this.transaction(() => {
      const ticket = this.raw(id); assertRead(actor,ticket); assertChange(actor,ticket,input);
      if (input.assigned_to && !demoPeople.some(person => person.id === input.assigned_to && person.role !== 'customer')) throw new TicketError('Choose an internal employee.');
      const previous = ticket.status; const oldTeam = ticket.assigned_team; const oldAssignee = ticket.assigned_to; const oldPriority = ticket.priority;
      const { explanation, ...changes } = input; Object.assign(ticket, changes);
      if (ticket.status !== previous) {
        if (previous === 'Resolved') { ticket.reopened_count++; ticket.resolved_at = null; ticket.confirmed_at = null; }
        if (ticket.status === 'Resolved') ticket.resolved_at = new Date().toISOString();
        const event = this.entry(actor,ticket,'status',`${previous} → ${ticket.status}${explanation ? `: ${explanation}` : ''}`, 'public', previous);
        if (ticket.status === 'Waiting for Customer') this.notify(actor,ticket,'ticket.waiting',event.id);
        if (ticket.status === 'Resolved') this.notify(actor,ticket,'ticket.resolved',event.id);
      }
      if (oldTeam !== ticket.assigned_team || oldAssignee !== ticket.assigned_to) {
        const assignee = demoPeople.find(person => person.id === ticket.assigned_to)?.display_name;
        const event = this.entry(actor,ticket,'assignment',`Assigned team: ${ticket.assigned_team ?? 'Unassigned'}${assignee ? `; employee: ${assignee}` : '; employee: unassigned'}.`);
        this.notify(actor,ticket,'ticket.assigned',event.id);
      }
      if (oldPriority !== ticket.priority) this.entry(actor,ticket,'priority',`Priority changed from ${oldPriority} to ${ticket.priority}.`);
      if (input.resolution_summary !== undefined) this.entry(actor,ticket,'resolution','Resolution documentation updated.');
      ticket.updated_at = new Date().toISOString(); this.save(ticket); return ticket;
    });
  }
  addUpdate(actor: Actor,id: string,body: string,visibility: Entry['visibility']) {
    return this.transaction(() => {
      const ticket = this.raw(id); assertRead(actor,ticket);
      if (actor.role === 'customer' && visibility !== 'public') throw new TicketError('Customers can only send public replies.',403);
      if (ticket.status === 'Closed') throw new TicketError('This ticket is closed.',409);
      const update = this.entry(actor,ticket,'message',body,visibility);
      if (actor.role !== 'customer' && visibility === 'public') this.notify(actor,ticket,'ticket.public_update',update.id);
      ticket.updated_at = update.created_at; this.save(ticket); return update;
    });
  }
  confirm(actor: Actor,id: string) {
    return this.transaction(() => {
      const ticket = this.raw(id); assertRead(actor,ticket);
      if (actor.role !== 'customer') throw new TicketError('Only a customer can confirm resolution.',403);
      if (ticket.status !== 'Resolved') throw new TicketError('Only a resolved ticket can be confirmed.',409);
      ticket.status = 'Closed'; ticket.confirmed_at = new Date().toISOString(); ticket.updated_at = ticket.confirmed_at;
      this.entry(actor,ticket,'status','Customer confirmed the resolution.', 'public','Resolved'); this.save(ticket); return ticket;
    });
  }
  attach(actor: Actor,id: string,file: Omit<Attachment,'id'|'ticket_id'|'created_at'>, bytes: Uint8Array) {
    return this.transaction(() => {
      const ticket=this.raw(id); assertRead(actor,ticket);
      if (actor.role === 'customer' && file.visibility !== 'public') throw new TicketError('Customers cannot upload internal evidence.',403);
      if (ticket.status === 'Closed') throw new TicketError('This ticket is closed.',409);
      const item: Attachment = { ...file,id:randomUUID(),ticket_id:id,created_at:new Date().toISOString() };
      this.db.prepare('INSERT INTO attachments VALUES (?,?,?,?)').run(item.id,id,JSON.stringify(item),bytes);
      this.entry(actor,ticket,'attachment',`Evidence added: ${file.filename}`,file.visibility); ticket.updated_at=item.created_at;this.save(ticket); return item;
    });
  }
  download(actor: Actor,id: string,fileId: string) {
    const detail=this.detail(actor,id); const file=detail.attachments.find(file=>file.id===fileId);
    if(!file)throw new TicketError('Attachment not found.',404);
    const row=this.db.prepare('SELECT bytes FROM attachments WHERE id=?').get(fileId) as {bytes:Uint8Array};
    return {file,bytes:row.bytes};
  }
  private seed() {
    this.transaction(() => {
      if (this.db.prepare('SELECT value FROM metadata WHERE key=?').get('seed-v1')) return;
      const analyst=demoActor('support_analyst');
      const examples = [
        ['Scheduled employee upload failed','Data Upload Failure','Atlas Industries','Investigating','high','Support','The scheduled synthetic employee feed failed validation. Please investigate the latest upload.'],
        ['Headcount differs from our HR system','Incorrect Dashboard Data','Northstar Logistics','Escalated','high','Data Engineering','The fictional HR system shows 5,000 employees while the dashboard shows 4,850.'],
        ['Employees cannot sign in through SSO','Login / SSO Issue','Meridian Group','Waiting for Customer','critical','Support','Employees at the fictional organization cannot access the platform through SAML sign-in.'],
        ['Department filter returns unexpected results','Product Bug','Atlas Industries','Fix in Progress','normal','Product & Tech','Selecting a department in the synthetic dashboard does not update all charts consistently.'],
      ];
      examples.forEach(([title,category,org,status,priority,team,description],i) => {
        const created=new Date(Date.now()-(i+1)*86400000).toISOString();
        const updated=new Date(new Date(created).getTime()+3*3600000).toISOString();
        const ticket:Ticket={ id:randomUUID(),number:1001+i,organization_id:demoOrganizations.find(item=>item.name===org)!.id,organization_name:org,created_by:demoPeople[0].id,title,description,category:category as Ticket['category'],status:status as Ticket['status'],priority:priority as Ticket['priority'],reported_urgency:'high',first_occurred_at:created,users_affected:25,error_message:null,assigned_team:team,assigned_to:demoActor(team==='Data Engineering'?'data_engineer':team==='Product & Tech'?'product_tech':'support_analyst').id,resolution_summary:null,resolved_at:null,confirmed_at:null,reopened_count:0,created_at:created,updated_at:updated};
        this.save(ticket);
        const event=this.entry(analyst,ticket,'created','Fictional incident added for the demo.');
        event.created_at=created;this.db.prepare('UPDATE entries SET data=? WHERE id=?').run(JSON.stringify(event),event.id);
        const statusEvent=this.entry(analyst,ticket,'status',`Reported → ${status}: Investigation started.`, 'public','Reported');
        statusEvent.created_at=new Date(new Date(created).getTime()+3600000).toISOString();this.db.prepare('UPDATE entries SET data=? WHERE id=?').run(JSON.stringify(statusEvent),statusEvent.id);
        const publicEvent=this.entry(analyst,ticket,'message','We are investigating this report and will share an update as we learn more.');
        publicEvent.created_at=new Date(new Date(created).getTime()+2*3600000).toISOString();this.db.prepare('UPDATE entries SET data=? WHERE id=?').run(JSON.stringify(publicEvent),publicEvent.id);
        const privateEvent=this.entry(analyst,ticket,'message',i===0?'Hypothesis: the synthetic feed may be missing employee_id. Verify schema before concluding root cause.':'Reproduce with synthetic evidence before identifying a root cause.','internal');
        privateEvent.created_at=updated;this.db.prepare('UPDATE entries SET data=? WHERE id=?').run(JSON.stringify(privateEvent),privateEvent.id);
      });
      this.db.prepare('INSERT INTO metadata VALUES (?,?)').run('seed-v1','done');
    });
  }
}
