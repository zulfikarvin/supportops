import { NextResponse } from 'next/server';
import { ticketContext } from '@/lib/tickets/service';
import { records,saveRecord,draftReports,versionHistory } from '@/lib/tickets/case-service';
import { recordSchema } from '@/lib/tickets/case-model';
import { apiError,jsonBody,sameOrigin,ticketId } from '@/lib/tickets/http';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const ctx=await ticketContext();const id=ticketId((await params).id);return NextResponse.json(await (new URL(request.url).searchParams.has('history')?versionHistory(ctx,id):records(ctx,id)),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return apiError(error);}}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(request);const ctx=await ticketContext();const id=ticketId((await params).id);const body=await jsonBody(request);const data=body&&typeof body==='object'&&body.action==='draft_reports'?await draftReports(ctx,id):await saveRecord(ctx,id,recordSchema.parse(body));return NextResponse.json(data,{status:201});}catch(error){return apiError(error);}}
