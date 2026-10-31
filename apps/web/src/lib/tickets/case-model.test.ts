import { describe,it,expect,afterEach } from 'vitest';
import { DemoStore,demoActor,demoOrganizations } from './demo-store';
import { createSchema,changeSchema } from './model';
import { derivePriority,recurrenceGroups,reportDraft,actionComparison,type RecordInput } from './case-model';
const customer=demoActor('customer');const support=demoActor('support_analyst');const engineer=demoActor('data_engineer');const csm=demoActor('customer_success');
let db:DemoStore|undefined;afterEach(()=>db?.close());
function setup(){db=new DemoStore(':memory:',false);const ticket=db.create(customer,createSchema.parse({organization_id:demoOrganizations[0].id,title:'Synthetic refresh failed',description:'The fictional refresh did not complete.',category:'Data Upload Failure'}));return {store:db,ticket};}
const restoration={restored_at:new Date().toISOString(),restoration_method:'Verified workaround applied',verification_result:'Approved sample accepted and refresh checked',closure_evidence:'Test run DEMO-01 passed'};
const investigation={hypothesis:'Possible missing mapping',reproduction_steps:'Upload approved synthetic fixture',confirmed_cause:'Missing required employee_id',evidence:'Diagnostic rule required_columns failed in run DEMO-01',component:'upload-validator',error_code:'MISSING_COLUMN',cause_category:'schema',checklist:[]};
describe('ITIL study-case behavior',()=>{
 it('derives priorities and requires a named lead for critical major incidents',()=>{
  const {store,ticket}=setup();expect(derivePriority('high','high')).toBe('critical');expect(derivePriority('low','high')).toBe('normal');
  const input:RecordInput={kind:'triage',status:'Recorded',data:{record_type:'incident',impact:'high',urgency:'high',business_impact:'Daily reporting unavailable',owner_id:support.id,major_incident:true,incident_lead:'',update_cadence_minutes:15}};
  expect(()=>store.saveRecord(support,ticket.id,input)).toThrow('incident lead');input.data.incident_lead='Alex Morgan';store.saveRecord(support,ticket.id,input);expect(store.detail(customer,ticket.id).ticket.priority).toBe('critical');
  expect(()=>store.saveRecord(customer,ticket.id,input)).toThrow('Internal');
 });
 it('restores and closes incidents independently from open Problem records',()=>{
  const {store,ticket}=setup();
  expect(()=>store.change(support,ticket.id,changeSchema.parse({status:'Resolved',resolution_summary:'Workaround restored service.'}))).toThrow('restoration');
  store.saveRecord(engineer,ticket.id,{kind:'restoration',status:'Verified',data:restoration});
  const problem=store.saveRecord(support,ticket.id,{kind:'problem',status:'Open',data:{title:'Find the permanent source mapping defect',incident_ids:[ticket.id],owner_id:engineer.id,hypothesis:'Export mapping',confirmed_cause:'',evidence:'',known_error:'',workaround:'Use the approved replacement export',component:'source-feed',error_code:'MISSING_COLUMN'}});
  store.change(engineer,ticket.id,changeSchema.parse({status:'Resolved',resolution_summary:'A verified workaround restored the refresh; cause investigation continues.'}));store.confirm(customer,ticket.id);
  expect(store.detail(customer,ticket.id).ticket.status).toBe('Closed');expect(store.records(support).find(record=>record.id===problem.id)?.status).toBe('Open');expect(store.records(customer,ticket.id)).toEqual([]);
 });
 it('keeps drafts and internal reviews private and publishes only unchanged approved customer reports',()=>{
  const {store,ticket}=setup();store.saveRecord(engineer,ticket.id,{kind:'restoration',status:'Verified',data:restoration});store.change(engineer,ticket.id,changeSchema.parse({status:'Resolved',resolution_summary:'Synthetic recovery verified.'}));
  store.saveRecord(engineer,ticket.id,{kind:'investigation',status:'Recorded',data:investigation});
  const draftText=reportDraft('customer',store.detail(support,ticket.id).ticket,store.records(support));expect(draftText).not.toContain('Diagnostic rule');
  const draft=store.saveRecord(support,ticket.id,{kind:'report',status:'Draft',data:{audience:'customer',content:draftText,review_notes:''}});
  expect(store.records(customer)).toHaveLength(0);
  expect(()=>store.saveRecord(engineer,ticket.id,{...draft,status:'Approved',data:{...draft.data,review_notes:'Reviewed'}})).toThrow('review');
  const approved=store.saveRecord(csm,ticket.id,{id:draft.id,version:draft.version,kind:'report',status:'Approved',data:{...draft.data,review_notes:'Reviewed source facts and removed private technical details'}});
  expect(()=>store.saveRecord(csm,ticket.id,{id:approved.id,version:approved.version,kind:'report',status:'Published',data:{...approved.data,content:'Changed after approval to another version'}})).toThrow('unchanged');
  const published=store.saveRecord(csm,ticket.id,{id:approved.id,version:approved.version,kind:'report',status:'Published',data:approved.data});expect(store.records(customer)[0].id).toBe(published.id);
  expect(()=>store.saveRecord(csm,ticket.id,{id:published.id,version:published.version,kind:'report',status:'Draft',data:published.data})).toThrow('immutable');
 });
 it('does not merge similar descriptions without matching confirmed causes and evidence',()=>{
  const {store,ticket}=setup();const second=store.create(customer,createSchema.parse({organization_id:ticket.organization_id,title:ticket.title,description:ticket.description,category:ticket.category}));
  store.saveRecord(engineer,ticket.id,{kind:'investigation',status:'Recorded',data:investigation});
  const other=store.saveRecord(engineer,second.id,{kind:'investigation',status:'Recorded',data:{...investigation,confirmed_cause:'Different independently verified cause'}});
  expect(recurrenceGroups(store.records(support),store.list(support),'2020-01-01')).toHaveLength(0);
  store.saveRecord(engineer,second.id,{id:other.id,version:other.version,kind:'investigation',status:'Recorded',data:investigation});
  expect(recurrenceGroups(store.records(support),store.list(support),'2020-01-01')[0].ticket_ids).toHaveLength(2);
 });
 it('requires sequential change approval and follow-up evidence before verification',()=>{
  const {store,ticket}=setup();const problem=store.saveRecord(support,ticket.id,{kind:'problem',status:'Open',data:{title:'Prevent repeated schema errors',incident_ids:[ticket.id],owner_id:engineer.id,hypothesis:'Export mismatch',confirmed_cause:'',evidence:'',known_error:'',workaround:'',component:'feed',error_code:'SCHEMA'}});
  const data={title:'Add schema preflight',problem_id:problem.id,owner_id:engineer.id,acceptance_criteria:'Invalid sample rejected before import',implementation_evidence:'',verification_evidence:'',baseline:'',review_date:'2026-11-15'};
  let action=store.saveRecord(support,ticket.id,{kind:'improvement',status:'Proposed',data});
  expect(()=>store.saveRecord(engineer,ticket.id,{id:action.id,version:action.version,kind:'improvement',status:'Approved',data})).toThrow('review');
  action=store.saveRecord(csm,ticket.id,{id:action.id,version:action.version,kind:'improvement',status:'Approved',data});
  action=store.saveRecord(engineer,ticket.id,{id:action.id,version:action.version,kind:'improvement',status:'In Progress',data});
  expect(()=>store.saveRecord(engineer,ticket.id,{id:action.id,version:action.version,kind:'improvement',status:'Implemented',data})).toThrow('Implementation');
  data.implementation_evidence='Preflight tests DEMO-02 passed';action=store.saveRecord(engineer,ticket.id,{id:action.id,version:action.version,kind:'improvement',status:'Implemented',data});
  data.baseline='Compare approved sample validation runs over two weeks';action=store.saveRecord(engineer,ticket.id,{id:action.id,version:action.version,kind:'improvement',status:'Monitoring',data});
  expect(()=>store.saveRecord(csm,ticket.id,{id:action.id,version:action.version,kind:'improvement',status:'Verified',data})).toThrow('Follow-up');
  data.verification_evidence='Reviewer observed explicit schema error for invalid fixture and valid fixture acceptance';action=store.saveRecord(csm,ticket.id,{id:action.id,version:action.version,kind:'improvement',status:'Verified',data});expect(action.status).toBe('Verified');
  expect(action.data.implemented_at).toBeTruthy();expect(action.data.verified_at).toBeTruthy();
  expect(actionComparison(action,store.records(support),store.list(support),new Date().toISOString())).toBeNull();
 });
 it('supports customer disputes without losing the previous resolution history',()=>{
  const {store,ticket}=setup();store.saveRecord(engineer,ticket.id,{kind:'restoration',status:'Verified',data:restoration});store.change(engineer,ticket.id,changeSchema.parse({status:'Resolved',resolution_summary:'Recovery initially verified.'}));store.dispute(customer,ticket.id,'The next scheduled synthetic refresh failed again.');expect(store.detail(customer,ticket.id).ticket.status).toBe('Investigating');expect(store.detail(customer,ticket.id).ticket.reopened_count).toBe(1);expect(()=>store.change(engineer,ticket.id,changeSchema.parse({status:'Resolved'}))).toThrow('restoration');
 });
});
