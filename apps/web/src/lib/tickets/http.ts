import { NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import { TicketError } from './model';
export function apiError(error:unknown) {
  if(error instanceof ZodError)return NextResponse.json({error:error.issues[0]?.message??'Invalid input.'},{status:400});
  if(error instanceof TicketError)return NextResponse.json({error:error.message},{status:error.status});
  if(error && typeof error==='object' && 'digest' in error && String(error.digest).startsWith('NEXT_REDIRECT'))return NextResponse.json({error:'Your session expired. Sign in again.'},{status:401});
  return NextResponse.json({error:'Unable to complete the request. Try again.'},{status:500});
}
export function sameOrigin(request:Request) {
  try { if(new URL(request.headers.get('origin')??'').host!==request.headers.get('host'))throw new Error(); }
  catch { throw new TicketError('Invalid request origin.',403); }
}
export const ticketId=(value:string)=>z.uuid().parse(value);
export async function limitedBody(request:Request,limit:number) {
  if(Number(request.headers.get('content-length')??0)>limit)throw new TicketError('Request is too large.',413);
  const reader=request.body?.getReader();if(!reader)throw new TicketError('Missing request body.');
  const parts:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new TicketError('Request is too large.',413);}parts.push(value);}
  return Buffer.concat(parts);
}
export async function jsonBody(request:Request) {
  try{return JSON.parse((await limitedBody(request,100000)).toString('utf8'));}
  catch(error){if(error instanceof TicketError)throw error;throw new TicketError('Invalid JSON request.');}
}
