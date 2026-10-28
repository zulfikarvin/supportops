import { NextResponse } from 'next/server';
import { ticketContext, confirmTicket } from '@/lib/tickets/service';
import { apiError, sameOrigin, ticketId } from '@/lib/tickets/http';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(request);await confirmTicket(await ticketContext(),ticketId((await params).id));return NextResponse.json({ok:true});}catch(error){return apiError(error);}}
