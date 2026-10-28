import { NextResponse } from 'next/server';
import { ticketContext, downloadFile } from '@/lib/tickets/service';
import { apiError, ticketId } from '@/lib/tickets/http';
export async function GET(_request:Request,{params}:{params:Promise<{id:string;fileId:string}>}){try{
  const {id,fileId}=await params;const result=await downloadFile(await ticketContext(),ticketId(id),ticketId(fileId));
  if('url' in result)return NextResponse.redirect(result.url!,{headers:{'Cache-Control':'private, no-store'}});
  return new Response(new Uint8Array(result.bytes),{headers:{'Content-Type':result.file.content_type,'Content-Disposition':`attachment; filename="${result.file.filename}"`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
}catch(error){return apiError(error);}}
