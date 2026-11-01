import { afterEach, describe, expect, it, vi } from 'vitest';
import { canPreviewEvidence, evidenceDisposition } from './evidence-preview';
import { TicketError } from './model';
const { download, context } = vi.hoisted(() => ({ download: vi.fn(), context: vi.fn(async () => ({ actor: { role: 'support_analyst' } })) }));
vi.mock('@/lib/tickets/service', () => ({ downloadFile: download, ticketContext: context }));
import { GET } from '@/app/api/tickets/[id]/attachments/[fileId]/route';

const id = '10000000-0000-4000-8000-000000000001';
const fileId = '10000000-0000-4000-8000-000000000002';
const params = { params: Promise.resolve({ id, fileId }) };
const file = { id: fileId, ticket_id: id, filename: 'proof.pdf', content_type: 'application/pdf', size_bytes: 14, visibility: 'public', created_at: '2026-11-01T12:00:00Z' };
const request = (preview = true) => new Request(`http://localhost:3000/api/tickets/${id}/attachments/${fileId}${preview ? '?preview=1' : ''}`);
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe('authorized inline evidence delivery', () => {
  it('allows only supported image and PDF preview MIME types and safely encodes filenames', () => {
    for (const type of ['image/png', 'image/jpeg', 'application/pdf']) expect(canPreviewEvidence(type)).toBe(true);
    for (const type of ['text/html', 'application/msword', 'image/svg+xml']) expect(canPreviewEvidence(type)).toBe(false);
    const disposition = evidenceDisposition('proof"\r\n.pdf', true);
    expect(disposition).not.toMatch(/[\r\n]/);
    expect(disposition).toContain('inline; filename="proof___.pdf"');
  });
  it('renders local PDF bytes inline with private caching and preserves explicit downloads', async () => {
    download.mockResolvedValue({ file, bytes: Buffer.from('%PDF-1.7\n%%EOF') });
    const response = await GET(request(), params);
    expect(download).toHaveBeenCalledWith(await context.mock.results[0].value, id, fileId);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toMatch(/^inline;/);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(await response.text()).toBe('%PDF-1.7\n%%EOF');
    expect((await GET(request(false), params)).headers.get('content-disposition')).toMatch(/^attachment;/);
  });
  it('serves authorized images with their actual image MIME type', async () => {
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    download.mockResolvedValue({ file: { ...file, content_type: 'image/png', filename: 'proof.png' }, bytes });
    const response = await GET(request(), params);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });
  it('streams Supabase previews through the authorized endpoint instead of redirecting to a download', async () => {
    download.mockResolvedValue({ file, url: 'https://storage.example/signed-evidence' });
    const fetcher = vi.fn(async () => new Response('%PDF-1.7\n%%EOF', { headers: { 'Content-Disposition': 'attachment' } }));
    vi.stubGlobal('fetch', fetcher);
    const response = await GET(request(), params);
    expect(fetcher).toHaveBeenCalledWith('https://storage.example/signed-evidence', { cache: 'no-store' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toMatch(/^inline;/);
    expect(await response.text()).toBe('%PDF-1.7\n%%EOF');
    const downloadResponse = await GET(request(false), params);
    expect(downloadResponse.status).toBe(307);
    expect(downloadResponse.headers.get('location')).toBe('https://storage.example/signed-evidence');
  });
  it('respects attachment authorization and rejects unsupported inline formats', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    download.mockRejectedValueOnce(new TicketError('Attachment not found.', 404));
    expect((await GET(request(), params)).status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
    download.mockResolvedValue({ file: { ...file, content_type: 'application/msword' }, bytes: new Uint8Array([1]) });
    expect((await GET(request(), params)).status).toBe(415);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('returns an honest error when private Storage cannot serve a preview', async () => {
    download.mockResolvedValue({ file, url: 'https://storage.example/signed-evidence' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    expect((await GET(request(), params)).status).toBe(503);
  });
});
