import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalystWorkflow } from './analyst-workflow';
import { DataDiagnosis } from './data-diagnosis';
import { DemoStore, demoActor, demoOrganizations, demoPeople } from '@/lib/tickets/demo-store';
import { createSchema } from '@/lib/tickets/model';
import type { CaseRecord } from '@/lib/tickets/case-model';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
function fixture() {
  const store = new DemoStore(':memory:', false);
  try { return store.create(demoActor('customer'), createSchema.parse({ organization_id: demoOrganizations[0].id, title: 'Upload failure investigation', description: 'An approved upload sample failed.', category: 'Data Upload Failure' })); }
  finally { store.close(); }
}
describe('focused technical workflow rendering', () => {
  it('gives Data Engineering three clear steps without editable support assessment or duplicate resolution fields', () => {
    const ticket = fixture();
    const html = renderToStaticMarkup(<AnalystWorkflow actor={demoActor('data_engineer')} ticket={ticket} records={[]} people={demoPeople}/>);
    for (const title of ['1. Review &amp; diagnose', '2. Record findings &amp; progress', '3. Verify &amp; resolve']) expect(html).toContain(title);
    for (const field of ['business_impact', 'owner_id', 'restoration_method', 'closure_evidence']) expect(html).not.toContain(`name="${field}"`);
    expect(html.match(/name="resolution_summary"/g)).toHaveLength(1);
    expect(html.match(/name="verification_result"/g)).toHaveLength(1);
    expect(html).toContain('<option value="internal" selected="">Staff only</option>');
    expect(html).toContain('Start investigation');
  });
  it('keeps Support assessment unchanged and uses public update visibility for analysts', () => {
    const html = renderToStaticMarkup(<AnalystWorkflow actor={demoActor('support_analyst')} ticket={fixture()} records={[]} people={demoPeople}/>);
    expect(html).toContain('1. Assess &amp; assign');
    expect(html).toContain('2. Post an update');
    expect(html).toContain('3. Resolve ticket');
    expect(html).toContain('name="business_impact"');
    expect(html).toContain('<option value="public" selected="">Customer &amp; staff</option>');
  });
  it('shows actual diagnostic findings and timestamps without asking the engineer to retype results', () => {
    const ticket = fixture();
    const record: CaseRecord = { id: 'diagnostic', ticket_id: ticket.id, kind: 'diagnostic', status: 'Completed', version: 1, data: { source_id: 'approved-sample', summary: { failed_checks: 1, checks: [{ check_id: 'schema_change', status: 'failed', finding: 'Missing employee_id column.', recommended_steps: 'Review the approved schema.' }], conclusion: 'Sample findings only.' } }, created_by: demoActor('data_engineer').id, author_name: 'Engineer', reviewed_by: null, created_at: ticket.created_at, updated_at: ticket.updated_at };
    const html = renderToStaticMarkup(<DataDiagnosis ticket={ticket} attachments={[]} records={[record]}/>);
    expect(html).toContain('1 failed validation checks');
    expect(html).toContain('Missing employee_id column.');
    expect(html).toContain(`dateTime="${ticket.updated_at}"`);
    expect(html).not.toContain('<textarea');
  });
  it('omits upload diagnostics for unrelated incidents without sample evidence', () => {
    const ticket = { ...fixture(), category: 'Data Refresh Delay' as const };
    const html = renderToStaticMarkup(<DataDiagnosis ticket={ticket} attachments={[]} records={[]}/>);
    expect(html).not.toContain('Run sample checks');
    expect(html).toContain('Review the reported symptoms');
  });
});
