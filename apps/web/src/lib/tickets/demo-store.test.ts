import { describe,it,expect,afterEach } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DemoStore,demoActor,demoOrganizations } from './demo-store';
import { createSchema, changeSchema, updateSchema } from './model';
import { validateEvidence,MAX_FILE_SIZE } from './files';
const customer=demoActor('customer');const analyst=demoActor('support_analyst');
const input=createSchema.parse({organization_id:demoOrganizations[0].id,title:'Synthetic employee upload failed',description:'The fictional daily employee upload failed validation.',category:'Data Upload Failure'});
const stores:DemoStore[]=[];const folders:string[]=[];
function db(){const store=new DemoStore(':memory:',false);stores.push(store);return store;}
afterEach(()=>{for(const store of stores.splice(0))store.close();for(const folder of folders.splice(0)){if(!folder.startsWith(join(tmpdir(),'supportops-')))throw new Error('Unexpected test cleanup path');rmSync(folder,{recursive:true,force:true});}});
describe('persistent ticket lifecycle and authorization',()=>{
 it('persists a shared investigation, filters private messages, reopens and confirms resolution',()=>{
  const folder=mkdtempSync(join(tmpdir(),'supportops-'));folders.push(folder);const path=join(folder,'test.sqlite');let store=new DemoStore(path,false);stores.push(store);
  const ticket=store.create(customer,input);store.change(analyst,ticket.id,changeSchema.parse({status:'Investigating',explanation:'Checking the approved sample.'}));
  store.addUpdate(analyst,ticket.id,'PRIVATE: missing-column hypothesis','internal');store.addUpdate(demoActor('customer_success'),ticket.id,'Our Data Engineering team is reviewing the upload.','public');
  store.change(analyst,ticket.id,changeSchema.parse({assigned_team:'Data Engineering',assigned_to:demoActor('data_engineer').id}));
  store.change(demoActor('data_engineer'),ticket.id,changeSchema.parse({status:'Fix in Progress'}));
  store.close();stores.pop();store=new DemoStore(path,false);stores.push(store);
  const view=store.detail(customer,ticket.id);expect(view.ticket.status).toBe('Fix in Progress');expect(JSON.stringify(view)).not.toContain('PRIVATE');expect(view.updates).toHaveLength(1);
  expect(store.detail(analyst,ticket.id).updates).toHaveLength(2);
  store.saveRecord(demoActor('data_engineer'),ticket.id,{kind:'restoration',status:'Verified',data:{restored_at:new Date().toISOString(),restoration_method:'Corrected synthetic mapping',verification_result:'Synthetic upload accepted',closure_evidence:'Approved fixture passed'}});
  store.change(demoActor('data_engineer'),ticket.id,changeSchema.parse({status:'Resolved',resolution_summary:'The synthetic schema mapping has been corrected.'}));
  store.change(analyst,ticket.id,changeSchema.parse({status:'Investigating'}));expect(store.detail(customer,ticket.id).ticket.reopened_count).toBe(1);
  store.saveRecord(demoActor('data_engineer'),ticket.id,{kind:'restoration',status:'Verified',data:{restored_at:new Date().toISOString(),restoration_method:'Repeated recovery check',verification_result:'Synthetic refresh accepted again',closure_evidence:'Second approved fixture passed'}});
  store.change(analyst,ticket.id,changeSchema.parse({status:'Resolved'}));store.confirm(customer,ticket.id);
  expect(store.detail(customer,ticket.id).ticket.status).toBe('Closed');expect(store.detail(customer,ticket.id).activity.filter(event=>event.event_type==='status')).toHaveLength(6);
  expect(()=>store.addUpdate(customer,ticket.id,'After closure','public')).toThrow('closed');
 });
 it('blocks another organization and rejects customer privilege escalation',()=>{
  const store=db();const ticket=store.create(customer,input);const other={...customer,organizationIds:[demoOrganizations[1].id]};
  expect(store.list(other)).toHaveLength(0);expect(()=>store.detail(other,ticket.id)).toThrow('not found');
  expect(()=>store.create(customer,{...input,organization_id:demoOrganizations[1].id})).toThrow('access denied');
  expect(()=>store.change(customer,ticket.id,changeSchema.parse({status:'Investigating'}))).toThrow('cannot change');
  expect(()=>store.addUpdate(customer,ticket.id,'Private','internal')).toThrow('public replies');
  expect(()=>createSchema.parse({...input,role:'support_analyst'})).toThrow();
 });
 it('enforces role capabilities and rolls back rejected status changes',()=>{
  const store=db();const ticket=store.create(customer,input);
  expect(()=>store.change(demoActor('customer_success'),ticket.id,changeSchema.parse({status:'Investigating'}))).toThrow('cannot change');
  expect(()=>store.change(demoActor('data_engineer'),ticket.id,changeSchema.parse({assigned_team:'Data Engineering'}))).toThrow('Only Support');
  expect(()=>store.change(analyst,ticket.id,changeSchema.parse({status:'Resolved'}))).toThrow('resolution summary');
  expect(store.detail(analyst,ticket.id).ticket.status).toBe('Reported');expect(store.detail(analyst,ticket.id).activity).toHaveLength(1);
  expect(()=>store.change(analyst,ticket.id,changeSchema.parse({assigned_to:customer.id}))).toThrow('internal employee');
 });
 it('protects internal evidence at download time as well as in lists',()=>{
  const store=db();const ticket=store.create(customer,input);const file=store.attach(analyst,ticket.id,{filename:'synthetic.txt',content_type:'text/plain',size_bytes:4,visibility:'internal'},Buffer.from('test'));
  expect(store.detail(customer,ticket.id).attachments).toHaveLength(0);expect(()=>store.download(customer,ticket.id,file.id)).toThrow('not found');expect(Buffer.from(store.download(analyst,ticket.id,file.id).bytes).toString()).toBe('test');
 });
});
describe('request and evidence validation',()=>{
 it('rejects empty messages, illegal statuses and oversized or disguised evidence',()=>{
  expect(()=>updateSchema.parse({body:'   ',visibility:'public'})).toThrow();expect(()=>changeSchema.parse({status:'Nearly done'})).toThrow();
  expect(()=>validateEvidence('image.png',Buffer.from('<script>alert(1)</script>'))).toThrow('Unsupported');
  expect(()=>validateEvidence('log.txt',Buffer.from('<html>test</html>'))).toThrow('plain');
  expect(()=>validateEvidence('sample.csv',new Uint8Array(MAX_FILE_SIZE+1))).toThrow('5 MB');
  expect(()=>validateEvidence('empty.txt',new Uint8Array())).toThrow();
  expect(validateEvidence('sample.csv',Buffer.from('employee_id,status\nDEMO-1,active')).contentType).toBe('text/csv');
 });
});
