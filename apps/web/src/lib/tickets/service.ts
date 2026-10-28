import 'server-only';
import { cookies } from 'next/headers';
import { resolve } from 'node:path';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { requireUser } from '../auth';
import { DEMO_COOKIE, isDemoMode, parseDemoRole } from '../demo';
import { roles } from '../roles';
import { DemoStore, demoActor, demoOrganizations, demoPeople } from './demo-store';
import { TicketError, type Actor, type Attachment, type ChangeInput, type CreateInput, type Detail, type Entry, type Ticket } from './model';
import { validateEvidence } from './files';

let store: DemoStore | undefined;
function demoStore() { return store ??= new DemoStore(resolve(process.cwd(), '.data', 'supportops.sqlite')); }
export async function ticketContext() {
  if (isDemoMode()) {
    const role = parseDemoRole((await cookies()).get(DEMO_COOKIE)?.value);
    if (!role) throw new TicketError('Choose a demo role to continue.',401);
    return { actor: demoActor(role), client: null };
  }
  const { client, profile } = await requireUser();
  const { data, error } = await client.from('organization_memberships').select('organization_id').eq('user_id',profile.id);
  if(error) throw new TicketError('Unable to load organization access.',503);
  const role=roles.find(role=>role===profile.role)!;
  return { actor: { id:profile.id,name:profile.display_name,role,organizationIds:(data??[]).map(item=>item.organization_id) } as Actor,client };
}
export type Context=Awaited<ReturnType<typeof ticketContext>>;
function fail(error: {code?:string;message:string}|null) { if(error) throw new TicketError(error.code==='42501'?'Permission denied.':error.code==='P0002'?'Ticket not found.':'The operation could not be saved. Check your input and reload the ticket.',error.code==='42501'?403:error.code==='P0002'?404:400); }
export async function directory(ctx:Context) {
  if(!ctx.client)return {organizations:demoOrganizations.filter(org=>ctx.actor.role!=='customer'||ctx.actor.organizationIds.includes(org.id)),people:ctx.actor.role==='customer'?[]:demoPeople.filter(person=>person.role!=='customer')};
  const [orgs,people]=await Promise.all([ctx.client.from('organizations').select('id,name'),ctx.actor.role==='customer'?Promise.resolve({data:[],error:null}):ctx.client.from('profiles').select('id,display_name,role').neq('role','customer')]);
  fail(orgs.error);fail(people.error);return {organizations:orgs.data??[],people:people.data??[]};
}
function ticketRow(row: Record<string,unknown>):Ticket {
  const {organizations,...rest}=row;return {...rest,organization_name:(organizations as {name:string}|null)?.name??'Organization'} as Ticket;
}
export async function listTickets(ctx:Context) {
  if(!ctx.client)return demoStore().list(ctx.actor);
  const {data,error}=await ctx.client.from('tickets').select('*,organizations(name)').order('updated_at',{ascending:false});fail(error);return (data??[]).map(ticketRow);
}
export async function ticketDetail(ctx:Context,id:string):Promise<Detail> {
  if(!ctx.client)return demoStore().detail(ctx.actor,id);
  const {data,error}=await ctx.client.from('tickets').select('*,organizations(name)').eq('id',id).maybeSingle();fail(error);
  if(!data)throw new TicketError('Ticket not found.',404);
  const [updates,activity,attachments]=await Promise.all([
    ctx.client.from('ticket_updates').select('*').eq('ticket_id',id).order('created_at'),
    ctx.client.from('ticket_activity').select('*').eq('ticket_id',id).order('created_at'),
    ctx.client.from('ticket_attachments').select('*').eq('ticket_id',id).eq('ready',true).order('created_at'),
  ]);fail(updates.error);fail(activity.error);fail(attachments.error);
  return {ticket:ticketRow(data),updates:(updates.data??[]).map(row=>({...row,author_name:row.author_name??'Team member'})) as Entry[],activity:(activity.data??[]).map(row=>({...row,body:row.summary,author_name:row.author_name??'Team member'})) as Entry[],attachments:(attachments.data??[]) as Attachment[]};
}
export async function createTicket(ctx:Context,input:CreateInput) {
  if(!ctx.client)return demoStore().create(ctx.actor,input).id;
  const {data,error}=await ctx.client.rpc('create_ticket',{p_input:input});fail(error);return data as string;
}
export async function changeTicket(ctx:Context,id:string,input:ChangeInput) {
  if(!ctx.client){demoStore().change(ctx.actor,id,input);return;}
  const {error}=await ctx.client.rpc('change_ticket',{p_ticket:id,p_input:input});fail(error);
}
export async function addUpdate(ctx:Context,id:string,body:string,visibility:Entry['visibility']) {
  if(!ctx.client){demoStore().addUpdate(ctx.actor,id,body,visibility);return;}
  const {error}=await ctx.client.rpc('add_ticket_update',{p_ticket:id,p_body:body,p_visibility:visibility});fail(error);
}
export async function confirmTicket(ctx:Context,id:string) {
  if(!ctx.client){demoStore().confirm(ctx.actor,id);return;}
  const {error}=await ctx.client.rpc('confirm_ticket',{p_ticket:id});fail(error);
}
export async function attachFile(ctx:Context,id:string,file:File,visibility:Entry['visibility']) {
  const bytes=new Uint8Array(await file.arrayBuffer());const validated=validateEvidence(file.name,bytes);
  const metadata={filename:validated.filename,content_type:validated.contentType,size_bytes:bytes.length,visibility};
  if(!ctx.client){demoStore().attach(ctx.actor,id,metadata,bytes);return;}
  const secret=process.env.SUPABASE_SECRET_KEY;
  if(!secret)throw new TicketError('Attachment storage needs the server-only SUPABASE_SECRET_KEY configuration.',503);
  const {data,error}=await ctx.client.rpc('reserve_ticket_attachment',{p_ticket:id,p_input:metadata});fail(error);
  const reservation=data as {id:string;object_path:string};
  const admin=createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  try {
    const uploaded=await admin.storage.from('ticket-evidence').upload(reservation.object_path,bytes,{contentType:metadata.content_type,upsert:false});
    if(uploaded.error)throw new TicketError('Evidence upload failed. Please try again.',503);
    const finished=await ctx.client.rpc('finish_ticket_attachment',{p_attachment:reservation.id});fail(finished.error);
  } catch(error) {
    await admin.storage.from('ticket-evidence').remove([reservation.object_path]);
    await ctx.client.rpc('cancel_ticket_attachment',{p_attachment:reservation.id});throw error;
  }
}
export async function downloadFile(ctx:Context,id:string,fileId:string) {
  if(!ctx.client)return demoStore().download(ctx.actor,id,fileId);
  const detail=await ticketDetail(ctx,id);const file=detail.attachments.find(file=>file.id===fileId);
  if(!file)throw new TicketError('Attachment not found.',404);
  const {data,error}=await ctx.client.storage.from('ticket-evidence').createSignedUrl(file.object_path!,60,{download:file.filename});fail(error);
  return {file,url:data!.signedUrl};
}
