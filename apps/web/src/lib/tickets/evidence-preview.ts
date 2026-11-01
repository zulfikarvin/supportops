export function canPreviewEvidence(contentType: string) {
  return ['image/png', 'image/jpeg', 'application/pdf'].includes(contentType);
}

export function evidenceDisposition(filename: string, inline: boolean) {
  const fallback = filename.replace(/[^a-zA-Z0-9._ -]/g, '_') || 'evidence';
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
