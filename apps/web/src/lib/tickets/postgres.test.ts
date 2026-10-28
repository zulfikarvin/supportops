import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
let db:PGlite;
const customer='20000000-0000-4000-8000-000000000001';
const analyst='20000000-0000-4000-8000-000000000002';
const engineer='20000000-0000-4000-8000-000000000003';
const csm='20000000-0000-4000-8000-000000000004';
const atlas='10000000-0000-4000-8000-000000000001';
const northstar='10000000-0000-4000-8000-000000000002';
async function act(id:string){await db.exec('reset role; set role authenticated;');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
async function create(org=atlas){return (await db.query<{id:string}>(`select public.create_ticket($1::jsonb) id`,[JSON.stringify({organization_id:org,title:'Synthetic upload failed',description:'A fictional employee upload has failed.',category:'Data Upload Failure'})])).rows[0].id;}
beforeAll(async()=>{
 db=new PGlite();
 // Supabase-specific Auth/Storage surfaces are stubbed; PostgreSQL/RLS/RPCs are real.
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema public,auth,storage to authenticated;
 grant select on storage.objects to authenticated;`);
 const root=resolve(process.cwd(),'../../supabase');
 for(const file of ['migrations/202610270001_foundation.sql','seed.sql','migrations/202610280001_ticket_operations.sql'])await db.exec(readFileSync(resolve(root,file),'utf8'));
 await db.exec(`insert into auth.users values ('${customer}'),('${analyst}'),('${engineer}'),('${csm}');
 insert into public.profiles(id,display_name,role) values ('${customer}','Atlas customer','customer'),('${analyst}','Analyst','support_analyst'),('${engineer}','Engineer','data_engineer'),('${csm}','CSM','customer_success');
 insert into public.organization_memberships(organization_id,user_id) values ('${atlas}','${customer}');`);
},60000);
afterAll(async()=>{await db?.close();});
describe('PostgreSQL migrations, RPC permissions and RLS',()=>{
 it('isolates organization reads and prevents self-promotion or direct ticket writes',async()=>{
  await act(customer);const id=await create();
  await expect(create(northstar)).rejects.toThrow('access denied');
  await expect(db.query("update public.profiles set role='support_analyst' where id=$1",[customer])).rejects.toThrow('permission denied');
  await expect(db.query("update public.tickets set status='Resolved' where id=$1",[id])).rejects.toThrow('permission denied');
  await db.exec('reset role');await db.query('update public.tickets set organization_id=$1 where id=$2',[northstar,id]);await act(customer);
  expect((await db.query('select id from public.tickets where id=$1',[id])).rows).toHaveLength(0);
  await expect(db.query("select public.add_ticket_update($1,'Unauthorized','public')",[id])).rejects.toThrow('not found');
 });
 it('persists status history and separates public updates from private notes',async()=>{
  await act(customer);const id=await create();
  await expect(db.query("select public.add_ticket_update($1,'Customer private','internal')",[id])).rejects.toThrow('denied');
  await act(analyst);
  await db.query('select public.change_ticket($1,$2::jsonb)',[id,JSON.stringify({status:'Investigating',assigned_team:'Data Engineering',assigned_to:engineer})]);
  await db.query("select public.add_ticket_update($1,'SECRET technical finding','internal')",[id]);
  await act(csm);await db.query("select public.add_ticket_update($1,'We are investigating the upload.','public')",[id]);
  await expect(db.query('select public.change_ticket($1,$2::jsonb)',[id,JSON.stringify({status:'Resolved'})])).rejects.toThrow('permission denied');
  await act(customer);
  const updates=await db.query<{body:string}>('select body from public.ticket_updates where ticket_id=$1',[id]);
  expect(updates.rows).toEqual([{body:'We are investigating the upload.'}]);
  const events=await db.query<{previous_status:string;new_status:string}>('select previous_status,new_status from public.ticket_activity where ticket_id=$1 and event_type=\'status\'',[id]);
  expect(events.rows).toEqual([{previous_status:'Reported',new_status:'Investigating'}]);
  await expect(db.query('select * from public.notification_events')).rejects.toThrow('permission denied');
 });
 it('requires a resolution, supports reopening, and restricts closure to the customer',async()=>{
  await act(customer);const id=await create();await act(engineer);
  await expect(db.query('select public.change_ticket($1,$2::jsonb)',[id,JSON.stringify({assigned_team:'Data Engineering'})])).rejects.toThrow('permission denied');
  await expect(db.query('select public.change_ticket($1,$2::jsonb)',[id,JSON.stringify({status:'Resolved'})])).rejects.toThrow('summary required');
  await db.query('select public.change_ticket($1,$2::jsonb)',[id,JSON.stringify({status:'Resolved',resolution_summary:'Synthetic mapping corrected.'})]);
  await db.query('select public.change_ticket($1,$2::jsonb)',[id,JSON.stringify({status:'Investigating'})]);
  await db.query('select public.change_ticket($1,$2::jsonb)',[id,JSON.stringify({status:'Resolved'})]);
  await expect(db.query('select public.confirm_ticket($1)',[id])).rejects.toThrow('Customer confirmation');
  await act(customer);await db.query('select public.confirm_ticket($1)',[id]);
  expect((await db.query<{status:string;reopened_count:number}>('select status,reopened_count from public.tickets where id=$1',[id])).rows[0]).toEqual({status:'Closed',reopened_count:1});
 });
 it('reserves private evidence without exposing it or allowing client storage writes',async()=>{
  await act(customer);const id=await create();await act(analyst);
  const {rows}=await db.query<{reservation:{id:string;object_path:string}}>('select public.reserve_ticket_attachment($1,$2::jsonb) reservation',[id,JSON.stringify({filename:'synthetic.txt',content_type:'text/plain',size_bytes:4,visibility:'internal'})]);
  const file=rows[0].reservation;
  await expect(db.query('select public.finish_ticket_attachment($1)',[file.id])).rejects.toThrow('not uploaded');
  await expect(db.query("insert into storage.objects(bucket_id,name) values ('ticket-evidence',$1)",[file.object_path])).rejects.toThrow('permission denied');
  await db.exec('reset role');await db.query("insert into storage.objects(bucket_id,name) values ('ticket-evidence',$1)",[file.object_path]);await act(analyst);
  await db.query('select public.finish_ticket_attachment($1)',[file.id]);
  expect((await db.query('select id from storage.objects where name=$1',[file.object_path])).rows).toHaveLength(1);
  await act(customer);expect((await db.query('select id from public.ticket_attachments where id=$1',[file.id])).rows).toHaveLength(0);
  expect((await db.query('select id from storage.objects where name=$1',[file.object_path])).rows).toHaveLength(0);
 });
 it('records sanitized unique notification events atomically',async()=>{
  await act(customer);const id=await create();await act(analyst);await db.query("select public.add_ticket_update($1,'PRIVATE_PAYLOAD_MUST_NOT_LEAK','public')",[id]);
  await db.exec('reset role');const events=await db.query<{payload:unknown;idempotency_key:string}>('select payload,idempotency_key from public.notification_events where ticket_id=$1',[id]);
  expect(events.rows).toHaveLength(2);expect(JSON.stringify(events.rows)).not.toContain('PRIVATE_PAYLOAD_MUST_NOT_LEAK');
  expect(new Set(events.rows.map(row=>row.idempotency_key)).size).toBe(2);
  await expect(db.query('insert into public.notification_events(ticket_id,created_by,event_type,idempotency_key,payload) select ticket_id,created_by,event_type,idempotency_key,payload from public.notification_events where ticket_id=$1 limit 1',[id])).rejects.toThrow('unique');
 });
});
