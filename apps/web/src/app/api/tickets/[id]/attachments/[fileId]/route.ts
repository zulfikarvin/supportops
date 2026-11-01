import { NextResponse } from 'next/server';
import { ticketContext, downloadFile } from '@/lib/tickets/service';
import { apiError, ticketId } from '@/lib/tickets/http';
import { TicketError } from '@/lib/tickets/model';
import { canPreviewEvidence, evidenceDisposition } from '@/lib/tickets/evidence-preview';
export async function GET(request:Request,{params}:{params:Promise<{id:string;fileId:string}>}){try{
  const {id,fileId}=await params;const result=await downloadFile(await ticketContext(),ticketId(id),ticketId(fileId));
  const preview=new URL(request.url).searchParams.get('preview')==='1';
  if(preview&&!canPreviewEvidence(result.file.content_type))throw new TicketError('Inline previews are available for images and PDFs.',415);
  if('url' in result&&!preview)return NextResponse.redirect(result.url!,{headers:{'Cache-Control':'private, no-store'}});
  let body:BodyInit;
  if('url' in result){
    // Stream private Storage evidence through the authorized same-origin endpoint.
    // Its download disposition is intentionally replaced for embedded previews.
    const response=await fetch(result.url!,{cache:'no-store'});
    if(!response.ok||!response.body)throw new TicketError('Unable to load the evidence preview.',503);
    body=response.body;
  }else body=new Uint8Array(result.bytes);
  return new Response(body,{headers:{'Content-Type':result.file.content_type,'Content-Disposition':evidenceDisposition(result.file.filename,preview),'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"frame-ancestors 'self'",'Referrer-Policy':'no-referrer'}});
}catch(error){return apiError(error);}}
