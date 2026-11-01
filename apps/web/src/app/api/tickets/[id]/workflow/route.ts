import { NextResponse } from 'next/server';
import { apiError, jsonBody, sameOrigin, ticketId } from '@/lib/tickets/http';
import { demoStore, directory, ticketContext, ticketDetail } from '@/lib/tickets/service';
import { records } from '@/lib/tickets/case-service';
import { planWorkflow, workflowSchema } from '@/lib/tickets/workflow';
import { TicketError } from '@/lib/tickets/model';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const ctx = await ticketContext();
    const id = ticketId((await params).id);
    const input = workflowSchema.parse(await jsonBody(request));
    const [detail, allRecords, access] = await Promise.all([ticketDetail(ctx, id), records(ctx, id), directory(ctx)]);
    const plan = planWorkflow(ctx.actor, detail.ticket, allRecords, access.people, input, new Date().toISOString());
    if (!ctx.client) demoStore().applyWorkflow(ctx.actor, id, input.expected_updated_at, plan);
    else {
      const { error } = await ctx.client.rpc('apply_ticket_workflow', { p_ticket: id, p_expected_updated_at: input.expected_updated_at, p_records: plan.records, p_change: plan.change ?? null, p_update: plan.update ?? null });
      if (error) throw new TicketError(error.code === '42883' || error.code === 'PGRST202' ? 'Apply the simplified workflow migration before using this action.' : error.code === '40001' ? 'This ticket changed. Reload before saving.' : 'Unable to save this action. Reload and check its permissions and evidence.', error.code === '40001' ? 409 : 400);
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
