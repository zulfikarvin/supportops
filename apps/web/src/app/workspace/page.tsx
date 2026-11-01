import { CustomerDashboard } from '@/components/customer-dashboard';
import { InternalDashboard } from '@/components/internal-dashboard';
import { pageContext } from '@/lib/tickets/page-context';
import { listTickets } from '@/lib/tickets/service';
import { analyticsWindow, MissingStudyCaseMigration } from '@/lib/tickets/case-service';
import { internalDashboardData } from '@/lib/tickets/internal-dashboard-service';

export default async function Overview() {
  const ctx = await pageContext();
  const tickets = await listTickets(ctx);
  if (ctx.actor.role === 'customer') return <CustomerDashboard ctx={ctx} tickets={tickets}/>;
  let data: Awaited<ReturnType<typeof internalDashboardData>> | undefined;
  try {
    data = await internalDashboardData(ctx, tickets.filter(ticket => ticket.record_type !== 'service_request'));
  } catch (error) {
    if (!(error instanceof MissingStudyCaseMigration)) throw error;
  }
  if (!data) return <section className="dash-card" role="alert"><h1 className="page-title">Staff workspace setup required</h1><p className="mt-4">Your role is signed in successfully. This database is missing the investigation tables needed by staff.</p><p className="mt-4">The site owner needs to run <code>supabase/repairs/hosted-staff-workspace.sql</code> in the Supabase SQL Editor, then refresh this page.</p><p className="customer-muted mt-4">This repair preserves existing tickets and accounts. Customer access remains available.</p></section>;
  return <InternalDashboard ctx={ctx} tickets={tickets} now={await analyticsWindow(0)} data={data}/>;
}
