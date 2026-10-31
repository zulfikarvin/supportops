import { z } from 'zod';
import { TicketError, type Actor, type Ticket } from './model';
export const levels = ['low','medium','high'] as const;
const text=z.string().trim().max(12000);
const required=text.min(3);
export const kinds=['triage','investigation','restoration','report','problem','improvement','diagnostic'] as const;
export type CaseKind=typeof kinds[number];
export type CaseRecord={id:string;ticket_id:string;kind:CaseKind;status:string;version:number;data:Record<string,unknown>;created_by:string;author_name:string;reviewed_by:string|null;created_at:string;updated_at:string};
export const recordSchema=z.object({
 id:z.uuid().optional(),kind:z.enum(kinds),status:z.string().max(30).default('Draft'),version:z.number().int().min(1).optional(),data:z.record(z.string(),z.unknown()),
}).strict();
export type RecordInput=z.infer<typeof recordSchema>;
export const dataSchemas={
 triage:z.object({record_type:z.enum(['incident','service_request']),impact:z.enum(levels),urgency:z.enum(levels),business_impact:required,owner_id:z.uuid(),major_incident:z.boolean(),incident_lead:z.string().max(120).default(''),update_cadence_minutes:z.number().int().min(5).max(1440).default(30)}).strict(),
 investigation:z.object({hypothesis:text,reproduction_steps:text,confirmed_cause:text,evidence:text,component:text.max(200),error_code:text.max(200),cause_category:text.max(200),checklist:z.array(z.object({label:required,done:z.boolean()})).max(20)}).strict(),
 restoration:z.object({restored_at:z.iso.datetime({offset:true}),restoration_method:required,verification_result:required,closure_evidence:required,reopen_count:z.number().int().min(0).optional()}).strict(),
 report:z.object({audience:z.enum(['customer','internal']),content:z.string().trim().min(20).max(40000),review_notes:text.default('')}).strict(),
 problem:z.object({title:required,incident_ids:z.array(z.uuid()).min(1).max(100),owner_id:z.uuid(),hypothesis:text,confirmed_cause:text,evidence:text,known_error:text,workaround:text,component:text.max(200),error_code:text.max(200)}).strict(),
 improvement:z.object({title:required,problem_id:z.uuid(),owner_id:z.uuid(),acceptance_criteria:required,implementation_evidence:text,verification_evidence:text,baseline:text,review_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),implemented_at:z.iso.datetime({offset:true}).optional(),verified_at:z.iso.datetime({offset:true}).optional()}).strict(),
 diagnostic:z.object({source_id:z.string().max(200),summary:z.record(z.string(),z.unknown())}).strict(),
};
export function derivePriority(impact:typeof levels[number],urgency:typeof levels[number]){
 const matrix={high:{high:'critical',medium:'high',low:'normal'},medium:{high:'high',medium:'normal',low:'low'},low:{high:'normal',medium:'low',low:'low'}} as const;
 return matrix[impact][urgency];
}
export function canReadRecord(actor:Actor,record:CaseRecord,ticket:Ticket){return actor.role!=='customer'||(actor.organizationIds.includes(ticket.organization_id)&&record.kind==='report'&&record.status==='Published'&&record.data.audience==='customer');}
export function validateRecord(actor:Actor,input:RecordInput,ticket:Ticket,previous:CaseRecord|undefined,all:CaseRecord[],people:{id:string}[]){
 if(actor.role==='customer')throw new TicketError('Internal workspace access required.',403);
 const parsed:Record<string,unknown>=dataSchemas[input.kind].parse(input.data);input={...input,data:parsed};
 if(previous&&(previous.kind!==input.kind||previous.ticket_id!==ticket.id))throw new TicketError('Record not found.',404);
 if(previous&&input.version!==previous.version)throw new TicketError('This record changed. Reload before saving.',409);
 if(!previous&&input.id)throw new TicketError('Record not found.',404);
 if(input.kind==='diagnostic')throw new TicketError('Diagnostic records are created by the diagnostic runner.',403);
 if(['triage','investigation'].includes(input.kind)&&input.status!=='Recorded')throw new TicketError('Invalid case record state.');
 if(input.kind==='restoration'&&input.status!=='Verified')throw new TicketError('Verified recovery is required.');
 if(['triage'].includes(input.kind)&&actor.role!=='support_analyst')throw new TicketError('Only Support can triage incidents.',403);
 if(['investigation','restoration'].includes(input.kind)&&actor.role==='customer_success')throw new TicketError('A technical role is required.',403);
 if('owner_id'in parsed&&!people.some(person=>person.id===parsed.owner_id))throw new TicketError('Choose an internal owner.');
 if(input.kind==='triage'){
  const data=parsed as z.infer<typeof dataSchemas.triage>;
  if(data.record_type==='service_request'&&data.major_incident)throw new TicketError('Planned service requests are not major incidents.');
  if(data.record_type==='incident'&&(data.major_incident||derivePriority(data.impact,data.urgency)==='critical')&&(!data.incident_lead.trim()))throw new TicketError('Major incidents require an incident lead.');
 }
 if(input.kind==='investigation'||input.kind==='problem'){
  if(parsed.confirmed_cause&&!String(parsed.evidence).trim())throw new TicketError('Confirmed causes require supporting evidence.');
 }
 if(input.kind==='restoration'&&new Date(String(parsed.restored_at))>new Date())throw new TicketError('Restoration time cannot be in the future.');
 if(input.kind==='report'){
  if(!['Draft','Approved','Published'].includes(input.status))throw new TicketError('Invalid report state.');
  if(!previous&&input.status!=='Draft')throw new TicketError('Reports must start as drafts.');
  if(previous?.status==='Published')throw new TicketError('Published report versions are immutable. Create a new draft.');
  if(input.status==='Approved'){
   if(!['support_analyst','customer_success'].includes(actor.role))throw new TicketError('Support or CSM review is required.',403);
   if(previous?.status!=='Draft'||!String(parsed.review_notes).trim())throw new TicketError('Review the draft and record a redaction/evidence review.');
  }
  if(input.status==='Published'){
   if(!['support_analyst','customer_success'].includes(actor.role))throw new TicketError('Publishing requires Support or CSM.',403);
   if(previous?.status!=='Approved'||previous.data.content!==parsed.content||previous.data.audience!==parsed.audience)throw new TicketError('Publish the approved content unchanged.');
   if(parsed.audience!=='customer')throw new TicketError('Internal reports remain confidential.');
  }
  if(previous?.status==='Approved'&&input.status==='Approved')throw new TicketError('Return edits to Draft for a new review.');
  if(!['Resolved','Closed'].includes(ticket.status))throw new TicketError('Reports require a resolved incident.');
 }
 if(input.kind==='problem'){
  if(!['Open','Investigating','Known Error','Resolved'].includes(input.status))throw new TicketError('Invalid Problem state.');
  if(input.status==='Known Error'&&(!parsed.confirmed_cause||!parsed.workaround))throw new TicketError('Known errors require a confirmed cause and workaround.');
 }
 if(input.kind==='improvement'){
  const states=['Proposed','Approved','In Progress','Implemented','Monitoring','Verified'];
  const from=previous?states.indexOf(previous.status):-1;const to=states.indexOf(input.status);
  if(to<0||(!previous&&to!==0)||(previous&&to!==from&&to!==from+1))throw new TicketError('Follow the improvement approval and verification sequence.');
  if(previous?.status==='Verified')throw new TicketError('Verified actions are immutable.');
  if(['Approved','Verified'].includes(input.status)&&!['support_analyst','customer_success'].includes(actor.role))throw new TicketError('Support or CSM review is required.',403);
  if(['In Progress','Implemented','Monitoring'].includes(input.status)&&actor.id!==parsed.owner_id&&actor.role!=='support_analyst')throw new TicketError('Only the owner or Support can implement this action.',403);
  if(['Implemented','Monitoring','Verified'].includes(input.status)&&!parsed.implementation_evidence)throw new TicketError('Implementation evidence is required.');
  if(['Monitoring','Verified'].includes(input.status)&&!parsed.baseline)throw new TicketError('Record a baseline before monitoring.');
  if(input.status==='Verified'&&!parsed.verification_evidence)throw new TicketError('Follow-up verification evidence is required.');
  if(!all.some(record=>record.id===parsed.problem_id&&record.kind==='problem'))throw new TicketError('Link an existing Problem record.');
 }
 return input;
}
export function reportDraft(audience:'customer'|'internal',ticket:Ticket,records:CaseRecord[]){
 const restoration=records.find(record=>record.kind==='restoration')?.data;
 const investigation=records.find(record=>record.kind==='investigation')?.data;
 const base=[`Resolution report — SUP-${ticket.number}`,`Organization: ${ticket.organization_name}`,`Reported: ${ticket.created_at}`,`Resolved: ${ticket.resolved_at??'Not recorded'}`,`Issue: ${ticket.title}`,`Resolution: ${ticket.resolution_summary??'Not recorded'}`,`Recovery verification: ${restoration?.verification_result??'Not recorded'}`,`Restoration method: ${restoration?.restoration_method??'Not recorded'}`];
 if(audience==='customer')base.push('Cause: Not determined in this customer draft. Include only reviewed, customer-safe verified facts.','Follow-up: Contact support if the symptoms recur.');
 else base.push(`Hypothesis: ${investigation?.hypothesis??'Not recorded'}`,`Confirmed cause: ${investigation?.confirmed_cause||'Undetermined'}`,`Evidence: ${investigation?.evidence??'Not recorded'}`,`Reproduction: ${investigation?.reproduction_steps??'Not recorded'}`,'Preventive actions: Review linked Problem and improvement records.');
 return base.join('\n\n');
}
export function recurrenceGroups(records:CaseRecord[],tickets:Ticket[],since:string){
 const groups=new Map<string,{key:string;ticket_ids:string[];cause:string;component:string;error_code:string}>();
 for(const record of records){if(record.kind!=='investigation'||!record.data.confirmed_cause||!record.data.evidence||!record.data.component||!record.data.error_code||!record.data.cause_category)continue;
  const ticket=tickets.find(ticket=>ticket.id===record.ticket_id&&ticket.record_type!=='service_request'&&ticket.created_at>=since);if(!ticket)continue;
  const key=[ticket.category,record.data.cause_category,record.data.confirmed_cause,record.data.component,record.data.error_code].map(value=>String(value).trim().toLowerCase()).join('|');
  const group=groups.get(key)??{key,ticket_ids:[],cause:String(record.data.confirmed_cause),component:String(record.data.component),error_code:String(record.data.error_code)};
  if(!group.ticket_ids.includes(ticket.id))group.ticket_ids.push(ticket.id);groups.set(key,group);
 }
 return [...groups.values()].filter(group=>group.ticket_ids.length>=2);
}
export function actionComparison(action:CaseRecord,records:CaseRecord[],tickets:Ticket[],now:string){
 const problem=records.find(record=>record.id===action.data.problem_id&&record.kind==='problem');
 if(!action.data.implemented_at||!problem?.data.confirmed_cause||!problem.data.evidence||!problem.data.component||!problem.data.error_code)return null;
 const implemented=new Date(String(action.data.implemented_at)).getTime();const span=7*86400000;const end=Math.min(new Date(now).getTime(),implemented+span);
 const ids=new Set(records.filter(record=>record.kind==='investigation'&&record.data.confirmed_cause===problem.data.confirmed_cause&&record.data.component===problem.data.component&&record.data.error_code===problem.data.error_code&&record.data.evidence).map(record=>record.ticket_id));
 const matches=tickets.filter(ticket=>ticket.record_type!=='service_request'&&ids.has(ticket.id));
 return {before:matches.filter(ticket=>{const time=new Date(ticket.created_at).getTime();return time>=implemented-span&&time<implemented;}).length,after:matches.filter(ticket=>{const time=new Date(ticket.created_at).getTime();return time>=implemented&&time<=end;}).length,complete:new Date(now).getTime()>=implemented+span};
}
