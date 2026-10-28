import { TicketError } from './model';
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export function validateEvidence(filename: string, bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_FILE_SIZE) throw new TicketError('Attachments must be between 1 byte and 5 MB.');
  const name = filename.split(/[\\/]/).pop()!.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180);
  const extension = name.split('.').pop()?.toLowerCase();
  let contentType: string;
  if (extension === 'png' && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))) contentType = 'image/png';
  else if (['jpg', 'jpeg'].includes(extension ?? '') && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length-2] === 255 && bytes[bytes.length-1] === 217) contentType = 'image/jpeg';
  else if (['txt', 'log', 'csv'].includes(extension ?? '')) {
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new TicketError('Text attachments must use UTF-8.'); }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) || /<\s*(!doctype|html|script|svg)\b/i.test(text)) throw new TicketError('Upload a plain sanitized text or CSV file.');
    contentType = extension === 'csv' ? 'text/csv' : 'text/plain';
  } else throw new TicketError('Unsupported file. Use PNG, JPEG, plain text, logs, or CSV.');
  return { filename: name, contentType };
}
