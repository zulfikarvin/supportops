import Link from 'next/link';
import { ArrowUpRight, CheckCheck } from 'lucide-react';
import { ReportIssueButton } from './report-issue-button';
import { dateTime, StatusBadge } from './ticket-ui';
import { customerTicketSummary } from '@/lib/tickets/customer-dashboard';
import { directory, publicTicketUpdates, type Context } from '@/lib/tickets/service';
import type { Ticket } from '@/lib/tickets/model';
import { workspaceNames } from '@/lib/roles';

export async function CustomerDashboard({ ctx, tickets }: { ctx: Context; tickets: Ticket[] }) {
  const summary = customerTicketSummary(tickets);
  // Bound each request: five timeline messages and one latest message per active ticket.
  // Batch the timeline by organization to avoid an unbounded ticket-ID URL.
  const organizations = [...new Set(tickets.map(ticket => ticket.organization_id))];
  const [access, batches, latest] = await Promise.all([
    directory(ctx),
    Promise.all(organizations.map(async organizationId => {
      const ids = tickets.filter(ticket => ticket.organization_id === organizationId).map(ticket => ticket.id);
      const chunks = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, (i + 1) * 100));
      return (await Promise.all(chunks.map(chunk => publicTicketUpdates(ctx, chunk, 5)))).flat();
    })),
    Promise.all(summary.active.map(async ticket => [ticket.id, (await publicTicketUpdates(ctx, [ticket.id], 1))[0]] as const)),
  ]);
  const recent = batches.flat().sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).slice(0, 5);
  const latestByTicket = new Map(latest);
  const byId = new Map(tickets.map(ticket => [ticket.id, ticket]));
  const metrics = [
    { key: 'open', label: 'Open Tickets', count: summary.open.length, note: 'Currently in progress' },
    { key: 'waiting', label: 'Waiting on You', count: summary.waiting.length, note: 'Open tickets awaiting your response' },
    { key: 'resolved', label: 'Resolved', count: summary.resolved.length, note: 'Resolved and closed tickets' },
  ];
  return <div className="customer-dashboard">
    <header className="customer-heading">
      <div><p className="eyebrow">{access.organizations.map(org => org.name).join(' · ') || 'Customer portal'}</p><h1 className="page-title">Dashboard</h1><p className="internal-role-title">{workspaceNames[ctx.actor.role]}</p><p className="customer-muted">Track your support requests and incident progress.</p></div>
      <ReportIssueButton/>
    </header>
    <dl className="customer-metrics">{metrics.map(metric => <div className="dash-card" key={metric.key}><dt>{metric.label}</dt><dd data-metric={metric.key}>{metric.count}</dd><p className="customer-muted">{metric.note}</p></div>)}</dl>
    <section className="dash-card customer-actions" aria-labelledby="customer-action-title">
      <div className="customer-section-heading"><h2 id="customer-action-title">Action Required</h2>{summary.actions.length > 0 && <span className="customer-action-count">{summary.actions.length}</span>}</div>
      {summary.actions.length ? <ul>{summary.actions.map(ticket => <li key={ticket.id}><div><span className="customer-reference">SUP-{ticket.number}</span><h3>{ticket.title}</h3><p className="customer-muted">{ticket.status === 'Resolved' ? 'Confirm the resolution or let us know if the issue persists.' : 'Reply with the information requested by your support team.'}</p></div><Link className="customer-text-link" href={`/workspace/tickets/${ticket.id}`}>{ticket.status === 'Resolved' ? 'Review resolution' : 'Reply to ticket'}<ArrowUpRight size={15}/></Link></li>)}</ul> : <div className="customer-caught-up"><CheckCheck size={20}/><div><p>You&apos;re all caught up.</p><p className="customer-muted">No tickets currently require your response.</p></div></div>}
    </section>
    <div className="customer-content">
      <section className="dash-card" aria-labelledby="customer-active-title"><div className="customer-section-heading"><h2 id="customer-active-title">Active Tickets</h2><Link className="customer-text-link" href="/workspace/tickets">View All Tickets<ArrowUpRight size={15}/></Link></div>
        <p className="customer-muted">Your five most recently updated open tickets.</p>
        {summary.active.length ? <ul className="customer-ticket-list">{summary.active.map(ticket => {
          const update = latestByTicket.get(ticket.id);
          return <li key={ticket.id}><div className="customer-ticket-meta"><span className="customer-reference">SUP-{ticket.number}</span><span className="customer-type">{ticket.record_type === 'service_request' ? 'Service Request' : 'Incident'}</span><StatusBadge value={ticket.status}/></div><h3><Link href={`/workspace/tickets/${ticket.id}`}>{ticket.title}<ArrowUpRight size={16}/></Link></h3><p className="customer-message-summary">{update ? update.body : 'No public updates yet. Updates from your support team will appear here.'}</p>{update && <p className="customer-muted customer-small">Latest public update · <time dateTime={update.created_at}>{dateTime(update.created_at)}</time></p>}<p className="customer-muted customer-small">Ticket updated <time dateTime={ticket.updated_at}>{dateTime(ticket.updated_at)}</time></p></li>;
        })}</ul> : <div className="customer-empty"><h3>No active tickets</h3><p className="customer-muted">Your resolved requests remain available in All Tickets.</p></div>}
      </section>
      <section className="dash-card" aria-labelledby="customer-updates-title"><div className="customer-section-heading"><h2 id="customer-updates-title">Recent Updates</h2></div><p className="customer-muted">Latest public messages across your tickets.</p>
        {recent.length ? <ol className="customer-timeline">{recent.map(update => <li key={update.id}><Link className="customer-text-link" href={`/workspace/tickets/${update.ticket_id}`}>SUP-{byId.get(update.ticket_id)!.number}<ArrowUpRight size={13}/></Link><p className="customer-timeline-message">{update.body}</p><p className="customer-muted customer-small">{update.author_name}</p><time className="customer-muted customer-small" dateTime={update.created_at}>{dateTime(update.created_at)}</time></li>)}</ol> : <div className="customer-empty"><h3>No public updates yet</h3><p className="customer-muted">Messages shared on your tickets will appear here.</p></div>}
      </section>
    </div>
  </div>;
}
