import Link from 'next/link';
import { AlertCircle, ArrowUpRight, CheckCheck, ClipboardList, UserRound } from 'lucide-react';
import { AttentionQueue, MetricCard, RecentActivity, RoleWorkspaceHeader, TicketList } from './internal-dashboard-parts';
import { dateTime, PriorityBadge } from './ticket-ui';
import { internalDashboardModel } from '@/lib/tickets/internal-dashboard';
import { internalDashboardData } from '@/lib/tickets/internal-dashboard-service';
import type { Context } from '@/lib/tickets/service';
import type { Entry, Ticket } from '@/lib/tickets/model';
import type { CaseRecord } from '@/lib/tickets/case-model';

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
export async function InternalDashboard({ ctx, tickets, now, data }: { ctx: Context; tickets: Ticket[]; now: string; data: Awaited<ReturnType<typeof internalDashboardData>> }) {
  const model = internalDashboardModel(ctx.actor, tickets, data.records, data.updates, data.activity, data.people, now);
  const csm = ctx.actor.role === 'customer_success';
  const engineer = ctx.actor.role === 'data_engineer';
  const product = ctx.actor.role === 'product_tech';
  const personNames = new Map(data.people.map(person => [person.id, person.display_name]));
  const byId = new Map(tickets.map(ticket => [ticket.id, ticket]));
  const relevantIds = new Set(model.relevant.map(ticket => ticket.id));
  const icons = [ClipboardList, UserRound, AlertCircle, CheckCheck];
  const latestEvents = new Map<string, Entry>();
  const events = csm ? data.updates.filter(entry => entry.visibility === 'public') : [...data.updates, ...data.activity];
  for (const event of [...events].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))) if (!latestEvents.has(event.ticket_id)) latestEvents.set(event.ticket_id, event);
  const owner = (ticket: Ticket) => personNames.get(model.ownerId(ticket)) ?? (model.ownerId(ticket) ? 'Assigned employee' : 'Unassigned');
  const context = (ticket: Ticket) => {
    const triage = model.latestRecord(ticket, 'triage');
    const investigation = model.latestRecord(ticket, 'investigation');
    const lines = [`Category: ${ticket.category}`];
    if (!csm) {
      lines.push(`Impact: ${text(triage?.data.impact) || 'Not assessed'} · Urgency: ${text(triage?.data.urgency) || `Reported ${ticket.reported_urgency}`}`);
      if (text(investigation?.data.component)) lines.push(`Component: ${text(investigation?.data.component)}`);
      if (text(investigation?.data.error_code)) lines.push(`Recorded error: ${text(investigation?.data.error_code)}`);
      if (product && text(investigation?.data.reproduction_steps)) lines.push(`Reproduction: ${text(investigation?.data.reproduction_steps)}`);
      if (product && text(investigation?.data.evidence)) lines.push(`Evidence: ${text(investigation?.data.evidence)}`);
    }
    return lines;
  };
  const diagnostics = model.relevant.map(ticket => model.latestRecord(ticket, 'diagnostic')).filter((record): record is CaseRecord => Boolean(record)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const problems = data.records.filter(record => record.kind === 'problem' && (relevantIds.has(record.ticket_id) || (Array.isArray(record.data.incident_ids) && record.data.incident_ids.some(id => typeof id === 'string' && relevantIds.has(id)))));
  const problemIds = new Set(problems.map(record => record.id));
  const improvements = data.records.filter(record => record.kind === 'improvement' && problemIds.has(String(record.data.problem_id)));
  const queueHref = '/workspace/tickets';
  const activityTitle = csm ? 'Recent Customer Communications' : engineer ? 'Recent Engineering Updates' : ctx.actor.role === 'support_analyst' ? 'Recent Technical Activity' : 'Recent Product Activity';
  return <div className="internal-dashboard">
    <RoleWorkspaceHeader role={ctx.actor.role} description={model.description} action={model.primary}/>
    <dl className="internal-metrics">{model.metrics.map((metric, i) => <MetricCard key={metric.label} metric={metric} icon={icons[i]}/>)}</dl>
    <p className="customer-muted customer-small">Incident metrics exclude planned service requests. Service requests remain available in the Ticket Queue.</p>
    <div className="internal-work-layout">
      <div className="internal-work-main">
        <AttentionQueue items={model.attention}/>
        {csm && <section className="dash-card"><div className="customer-section-heading"><h2>Affected Customer Accounts</h2></div><p className="customer-muted">Accounts with ongoing incidents in your authorized scope.</p>{model.accounts.length ? <ul className="internal-account-list">{model.accounts.map(account => <li key={account.id}><div className="customer-section-heading"><h3><Link href={`/workspace/tickets?q=${encodeURIComponent(account.name)}`}>{account.name}<ArrowUpRight size={14}/></Link></h3><PriorityBadge value={account.priority}/></div><p className="customer-muted">{account.ongoing} ongoing incident{account.ongoing === 1 ? '' : 's'} · Highest priority: {account.priority}</p>{account.communication ? <><p className="customer-message-summary">{account.communication.body}</p><p className="customer-muted customer-small">Latest public communication · {account.communication.author_name} · <time dateTime={account.communication.created_at}>{dateTime(account.communication.created_at)}</time></p></> : <p className="customer-muted">No public communication recorded for these incidents.</p>}<p className="customer-muted mt-2">{account.next?.reasons[0] ?? 'Monitor progress with the assigned technical team.'}</p>{account.next && <Link className="customer-text-link mt-2" href={`/workspace/tickets/${account.next.ticket.id}`}>Follow up on SUP-{account.next.ticket.number}<ArrowUpRight size={13}/></Link>}</li>)}</ul> : <div className="customer-empty"><h3>No accounts with ongoing incidents</h3></div>}</section>}
        {model.queues.map(queue => <TicketList key={queue.title} title={queue.title} description={queue.description} tickets={queue.tickets} href={queueHref} owner={owner} context={context} latest={ticket => latestEvents.get(ticket.id)}/>)}
        {engineer && <section className="dash-card"><div className="customer-section-heading"><h2>Diagnostic Results</h2></div><p className="customer-muted">Recorded approved-sample checks. Validation findings do not establish an incident root cause.</p>{diagnostics.length ? <ul className="internal-record-list">{diagnostics.slice(0, 5).map(record => {
          const summary = record.data.summary as { failed_checks?: number; checks?: { check_id?: string; status?: string; finding?: string }[] } | undefined;
          return <li key={record.id}><Link className="customer-text-link" href={`/workspace/tickets/${record.ticket_id}`}>SUP-{byId.get(record.ticket_id)?.number} · Review diagnostics<ArrowUpRight size={14}/></Link><p className="mt-2 text-sm">{typeof summary?.failed_checks === 'number' ? `${summary.failed_checks} failed validation checks` : 'Diagnostic summary recorded'}</p><p className="customer-muted customer-small">Sample reference: {text(record.data.source_id) || 'Not recorded'}</p>{Array.isArray(summary?.checks) && summary.checks.filter(check => check.status === 'failed').slice(0, 3).map((check, i) => <p className="customer-muted" key={i}>{check.check_id}: {check.finding}</p>)}<time className="customer-muted customer-small" dateTime={record.updated_at}>{dateTime(record.updated_at)}</time></li>;
        })}</ul> : <div className="customer-empty"><h3>No diagnostic results recorded</h3><p className="customer-muted">Run approved-sample diagnostics from an assigned incident&apos;s Investigation Workspace.</p></div>}</section>}
        {(engineer || product) && <section className="dash-card"><div className="customer-section-heading"><h2>Linked Problems and Preventive Improvements</h2><Link className="customer-text-link" href="/workspace/learning">Insights &amp; Improvement<ArrowUpRight size={14}/></Link></div>{problems.length || improvements.length ? <ul className="internal-record-list">{[...problems, ...improvements].slice(0, 8).map(record => <li key={record.id}><Link className="customer-text-link" href={`/workspace/tickets/${record.ticket_id}`}>{text(record.data.title) || (record.kind === 'problem' ? 'Problem record' : 'Preventive improvement')}<ArrowUpRight size={14}/></Link><p className="customer-muted">{record.kind === 'problem' ? 'Problem' : 'Improvement'} · {record.status} · Owner: {personNames.get(String(record.data.owner_id)) ?? 'Not recorded'}</p>{text(record.data.component) && <p className="customer-muted">Component: {text(record.data.component)}</p>}{Array.isArray(record.data.incident_ids) && <p className="customer-muted customer-small">Linked incidents: {record.data.incident_ids.filter((id): id is string => typeof id === 'string' && byId.has(id)).map(id => `SUP-${byId.get(id)!.number}`).join(', ') || 'No authorized linked incidents'}</p>}<time className="customer-muted customer-small" dateTime={record.updated_at}>{dateTime(record.updated_at)}</time></li>)}</ul> : <div className="customer-empty"><h3>No linked Problem or improvement records</h3><p className="customer-muted">Records linked to your team&apos;s incidents will appear here.</p></div>}</section>}
      </div>
      <aside className="internal-work-rail"><RecentActivity title={activityTitle} events={model.events} tickets={model.relevant}/></aside>
    </div>
  </div>;
}
