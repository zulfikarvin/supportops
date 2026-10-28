import { NextResponse } from 'next/server';
import { updateSchema } from '@/lib/tickets/model';
import { ticketContext, addUpdate } from '@/lib/tickets/service';
import { apiError, jsonBody, sameOrigin, ticketId } from '@/lib/tickets/http';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(request);const input=updateSchema.parse(await jsonBody(request));await addUpdate(await ticketContext(),ticketId((await params).id),input.body,input.visibility);return NextResponse.json({ok:true},{status:201});}catch(error){return apiError(error);}}
