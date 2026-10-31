import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ticketContext } from '@/lib/tickets/service';
import { demoStore } from '@/lib/tickets/service';
import { TicketError } from '@/lib/tickets/model';
import { apiError,jsonBody,sameOrigin,ticketId } from '@/lib/tickets/http';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(request);const ctx=await ticketContext();const id=ticketId((await params).id);const {reason}=z.object({reason:z.string().trim().min(10).max(10000)}).strict().parse(await jsonBody(request));if(!ctx.client)demoStore().dispute(ctx.actor,id,reason);else{const {error}=await ctx.client.rpc('dispute_ticket',{p_ticket:id,p_reason:reason});if(error)throw new TicketError('Unable to dispute this resolution.',400);}return NextResponse.json({ok:true});}catch(error){return apiError(error);}}
