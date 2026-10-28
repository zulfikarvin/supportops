import { NextResponse } from 'next/server';
import { changeSchema } from '@/lib/tickets/model';
import { ticketContext, ticketDetail, changeTicket } from '@/lib/tickets/service';
import { apiError, jsonBody, sameOrigin, ticketId } from '@/lib/tickets/http';
type Params={params:Promise<{id:string}>};
export async function GET(_request:Request,{params}:Params){try{return NextResponse.json(await ticketDetail(await ticketContext(),ticketId((await params).id)),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return apiError(error);}}
export async function PATCH(request:Request,{params}:Params){try{sameOrigin(request);await changeTicket(await ticketContext(),ticketId((await params).id),changeSchema.parse(await jsonBody(request)));return NextResponse.json({ok:true});}catch(error){return apiError(error);}}
