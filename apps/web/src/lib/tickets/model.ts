import { z } from 'zod';
import type { Role } from '../roles';

export const statuses = ['Reported', 'Triaged', 'Investigating', 'Escalated', 'Fix in Progress', 'Waiting for Customer', 'Monitoring', 'Resolved', 'Closed'] as const;
export const categories = ['Data Upload Failure', 'Incorrect Dashboard Data', 'Data Refresh Delay', 'Login / SSO Issue', 'Product Bug', 'Other Technical Issue'] as const;
export const priorities = ['low', 'normal', 'high', 'critical'] as const;
export const teams = ['Support', 'Customer Success', 'Data Engineering', 'Product & Tech'] as const;
export type Actor = { id: string; name: string; role: Role; organizationIds: string[] };
export type Ticket = {
  id: string; number: number; organization_id: string; organization_name: string; created_by: string;
  title: string; description: string; category: typeof categories[number]; status: typeof statuses[number];
  priority: typeof priorities[number]; reported_urgency: typeof priorities[number]; first_occurred_at: string | null;
  users_affected: number | null; error_message: string | null; assigned_team: string | null; assigned_to: string | null;
  resolution_summary: string | null; resolved_at: string | null; confirmed_at: string | null;
  reopened_count: number; created_at: string; updated_at: string;
};
export type Entry = { id: string; ticket_id: string; created_by: string; author_name: string; visibility: 'public' | 'internal'; body: string; created_at: string; event_type?: string; previous_status?: string | null; new_status?: string | null };
export type Attachment = { id: string; ticket_id: string; filename: string; content_type: string; size_bytes: number; visibility: 'public' | 'internal'; created_at: string; object_path?: string };
export type Detail = { ticket: Ticket; updates: Entry[]; activity: Entry[]; attachments: Attachment[] };
export const createSchema = z.object({
  organization_id: z.uuid(), title: z.string().trim().min(3).max(200), description: z.string().trim().min(10).max(20000),
  category: z.enum(categories), reported_urgency: z.enum(priorities).default('normal'),
  first_occurred_at: z.iso.datetime({ offset: true }).nullable().default(null),
  users_affected: z.number().int().min(0).max(100000000).nullable().default(null),
  error_message: z.string().trim().max(10000).nullable().default(null),
}).strict();
export const changeSchema = z.object({
  status: z.enum(statuses).optional(), priority: z.enum(priorities).optional(),
  assigned_team: z.enum(teams).nullable().optional(), assigned_to: z.uuid().nullable().optional(),
  explanation: z.string().trim().max(10000).default(''), resolution_summary: z.string().trim().max(20000).optional(),
}).strict().refine(value => ['status', 'priority', 'assigned_team', 'assigned_to', 'resolution_summary'].some(key => key in value), 'Choose a change.');
export const updateSchema = z.object({ body: z.string().trim().min(1).max(20000), visibility: z.enum(['public', 'internal']) }).strict();
export type CreateInput = z.infer<typeof createSchema>;
export type ChangeInput = z.infer<typeof changeSchema>;
export class TicketError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function assertRead(actor: Actor, ticket: Pick<Ticket, 'organization_id'>) {
  if (actor.role === 'customer' && !actor.organizationIds.includes(ticket.organization_id)) throw new TicketError('Ticket not found.', 404);
}
export function assertChange(actor: Actor, ticket: Ticket, input: ChangeInput) {
  if (actor.role === 'customer' || actor.role === 'customer_success') throw new TicketError('Your role cannot change investigation controls.', 403);
  if (actor.role !== 'support_analyst' && ('priority' in input || 'assigned_team' in input || 'assigned_to' in input)) throw new TicketError('Only Support can triage and assign tickets.', 403);
  if (input.status === 'Triaged' && actor.role !== 'support_analyst') throw new TicketError('Only Support can triage tickets.', 403);
  if (input.status === 'Closed') throw new TicketError('Closure requires customer confirmation.', 400);
  if (ticket.status === 'Closed') throw new TicketError('Closed tickets cannot be changed.', 409);
  if (ticket.status === 'Resolved' && input.status && input.status !== 'Investigating' && input.status !== 'Resolved') throw new TicketError('Reopen a resolved ticket as Investigating.', 409);
  if (input.status === 'Resolved' && !(input.resolution_summary || ticket.resolution_summary)?.trim()) throw new TicketError('Add a resolution summary before resolving.', 400);
}
