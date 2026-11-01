/* eslint-disable @next/next/no-img-element -- Private evidence uses the browser's authenticated request rather than the image optimization proxy. */
import { ArrowUpRight, Download, Paperclip } from 'lucide-react';
import type { Attachment } from '@/lib/tickets/model';
import { dateTime } from './ticket-ui';
import { canPreviewEvidence } from '@/lib/tickets/evidence-preview';

export function EvidenceAttachments({ ticketId, files, preview = false }: { ticketId: string; files: Attachment[]; preview?: boolean }) {
  return <section className="panel" aria-labelledby="evidence-heading"><h2 id="evidence-heading" className="mb-4 flex items-center gap-2 font-semibold"><Paperclip size={18}/>Evidence &amp; attachments</h2>{files.length ? <ul className="evidence-list">{files.map(file => {
    const url = `/api/tickets/${ticketId}/attachments/${file.id}`;
    const inline = `${url}?preview=1`;
    const visible = preview && canPreviewEvidence(file.content_type);
    return <li key={file.id} className="evidence-item"><div className="evidence-heading"><div><h3>{file.filename}</h3><p className="customer-muted customer-small">{Math.ceil(file.size_bytes / 1024)} KB · {file.visibility === 'internal' ? 'Internal only' : 'Customer-visible'} · Added {dateTime(file.created_at)}</p></div><a href={url} className="customer-text-link"><Download size={14}/>Download<span className="sr-only"> {file.filename}</span></a></div>
      {visible && (file.content_type === 'application/pdf' ? <><iframe className="evidence-pdf" src={inline} title={`PDF evidence: ${file.filename}`} loading="lazy"/><p className="customer-muted customer-small mt-3">If the PDF does not appear in your browser, <a className="customer-text-link" href={inline} target="_blank" rel="noopener noreferrer">open the PDF in a new tab<ArrowUpRight size={12}/></a>.</p></> : <a className="evidence-image-link" href={inline} target="_blank" rel="noopener noreferrer" aria-label={`View ${file.filename} at full size`}><img className="evidence-image" src={inline} alt={`Submitted evidence: ${file.filename}`} loading="lazy"/></a>)}
      {preview && !visible && <p className="customer-muted customer-small mt-3">This file format is available to download. Images and PDFs preview directly here.</p>}
    </li>;
  })}</ul> : <p className="text-sm text-slate-500">No supporting evidence attached yet.</p>}</section>;
}
