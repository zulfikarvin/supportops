import 'server-only';
import { randomUUID } from 'node:crypto';
import { demoStore, ticketDetail, directory, listTickets, type Context } from './service';
import { dataSchemas, validateRecord, type CaseRecord, type RecordInput, reportDraft } from './case-model';
import { TicketError } from './model';
export async function records(ctx:Context,ticketId?:string):Promise<CaseRecord[]>{
 if(!ctx.client)return demoStore().records(ctx.actor,ticketId);
 if(ticketId)await ticketDetail(ctx,ticketId);
 let query=ctx.client.from('case_records').select('*').order('updated_at',{ascending:false});if(ticketId)query=query.eq('ticket_id',ticketId);
 const {data,error}=await query;if(error)throw new TicketError('Unable to load case records. Apply the study-case migration.',503);return data as CaseRecord[];
}
export async function analyticsWindow(days:number){return new Date(Date.now()-days*86400000).toISOString();}
export async function versionHistory(ctx:Context,ticketId:string):Promise<CaseRecord[]>{
 if(ctx.actor.role==='customer')throw new TicketError('Internal history is private.',403);await ticketDetail(ctx,ticketId);
 if(!ctx.client)return demoStore().versions(ctx.actor,ticketId);
 const ids=(await records(ctx,ticketId)).map(record=>record.id);if(!ids.length)return [];
 const {data,error}=await ctx.client.from('case_record_versions').select('snapshot').in('record_id',ids).order('created_at',{ascending:false});if(error)throw new TicketError('History unavailable.',503);return (data??[]).map(row=>row.snapshot as CaseRecord);
}
export async function logReportDownload(ctx:Context,id:string){if(!ctx.client){demoStore().reportAccess(ctx.actor,id);return;}const {error}=await ctx.client.rpc('log_report_download',{p_record:id});if(error)throw new TicketError('Unable to authorize report download.',403);}
export async function saveRecord(ctx:Context,ticketId:string,input:RecordInput){
 const detail=await ticketDetail(ctx,ticketId);const all=await records(ctx);const {people}=await directory(ctx);
 input=validateRecord(ctx.actor,input,detail.ticket,all.find(record=>record.id===input.id),all,people);
 if(input.kind==='problem'){const visible=await listTickets(ctx);if((input.data.incident_ids as string[]).some(id=>!visible.some(ticket=>ticket.id===id)))throw new TicketError('Linked incident unavailable.');}
 if(!ctx.client)return demoStore().saveRecord(ctx.actor,ticketId,input);
 const {data,error}=await ctx.client.rpc('save_case_record',{p_ticket:ticketId,p_input:input});if(error)throw new TicketError('Record could not be saved. Check permissions, state and version.',400);return data as CaseRecord;
}
export async function draftReports(ctx:Context,ticketId:string){
 const {ticket}=await ticketDetail(ctx,ticketId);const existing=await records(ctx,ticketId);
 return Promise.all((['customer','internal']as const).map(audience=>saveRecord(ctx,ticketId,{kind:'report',status:'Draft',data:{audience,content:reportDraft(audience,ticket,existing),review_notes:''}})));
}
export async function saveDiagnostic(ctx:Context,ticketId:string,sourceId:string,summary:Record<string,unknown>){
 const data=dataSchemas.diagnostic.parse({source_id:sourceId,summary});
 if(!ctx.client)return demoStore().saveRecord(ctx.actor,ticketId,{kind:'diagnostic',status:'Completed',data},true);
 // SQL only accepts sanitized check results; there is no customer execute grant.
 const {error}=await ctx.client.rpc('record_diagnostic',{p_ticket:ticketId,p_source:sourceId,p_summary:summary,p_run:randomUUID()});if(error)throw new TicketError('Unable to save diagnostic summary.',400);
}
