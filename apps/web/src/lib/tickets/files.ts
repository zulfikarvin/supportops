import { TicketError } from './model';
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

function isWordPackage(bytes: Uint8Array) {
  const data = Buffer.from(bytes);
  // Inspect the ZIP directory without extracting or executing document contents.
  if (data.length < 22 || data.readUInt32LE(0) !== 0x04034b50) return false;
  for (let end = data.length - 22; end >= Math.max(0, data.length - 65557); end--) {
    if (data.readUInt32LE(end) !== 0x06054b50 || end + 22 + data.readUInt16LE(end + 20) !== data.length) continue;
    const count = data.readUInt16LE(end + 10);
    const names = new Set<string>();
    let offset = data.readUInt32LE(end + 16);
    for (let i = 0; i < count; i++) {
      if (offset + 46 > end || data.readUInt32LE(offset) !== 0x02014b50) return false;
      const length = data.readUInt16LE(offset + 28);
      const next = offset + 46 + length + data.readUInt16LE(offset + 30) + data.readUInt16LE(offset + 32);
      if (next > end) return false;
      names.add(data.toString('utf8', offset + 46, offset + 46 + length));
      offset = next;
    }
    return names.has('[Content_Types].xml') && names.has('word/document.xml');
  }
  return false;
}
export function validateEvidence(filename: string, bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_FILE_SIZE) throw new TicketError('Attachments must be between 1 byte and 5 MB.');
  const name = filename.split(/[\\/]/).pop()!.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180);
  const extension = name.split('.').pop()?.toLowerCase();
  let contentType: string;
  if (extension === 'png' && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))) contentType = 'image/png';
  else if (['jpg', 'jpeg'].includes(extension ?? '') && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length-2] === 255 && bytes[bytes.length-1] === 217) contentType = 'image/jpeg';
  else if (extension === 'pdf' && Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-') contentType = 'application/pdf';
  else if (extension === 'doc' && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([208,207,17,224,161,177,26,225])) && Buffer.from(bytes).includes(Buffer.from('WordDocument', 'utf16le'))) contentType = 'application/msword';
  else if (extension === 'docx' && isWordPackage(bytes)) contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  else if (['txt', 'log', 'csv'].includes(extension ?? '')) {
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new TicketError('Text attachments must use UTF-8.'); }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) || /<\s*(!doctype|html|script|svg)\b/i.test(text)) throw new TicketError('Upload a plain sanitized text or CSV file.');
    contentType = extension === 'csv' ? 'text/csv' : 'text/plain';
  } else throw new TicketError('Unsupported file or contents do not match its format. Use PNG, JPEG, PDF, Word (.doc or .docx), plain text, logs, or CSV.');
  return { filename: name, contentType };
}
