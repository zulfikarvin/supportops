import { CustomerDashboard } from '@/components/customer-dashboard';
import { InternalDashboard } from '@/components/internal-dashboard';
import { pageContext } from '@/lib/tickets/page-context';
import { listTickets } from '@/lib/tickets/service';
import { analyticsWindow } from '@/lib/tickets/case-service';

export default async function Overview() {
  const ctx = await pageContext();
  const tickets = await listTickets(ctx);
  if (ctx.actor.role === 'customer') return <CustomerDashboard ctx={ctx} tickets={tickets}/>;
  return <InternalDashboard ctx={ctx} tickets={tickets} now={await analyticsWindow(0)}/>;
}
