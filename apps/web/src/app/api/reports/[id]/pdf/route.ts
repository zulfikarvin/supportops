import { PDFDocument,StandardFonts,rgb } from 'pdf-lib';
import { ticketContext } from '@/lib/tickets/service';
import { records,logReportDownload } from '@/lib/tickets/case-service';
import { TicketError } from '@/lib/tickets/model';
import { apiError,ticketId } from '@/lib/tickets/http';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{
 const ctx=await ticketContext();const id=ticketId((await params).id);const record=(await records(ctx)).find(record=>record.id===id&&record.kind==='report');if(!record)throw new TicketError('Report not found.',404);
 const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);let page=pdf.addPage([595,842]);let y=790;const margin=48;
 const content=`SupportOps ${record.data.audience==='internal'?'CONFIDENTIAL INTERNAL':'Customer resolution'} report\n${record.status} | Version ${record.version}\n\n${record.data.content}`.replace(/[^\x20-\x7e\n]/g,'-');
 for(const paragraph of content.split('\n')){let line='';for(const word of paragraph.split(/\s+/)){const fragments=word.match(/.{1,70}/g)??[''];for(const fragment of fragments){if(font.widthOfTextAtSize((line+' '+fragment).trim(),10)>499){if(y<60){page=pdf.addPage([595,842]);y=790;}page.drawText(line,{x:margin,y,size:10,font,color:rgb(.12,.18,.23)});y-=16;line=fragment;}else line=(line+' '+fragment).trim();}}if(y<60){page=pdf.addPage([595,842]);y=790;}page.drawText(line,{x:margin,y,size:10,font});y-=18;}
 pdf.setTitle(`SupportOps report ${record.id}`);await logReportDownload(ctx,id);return new Response(new Uint8Array(await pdf.save()),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="supportops-${record.data.audience}-v${record.version}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(error){return apiError(error);}}
