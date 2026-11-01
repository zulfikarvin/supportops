import type { Ticket } from './model';

export function customerTicketSummary(tickets: Ticket[]) {
  const open = tickets.filter(ticket => !['Resolved', 'Closed'].includes(ticket.status));
  return {
    open,
    waiting: open.filter(ticket => ticket.status === 'Waiting for Customer'),
    resolved: tickets.filter(ticket => ['Resolved', 'Closed'].includes(ticket.status)),
    actions: tickets.filter(ticket => ticket.status === 'Waiting for Customer' || (ticket.status === 'Resolved' && !ticket.confirmed_at)),
    active: [...open].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5),
  };
}
