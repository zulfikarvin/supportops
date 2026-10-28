import { NextResponse } from 'next/server';
import { createSchema } from '@/lib/tickets/model';
import { ticketContext, createTicket, listTickets } from '@/lib/tickets/service';
import { apiError, jsonBody, sameOrigin } from '@/lib/tickets/http';
export async function GET(){try{return NextResponse.json(await listTickets(await ticketContext()),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return apiError(error);}}
export async function POST(request:Request){try{sameOrigin(request);const ctx=await ticketContext();const input=createSchema.parse(await jsonBody(request));const id=await createTicket(ctx,input);return NextResponse.json({id},{status:201});}catch(error){return apiError(error);}}
