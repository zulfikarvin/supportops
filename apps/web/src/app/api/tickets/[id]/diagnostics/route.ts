import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ticketContext,ticketDetail,downloadFile } from '@/lib/tickets/service';
import { saveDiagnostic } from '@/lib/tickets/case-service';
import { TicketError } from '@/lib/tickets/model';
import { apiError,jsonBody,sameOrigin,ticketId } from '@/lib/tickets/http';
const schema=z.object({source_id:z.string().max(100),approved:z.literal(true),baseline:z.array(z.string().max(100)).max(100).optional()}).strict();
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
 sameOrigin(request);const ctx=await ticketContext();if(['customer','customer_success'].includes(ctx.actor.role))throw new TicketError('A technical role is required.',403);
 const id=ticketId((await params).id);await ticketDetail(ctx,id);const input=schema.parse(await jsonBody(request));
 const fixtures:Record<string,string>={valid:'employee_id,hire_date,employment_status\nDEMO-001,2024-01-15,active',missing:'employee_number,hire_date,employment_status\nDEMO-001,2024-01-15,active',invalid:'employee_id,hire_date,employment_status\nDEMO-001,2024-02-30,active\nDEMO-001,2024-01-01,unknown\n,2024-01-01,active'};
 let bytes:Uint8Array;
 if(Object.hasOwn(fixtures,input.source_id))bytes=Buffer.from(fixtures[input.source_id]);
 else{const file=await downloadFile(ctx,id,z.uuid().parse(input.source_id));if(file.file.content_type!=='text/csv')throw new TicketError('Choose a CSV sample.');bytes='bytes'in file?file.bytes:new Uint8Array(await (await fetch(file.url!,{signal:AbortSignal.timeout(10000),cache:'no-store'})).arrayBuffer());}
 const token=process.env.DIAGNOSTICS_API_TOKEN;const url=process.env.DIAGNOSTICS_URL;
 if(!token||!url)throw new TicketError('Start the Python diagnostic service and configure DIAGNOSTICS_URL and DIAGNOSTICS_API_TOKEN.',503);
 let response:Response;try{response=await fetch(`${url.replace(/\/$/,'')}/diagnose`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({csv_base64:Buffer.from(bytes).toString('base64'),baseline:input.baseline}),signal:AbortSignal.timeout(20000),cache:'no-store'});}catch{throw new TicketError('The diagnostic service is unavailable. Your ticket is unchanged.',503);}
 if(!response.ok)throw new TicketError('Diagnostic service rejected the sample or is not configured.',400);
 const summary=await response.json();await saveDiagnostic(ctx,id,input.source_id,summary);return NextResponse.json({ok:true,summary});
}catch(error){return apiError(error);}}
