'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/button';
import { dateTime } from './ticket-ui';
import type { Attachment, Ticket } from '@/lib/tickets/model';
import type { CaseRecord } from '@/lib/tickets/case-model';

export function DataDiagnosis({ ticket, attachments, records }: { ticket: Ticket; attachments: Attachment[]; records: CaseRecord[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const runs = records.filter(record => record.kind === 'diagnostic').sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const samples = attachments.filter(file => file.content_type === 'text/csv');
  if (ticket.category !== 'Data Upload Failure' && !samples.length && !runs.length) return <p className="analyst-help">Review the reported symptoms and attached evidence before recording your findings in step 2.</p>;
  const result = (record: CaseRecord) => {
    const summary = record.data.summary as { failed_checks?: number; conclusion?: string; checks?: { check_id: string; status: string; finding: string; recommended_steps?: string }[] };
    return <article className="data-diagnostic-result" key={record.id}><h4 className="text-sm font-semibold">{typeof summary.failed_checks === 'number' ? `${summary.failed_checks} failed validation checks` : 'Recorded diagnostic result'}</h4><p className="customer-muted customer-small">Sample: {String(record.data.source_id)} · <time dateTime={record.updated_at}>{dateTime(record.updated_at)}</time></p>{summary.checks?.filter(check => check.status === 'failed').map(check => <div className="mt-3 text-sm" key={check.check_id}><p>{check.finding}</p>{check.recommended_steps && <p className="customer-muted customer-small">Next: {check.recommended_steps}</p>}</div>)}<p className="analyst-help">{summary.conclusion || 'These checks describe the submitted sample, not a confirmed incident root cause.'}</p></article>;
  };
  return <div className="mt-4 space-y-4">
    {runs[0] && result(runs[0])}
    <details className="analyst-options"><summary>Validate an approved upload sample (optional)</summary><p className="analyst-help">Use this only for upload or schema problems. Results are saved automatically; do not copy them into another form.</p><form className="mt-4 space-y-4" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(''); setFeedback('');
      const form = event.currentTarget; const data = new FormData(form);
      try {
        const response = await fetch(`/api/tickets/${ticket.id}/diagnostics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_id: data.get('source_id'), approved: data.get('approved') === 'on', baseline: ['employee_id', 'hire_date', 'employment_status'] }) });
        const responseData = await response.json(); if (!response.ok) throw new Error(responseData.error);
        setFeedback('Diagnostic results saved.'); form.reset(); router.refresh();
      } catch (error) { setError(error instanceof Error ? error.message : 'Unable to run diagnostics.'); }
      finally { setBusy(false); }
    }}><label className="field-label">Sample<select className="mt-2" name="source_id" defaultValue={samples[0]?.id ?? 'missing'}>{samples.map(file => <option value={file.id} key={file.id}>{file.filename}</option>)}<option value="missing">Synthetic fixture · missing employee_id</option><option value="invalid">Synthetic fixture · invalid records</option><option value="valid">Synthetic fixture · valid upload</option></select></label><label className="flex items-start gap-3 text-sm"><input className="!w-auto" name="approved" type="checkbox" required/>This is a synthetic or approved sanitized sample.</label><Button disabled={busy}>{busy ? 'Checking…' : 'Run sample checks'}</Button><div aria-live="polite">{error && <p className="text-sm text-rose-700" role="alert">{error}</p>}{feedback && <p className="text-sm text-teal-700" role="status">{feedback}</p>}</div></form></details>
    {runs.length > 1 && <details className="analyst-options"><summary>Earlier diagnostic runs ({runs.length - 1})</summary><div className="mt-4 space-y-4">{runs.slice(1).map(result)}</div></details>}
  </div>;
}
