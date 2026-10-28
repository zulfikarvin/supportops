import { NextResponse } from 'next/server';
import { ticketContext, attachFile } from '@/lib/tickets/service';
import { TicketError } from '@/lib/tickets/model';
import { apiError, limitedBody, sameOrigin, ticketId } from '@/lib/tickets/http';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
  sameOrigin(request);const ctx=await ticketContext();const id=ticketId((await params).id);
  const bytes=await limitedBody(request,6*1024*1024);
  const form=await new Response(bytes,{headers:{'content-type':request.headers.get('content-type')??''}}).formData();
  const file=form.get('file');const visibility=form.get('visibility')??'public';
  if(!(file instanceof File)||!['public','internal'].includes(String(visibility)))throw new TicketError('Choose a file and valid visibility.');
  await attachFile(ctx,id,file,visibility as 'public'|'internal');return NextResponse.json({ok:true},{status:201});
}catch(error){return apiError(error);}}
