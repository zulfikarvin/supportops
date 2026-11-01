import { describe, expect, it } from 'vitest';
import { validateEvidence } from './files';
import { DemoStore, demoActor, demoOrganizations } from './demo-store';
import { createSchema } from './model';

const word = Buffer.from('UEsDBBQAAAAIACOIYV2sbhJangAAANwAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbF2PsQ7CMBBDf6XKitqrGBhQ24UdGPiBU3JtI5pLlBwF/p4EpA6Mlu1nubu9A6Xq5RZOvZpFwhEg6ZkcpsYH4uyMPjqULOMEAfUdJ4J92x5AexZiqaUw1NBdVorRGqquGOWMjnoFTx8NGK8fLiebTFPV6Vcry73CEBarUaxnWNn8bdZ+HK2mrV9oIXpNKVme3NJsjkPLu4KHoYPvqeEDUEsDBBQAAAAIACOIYV05qW7iYAAAAHcAAAARAAAAd29yZC9kb2N1bWVudC54bWxFjTEOgCAMAL9ifIA1Dg4E+QsCooltCcWgv1cH43S53HC6Ks/uwEClOXEnUXVq11KSAhC3BrTScQr0tIUz2vJojlA5+5TZBZGNIu4w9P0IaDdqja5qZn+9TGA0fAr/ytxQSwECFAAUAAAACAAjiGFdrG4SWp4AAADcAAAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUABQAAAAIACOIYV05qW7iYAAAAHcAAAARAAAAAAAAAAAAAACAAc8AAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAgACAIAAAABeAQAAAAA=', 'base64');

describe('document proof uploads', () => {
  it('recognizes PDF, Word packages, and legacy Word signatures', () => {
    expect(validateEvidence('proof.PDF', Buffer.from('%PDF-1.7\n%%EOF')).contentType).toBe('application/pdf');
    expect(validateEvidence('proof.docx', word).contentType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const legacy = Buffer.concat([Buffer.from([208,207,17,224,161,177,26,225]), Buffer.from('WordDocument', 'utf16le')]);
    expect(validateEvidence('proof.doc', legacy).contentType).toBe('application/msword');
  });
  it('rejects renamed files, non-Word ZIPs, and truncated document packages', () => {
    for (const filename of ['proof.pdf', 'proof.doc', 'proof.docx']) expect(() => validateEvidence(filename, Buffer.from('not a document'))).toThrow('Unsupported');
    expect(() => validateEvidence('proof.docx', word.subarray(0, 80))).toThrow('Unsupported');
    const nonWord = Buffer.from(word);
    // Renaming the directory entry removes the required Word document part.
    nonWord.write('data/document.xml', nonWord.lastIndexOf('word/document.xml'));
    expect(() => validateEvidence('proof.docx', nonWord)).toThrow('Unsupported');
  });
  it('preserves Word proof bytes and content type through authorized upload and download', () => {
    const store = new DemoStore(':memory:', false);
    try {
      const customer = demoActor('customer');
      const ticket = store.create(customer, createSchema.parse({ organization_id: demoOrganizations[0].id, title: 'Document proof test', description: 'Testing a document attachment.', category: 'Other Technical Issue' }));
      const validated = validateEvidence('proof.docx', word);
      const file = store.attach(customer, ticket.id, { filename: validated.filename, content_type: validated.contentType, size_bytes: word.length, visibility: 'public' }, word);
      const download = store.download(customer, ticket.id, file.id);
      expect(Buffer.from(download.bytes)).toEqual(word);
      expect(download.file.content_type).toBe(validated.contentType);
      expect(() => store.download({ ...customer, organizationIds: [] }, ticket.id, file.id)).toThrow('not found');
    } finally { store.close(); }
  });
});
