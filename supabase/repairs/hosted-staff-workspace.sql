-- Run in Supabase SQL Editor for the same project used by Vercel.
-- Transactional and safe to run again. Existing accounts and tickets are preserved.
begin;
do $repair$
begin
 if to_regclass('public.profiles') is null or to_regclass('public.tickets') is null then
  raise exception 'Foundation tables are missing. Check that SQL Editor uses the same Supabase project as Vercel, then apply 202610270001_foundation.sql first.';
 end if;
 if to_regprocedure('public.change_ticket(uuid,jsonb)') is null then
  if to_regprocedure('public.actor_role()') is not null
     or exists(select 1 from information_schema.columns where table_schema='public' and table_name='ticket_attachments' and column_name='ready') then
   raise exception 'Ticket operations are partially installed. Stop and inspect the schema before applying migrations.';
  end if;
  execute $operations$
-- Phase 2. Browser table writes remain denied; mutations use authorized RPCs.
alter table public.ticket_updates add column author_name text not null default 'Team member';
alter table public.ticket_activity add column author_name text not null default 'Team member';
alter table public.ticket_attachments add column ready boolean not null default false;
create function public.actor_role() returns public.app_role language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=auth.uid();
$$;
create function public.emit_ticket_event(p_ticket uuid,p_type text,p_summary text,p_visibility public.visibility default 'public',p_previous public.ticket_status default null,p_new public.ticket_status default null,p_notification text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare event_id uuid:=gen_random_uuid(); actor_name text;
begin
 select display_name into actor_name from public.profiles where id=auth.uid();
 insert into public.ticket_activity(id,ticket_id,created_by,visibility,event_type,summary,previous_status,new_status,author_name)
 values(event_id,p_ticket,auth.uid(),p_visibility,p_type,p_summary,p_previous,p_new,actor_name);
 if p_notification is not null then
  insert into public.notification_events(ticket_id,created_by,event_type,idempotency_key,payload)
  select p_ticket,auth.uid(),p_notification,p_notification||':'||event_id::text,
   jsonb_build_object('ticket_id',p_ticket,'organization_id',organization_id,'event_type',p_notification,'actor_id',auth.uid())
  from public.tickets where id=p_ticket;
 end if;
 return event_id;
end; $$;

create function public.create_ticket(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid; org uuid:=(p_input->>'organization_id')::uuid;
begin
 if public.actor_role() is distinct from 'customer'::public.app_role or not exists(select 1 from public.organization_memberships where user_id=auth.uid() and organization_id=org) then raise exception 'Organization access denied' using errcode='42501'; end if;
 if jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('organization_id','title','description','category','reported_urgency','first_occurred_at','users_affected','error_message')) then raise exception 'Invalid input'; end if;
 insert into public.tickets(organization_id,created_by,title,description,category,reported_urgency,first_occurred_at,users_affected,error_message)
 values(org,auth.uid(),btrim(p_input->>'title'),btrim(p_input->>'description'),(p_input->>'category')::public.ticket_category,coalesce(p_input->>'reported_urgency','normal'),(p_input->>'first_occurred_at')::timestamptz,(p_input->>'users_affected')::integer,p_input->>'error_message') returning id into new_id;
 perform public.emit_ticket_event(new_id,'created','Issue reported.','public',null,null,'ticket.created');
 return new_id;
end; $$;

create function public.change_ticket(p_ticket uuid,p_input jsonb) returns void language plpgsql security definer set search_path='' as $$
declare t public.tickets; actor public.app_role:=public.actor_role(); next_status public.ticket_status; next_team text; next_assignee uuid; next_priority text; resolution text; explanation text;
begin
 if actor is null or actor in ('customer','customer_success') then raise exception 'Investigation permission denied' using errcode='42501'; end if;
 if jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('status','priority','assigned_team','assigned_to','resolution_summary','explanation')) or not (p_input ?| array['status','priority','assigned_team','assigned_to','resolution_summary']) then raise exception 'Invalid input'; end if;
 if actor<>'support_analyst' and (p_input ?| array['priority','assigned_team','assigned_to']) then raise exception 'Triage permission denied' using errcode='42501'; end if;
 select * into t from public.tickets where id=p_ticket for update;
 if not found then raise exception 'Ticket not found' using errcode='P0002'; end if;
 if t.status='Closed' then raise exception 'Ticket is closed'; end if;
 next_status:=case when p_input?'status' then (p_input->>'status')::public.ticket_status else t.status end;
 if next_status is null or next_status='Closed' then raise exception 'Customer confirmation required for closure'; end if;
 if next_status='Triaged' and actor<>'support_analyst' then raise exception 'Triage permission denied' using errcode='42501'; end if;
 if t.status='Resolved' and next_status not in ('Resolved','Investigating') then raise exception 'Reopen as Investigating'; end if;
 next_team:=case when p_input?'assigned_team' then p_input->>'assigned_team' else t.assigned_team end;
 next_assignee:=case when p_input?'assigned_to' then (p_input->>'assigned_to')::uuid else t.assigned_to end;
 next_priority:=case when p_input?'priority' then p_input->>'priority' else t.priority end;
 if next_assignee is not null and not exists(select 1 from public.profiles where id=next_assignee and role<>'customer') then raise exception 'Choose an internal employee'; end if;
 resolution:=case when p_input?'resolution_summary' then btrim(p_input->>'resolution_summary') else t.resolution_summary end;
 explanation:=coalesce(p_input->>'explanation','');
 if length(explanation)>10000 then raise exception 'Explanation too long'; end if;
 if next_status='Resolved' and coalesce(length(resolution),0)=0 then raise exception 'Resolution summary required'; end if;
 update public.tickets set status=next_status,assigned_team=next_team,assigned_to=next_assignee,priority=next_priority,resolution_summary=resolution,
  resolved_at=case when next_status='Resolved' then coalesce(t.resolved_at,now()) when t.status='Resolved' and next_status='Investigating' then null else t.resolved_at end,
  reopened_count=t.reopened_count+case when t.status='Resolved' and next_status='Investigating' then 1 else 0 end,updated_at=now() where id=p_ticket;
 if next_status<>t.status then
  perform public.emit_ticket_event(p_ticket,'status',t.status::text||' â†’ '||next_status::text||case when explanation<>'' then ': '||explanation else '' end,'public',t.status,next_status,
   case when next_status='Resolved' then 'ticket.resolved' when next_status='Waiting for Customer' then 'ticket.waiting' else null end);
 end if;
 if next_team is distinct from t.assigned_team or next_assignee is distinct from t.assigned_to then
  perform public.emit_ticket_event(p_ticket,'assignment','Assigned team: '||coalesce(next_team,'Unassigned')||'; employee: '||coalesce((select display_name from public.profiles where id=next_assignee),'Unassigned')||'.','public',null,null,'ticket.assigned');
 end if;
 if next_priority is distinct from t.priority then perform public.emit_ticket_event(p_ticket,'priority','Priority changed from '||t.priority||' to '||next_priority||'.'); end if;
 if p_input?'resolution_summary' then perform public.emit_ticket_event(p_ticket,'resolution','Resolution documentation updated.'); end if;
end; $$;

create function public.add_ticket_update(p_ticket uuid,p_body text,p_visibility public.visibility) returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.app_role:=public.actor_role(); new_id uuid; org uuid; current_status public.ticket_status;
begin
 if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select organization_id,status into org,current_status from public.tickets where id=p_ticket for update;
 if not found or not public.can_read_org(org) then raise exception 'Ticket not found' using errcode='P0002'; end if;
 if actor='customer' and p_visibility<>'public' then raise exception 'Private notes denied' using errcode='42501'; end if;
 if current_status='Closed' then raise exception 'Ticket is closed'; end if;
 insert into public.ticket_updates(ticket_id,created_by,visibility,body,author_name) values(p_ticket,auth.uid(),p_visibility,btrim(p_body),(select display_name from public.profiles where id=auth.uid())) returning id into new_id;
 update public.tickets set updated_at=now() where id=p_ticket;
 if actor<>'customer' and p_visibility='public' then
  insert into public.notification_events(ticket_id,created_by,event_type,idempotency_key,payload)
  values(p_ticket,auth.uid(),'ticket.public_update','ticket.public_update:'||new_id::text,jsonb_build_object('ticket_id',p_ticket,'organization_id',org,'event_type','ticket.public_update','actor_id',auth.uid()));
 end if;
 return new_id;
end; $$;

create function public.confirm_ticket(p_ticket uuid) returns void language plpgsql security definer set search_path='' as $$
declare t public.tickets;
begin
 if public.actor_role() is distinct from 'customer'::public.app_role then raise exception 'Customer confirmation required' using errcode='42501'; end if;
 select * into t from public.tickets where id=p_ticket for update;
 if not found or not public.can_read_org(t.organization_id) then raise exception 'Ticket not found' using errcode='P0002'; end if;
 if t.status<>'Resolved' then raise exception 'Ticket is not resolved'; end if;
 update public.tickets set status='Closed',confirmed_at=now(),updated_at=now() where id=p_ticket;
 perform public.emit_ticket_event(p_ticket,'status','Customer confirmed the resolution.','public','Resolved','Closed');
end; $$;

create function public.reserve_ticket_attachment(p_ticket uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare new_id uuid:=gen_random_uuid(); path text; t public.tickets;
begin
 if public.actor_role() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into t from public.tickets where id=p_ticket for update;
 if not found or not public.can_read_org(t.organization_id) then raise exception 'Ticket not found' using errcode='P0002'; end if;
 if t.status='Closed' then raise exception 'Ticket is closed'; end if;
 if public.actor_role()='customer' and p_input->>'visibility'<>'public' then raise exception 'Internal evidence denied' using errcode='42501'; end if;
 if p_input->>'filename' !~ '^[a-zA-Z0-9._ -]{1,180}$' then raise exception 'Invalid filename'; end if;
 path:=p_ticket::text||'/'||new_id::text;
 insert into public.ticket_attachments(id,ticket_id,created_by,visibility,object_path,filename,content_type,size_bytes)
 values(new_id,p_ticket,auth.uid(),(p_input->>'visibility')::public.visibility,path,p_input->>'filename',p_input->>'content_type',(p_input->>'size_bytes')::integer);
 return jsonb_build_object('id',new_id,'object_path',path);
end; $$;
create function public.finish_ticket_attachment(p_attachment uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.ticket_attachments; t public.tickets;
begin
 select * into a from public.ticket_attachments where id=p_attachment for update;
 if not found or a.created_by<>auth.uid() then raise exception 'Attachment access denied' using errcode='42501'; end if;
 select * into t from public.tickets where id=a.ticket_id for update;
 if not public.can_read_org(t.organization_id) or t.status='Closed' then raise exception 'Ticket access denied' using errcode='42501'; end if;
 if a.ready then return; end if;
 if not exists(select 1 from storage.objects where bucket_id='ticket-evidence' and name=a.object_path) then raise exception 'Evidence not uploaded'; end if;
 update public.ticket_attachments set ready=true where id=a.id;
 update public.tickets set updated_at=now() where id=a.ticket_id;
 perform public.emit_ticket_event(a.ticket_id,'attachment','Evidence added: '||a.filename,a.visibility);
end; $$;
create function public.cancel_ticket_attachment(p_attachment uuid) returns void language plpgsql security definer set search_path='' as $$
begin delete from public.ticket_attachments where id=p_attachment and created_by=auth.uid() and not ready; end; $$;

drop policy attachment_read on public.ticket_attachments;
create policy attachment_read on public.ticket_attachments for select to authenticated using(ready and public.can_read_ticket(ticket_id) and (visibility='public' or public.is_internal()));
-- No storage INSERT policy: only the server's validated upload uses its secret key.
revoke all on function public.actor_role(),public.emit_ticket_event(uuid,text,text,public.visibility,public.ticket_status,public.ticket_status,text),public.create_ticket(jsonb),public.change_ticket(uuid,jsonb),public.add_ticket_update(uuid,text,public.visibility),public.confirm_ticket(uuid),public.reserve_ticket_attachment(uuid,jsonb),public.finish_ticket_attachment(uuid),public.cancel_ticket_attachment(uuid) from public,anon,authenticated;
grant execute on function public.create_ticket(jsonb),public.change_ticket(uuid,jsonb),public.add_ticket_update(uuid,text,public.visibility),public.confirm_ticket(uuid),public.reserve_ticket_attachment(uuid,jsonb),public.finish_ticket_attachment(uuid),public.cancel_ticket_attachment(uuid) to authenticated;

$operations$;
 end if;
 if to_regclass('public.case_records') is null then
  execute $study$-- ITIL case-study extension. No outbound automation or n8n dependency.
alter table public.tickets add column record_type text not null default 'incident' check(record_type in ('incident','service_request'));
alter table public.tickets add column business_impact text not null default '' check(length(business_impact)<=12000);
create table public.case_records(
 id uuid primary key default gen_random_uuid(),ticket_id uuid not null references public.tickets(id),
 kind text not null check(kind in ('triage','investigation','restoration','report','problem','improvement','diagnostic')),
 status text not null,version integer not null check(version>0),data jsonb not null check(jsonb_typeof(data)='object' and length(data::text)<=100000),
 created_by uuid not null references public.profiles(id),author_name text not null,reviewed_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index case_records_ticket on public.case_records(ticket_id,kind);
create table public.case_record_versions(id uuid primary key default gen_random_uuid(),record_id uuid not null references public.case_records(id),snapshot jsonb not null,created_at timestamptz not null default now());
alter table public.case_records enable row level security;
alter table public.case_record_versions enable row level security;
revoke all on public.case_records,public.case_record_versions from anon,authenticated;
grant select on public.case_records,public.case_record_versions to authenticated;
create policy case_read on public.case_records for select to authenticated using(public.can_read_ticket(ticket_id) and (public.is_internal() or (kind='report' and status='Published' and data->>'audience'='customer')));
create policy case_version_read on public.case_record_versions for select to authenticated using(public.is_internal());
create table public.case_access_log(id uuid primary key default gen_random_uuid(),record_id uuid not null references public.case_records(id),actor_id uuid not null references public.profiles(id),accessed_at timestamptz not null default now());
alter table public.case_access_log enable row level security;
revoke all on public.case_access_log from anon,authenticated;
grant select on public.case_access_log to authenticated;
create policy access_log_read on public.case_access_log for select to authenticated using(public.is_internal());
create function public.log_report_download(p_record uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.case_records;begin
 if public.actor_role() is null then raise exception 'Sign in required' using errcode='42501';end if;
 select * into r from public.case_records where id=p_record and kind='report';
 if not found or not public.can_read_ticket(r.ticket_id) or (not public.is_internal() and (r.status<>'Published' or r.data->>'audience'<>'customer')) then raise exception 'Report not found' using errcode='P0002';end if;
 insert into public.case_access_log(record_id,actor_id) values(r.id,auth.uid());
end;$$;
revoke all on function public.log_report_download(uuid) from public,anon,authenticated;
grant execute on function public.log_report_download(uuid) to authenticated;

alter function public.create_ticket(jsonb) rename to create_ticket_core;
revoke execute on function public.create_ticket_core(jsonb) from authenticated,anon,public;
create function public.create_ticket(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid; begin
 new_id:=public.create_ticket_core(p_input-array['record_type','business_impact']);
 update public.tickets set record_type=coalesce(p_input->>'record_type','incident'),business_impact=coalesce(p_input->>'business_impact','') where id=new_id;
 return new_id;
end;$$;
alter function public.change_ticket(uuid,jsonb) rename to change_ticket_core;
revoke execute on function public.change_ticket_core(uuid,jsonb) from authenticated,anon,public;
create function public.change_ticket(p_ticket uuid,p_input jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.actor_role() is null or public.actor_role() in ('customer','customer_success') then raise exception 'Investigation permission denied' using errcode='42501'; end if;
 if p_input->>'status'='Resolved' and not exists(select 1 from public.case_records r join public.tickets t on t.id=r.ticket_id where r.ticket_id=p_ticket and r.kind='restoration' and coalesce((r.data->>'reopen_count')::integer,0)=t.reopened_count and r.updated_at>=coalesce((select max(created_at) from public.ticket_activity where ticket_id=p_ticket and previous_status='Resolved' and new_status='Investigating'),'-infinity'::timestamptz)) then raise exception 'Verified service restoration required'; end if;
 perform public.change_ticket_core(p_ticket,p_input);
end;$$;

create function public.save_case_record(p_ticket uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.app_role:=public.actor_role(); t public.tickets; old public.case_records; result public.case_records;
 k text:=p_input->>'kind'; s text:=p_input->>'status'; d jsonb:=p_input->'data'; rid uuid:=(p_input->>'id')::uuid; owner_id uuid; target_priority text; seq text[]:=array['Proposed','Approved','In Progress','Implemented','Monitoring','Verified']; linked uuid;
begin
 if actor is null or actor='customer' then raise exception 'Internal access required' using errcode='42501'; end if;
 select * into t from public.tickets where id=p_ticket for update;if not found then raise exception 'Ticket not found' using errcode='P0002'; end if;
 if k not in ('triage','investigation','restoration','report','problem','improvement') or jsonb_typeof(d)<>'object' then raise exception 'Invalid case record'; end if;
 if k in ('triage','investigation') and s<>'Recorded' then raise exception 'Invalid case state'; end if;
 if k='restoration' and s<>'Verified' then raise exception 'Verified recovery required'; end if;
 if rid is not null then
  select * into old from public.case_records where id=rid and ticket_id=p_ticket for update;
  if not found or old.kind<>k then raise exception 'Record not found' using errcode='P0002'; end if;
  if (p_input->>'version')::integer is distinct from old.version then raise exception 'Record changed, reload'; end if;
 end if;
 if k='triage' and actor<>'support_analyst' then raise exception 'Only Support can triage' using errcode='42501'; end if;
 if k in ('restoration','investigation') and actor='customer_success' then raise exception 'Technical access required' using errcode='42501'; end if;
 if d?'owner_id' then owner_id:=(d->>'owner_id')::uuid;if owner_id is null or not exists(select 1 from public.profiles where id=owner_id and role<>'customer') then raise exception 'Internal owner required'; end if; end if;
 if k='triage' then
  if not(d ?& array['record_type','impact','urgency','business_impact','owner_id','major_incident','incident_lead','update_cadence_minutes']) then raise exception 'Incomplete triage'; end if;
  if d->>'record_type' not in ('incident','service_request') or d->>'impact' not in ('low','medium','high') or d->>'urgency' not in ('low','medium','high') or coalesce(length(btrim(d->>'business_impact')),0)<3 or owner_id is null then raise exception 'Invalid triage'; end if;
  target_priority:=case when d->>'impact'='high' and d->>'urgency'='high' then 'critical' when (d->>'impact'='high' and d->>'urgency'='medium') or (d->>'impact'='medium' and d->>'urgency'='high') then 'high' when (d->>'impact'='high' and d->>'urgency'='low') or (d->>'impact'='medium' and d->>'urgency'='medium') or (d->>'impact'='low' and d->>'urgency'='high') then 'normal' else 'low' end;
  if d->>'record_type'='service_request' and coalesce((d->>'major_incident')::boolean,false) then raise exception 'Service requests are not major incidents';end if;
  if d->>'record_type'='incident' and (target_priority='critical' or coalesce((d->>'major_incident')::boolean,false)) and coalesce(length(btrim(d->>'incident_lead')),0)=0 then raise exception 'Major incident lead required'; end if;
  if coalesce((d->>'update_cadence_minutes')::integer,0) not between 5 and 1440 then raise exception 'Invalid update cadence'; end if;
  if t.status='Closed' then raise exception 'Incident is closed'; end if;
  update public.tickets set priority=target_priority,record_type=d->>'record_type',business_impact=d->>'business_impact' where id=p_ticket;
 end if;
 if k in ('investigation','problem') and coalesce(d->>'confirmed_cause','')<>'' and coalesce(length(btrim(d->>'evidence')),0)=0 then raise exception 'Confirmed cause requires evidence'; end if;
 if k='restoration' and (coalesce(length(d->>'restoration_method'),0)<3 or coalesce(length(d->>'verification_result'),0)<3 or coalesce(length(d->>'closure_evidence'),0)<3 or (d->>'restored_at')::timestamptz is null or (d->>'restored_at')::timestamptz>now()) then raise exception 'Verified recovery evidence required'; end if;
 if k='restoration' then d:=d||jsonb_build_object('reopen_count',t.reopened_count);end if;
 if k='report' then
  if t.status not in ('Resolved','Closed') then raise exception 'Resolve before reporting'; end if;
  if d->>'audience' not in ('customer','internal') or coalesce(length(btrim(d->>'content')),0)<20 or length(d->>'content')>40000 then raise exception 'Invalid report content'; end if;
  if s not in ('Draft','Approved','Published') or (rid is null and s<>'Draft') then raise exception 'Start report as Draft'; end if;
  if old.status='Published' then raise exception 'Published versions are immutable'; end if;
  if s in ('Approved','Published') and actor not in ('support_analyst','customer_success') then raise exception 'Reviewer role required' using errcode='42501'; end if;
  if s='Approved' and (old.status is distinct from 'Draft' or coalesce(length(btrim(d->>'review_notes')),0)=0) then raise exception 'Draft review and notes required'; end if;
  if s='Published' and (old.status is distinct from 'Approved' or d->>'audience'<>'customer' or d->>'audience' is distinct from old.data->>'audience' or d->>'content' is distinct from old.data->>'content') then raise exception 'Publish unchanged approved customer report'; end if;
 end if;
 if k='problem' then
  if s not in ('Open','Investigating','Known Error','Resolved') or coalesce(length(btrim(d->>'title')),0)<3 or owner_id is null then raise exception 'Invalid Problem'; end if;
  if jsonb_typeof(d->'incident_ids') is distinct from 'array' or jsonb_array_length(d->'incident_ids') not between 1 and 100 then raise exception 'Link source incidents'; end if;
  for linked in select value::uuid from jsonb_array_elements_text(d->'incident_ids') loop if not exists(select 1 from public.tickets where id=linked and record_type='incident') then raise exception 'Linked incident unavailable'; end if; end loop;
  if s='Known Error' and (coalesce(d->>'confirmed_cause','')='' or coalesce(d->>'workaround','')='') then raise exception 'Known errors need cause and workaround'; end if;
 end if;
 if k='improvement' then
  if owner_id is null or coalesce(length(btrim(d->>'title')),0)<3 or coalesce(length(btrim(d->>'acceptance_criteria')),0)<3 then raise exception 'Objective and owner required'; end if;
  if not exists(select 1 from public.case_records where id=(d->>'problem_id')::uuid and kind='problem') then raise exception 'Problem link required'; end if;
  if array_position(seq,s) is null or (rid is null and s<>'Proposed') or (rid is not null and array_position(seq,s) not in (array_position(seq,old.status),array_position(seq,old.status)+1)) or old.status='Verified' then raise exception 'Invalid improvement transition'; end if;
  if s in ('Approved','Verified') and actor not in ('support_analyst','customer_success') then raise exception 'Reviewer role required' using errcode='42501'; end if;
  if s in ('In Progress','Implemented','Monitoring') and owner_id<>auth.uid() and actor<>'support_analyst' then raise exception 'Action owner required' using errcode='42501'; end if;
  if s in ('Implemented','Monitoring','Verified') and coalesce(length(btrim(d->>'implementation_evidence')),0)=0 then raise exception 'Implementation evidence required'; end if;
  if s in ('Monitoring','Verified') and coalesce(length(btrim(d->>'baseline')),0)=0 then raise exception 'Monitoring baseline required'; end if;
  if s='Verified' and coalesce(length(btrim(d->>'verification_evidence')),0)=0 then raise exception 'Follow-up evidence required'; end if;
  if (d->>'review_date')::date is null then raise exception 'Review date required'; end if;
  d:=d-array['implemented_at','verified_at'];
  if old.data?'implemented_at' then d:=d||jsonb_build_object('implemented_at',old.data->'implemented_at');end if;
  if s='Implemented' and old.status is distinct from 'Implemented' then d:=d||jsonb_build_object('implemented_at',now());end if;
  if s='Verified' then d:=d||jsonb_build_object('verified_at',now());end if;
 end if;
 insert into public.case_records(id,ticket_id,kind,status,version,data,created_by,author_name,reviewed_by)
 values(coalesce(rid,gen_random_uuid()),p_ticket,k,s,coalesce(old.version,0)+1,d,coalesce(old.created_by,auth.uid()),coalesce(old.author_name,(select display_name from public.profiles where id=auth.uid())),case when s='Approved' then auth.uid() when s='Draft' then null else old.reviewed_by end)
 on conflict(id) do update set status=excluded.status,version=excluded.version,data=excluded.data,reviewed_by=excluded.reviewed_by,updated_at=now() returning * into result;
 insert into public.case_record_versions(record_id,snapshot) values(result.id,to_jsonb(result));
 update public.tickets set updated_at=now() where id=p_ticket;
 perform public.emit_ticket_event(p_ticket,'case.'||k,k||' '||s||' (version '||result.version::text||').',case when k='report' and s='Published' then 'public'::public.visibility else 'internal'::public.visibility end);
 return to_jsonb(result);
end;$$;

create function public.record_diagnostic(p_ticket uuid,p_source text,p_summary jsonb,p_run uuid) returns void language plpgsql security definer set search_path='' as $$
declare rec public.case_records;
begin
 if public.actor_role() is null or public.actor_role() in ('customer','customer_success') then raise exception 'Technical role required' using errcode='42501'; end if;
 if not exists(select 1 from public.tickets where id=p_ticket) then raise exception 'Ticket not found' using errcode='P0002'; end if;
 if length(p_summary::text)>60000 or jsonb_typeof(p_summary->'checks')<>'array' then raise exception 'Invalid diagnostic summary'; end if;
 insert into public.case_records(id,ticket_id,kind,status,version,data,created_by,author_name) values(p_run,p_ticket,'diagnostic','Completed',1,jsonb_build_object('source_id',p_source,'summary',p_summary),auth.uid(),(select display_name from public.profiles where id=auth.uid())) returning * into rec;
 insert into public.case_record_versions(record_id,snapshot) values(rec.id,to_jsonb(rec));
 insert into public.diagnostic_runs(ticket_id,created_by,summary) values(p_ticket,auth.uid(),p_summary);
 perform public.emit_ticket_event(p_ticket,'diagnostic','Diagnostic summary: '||coalesce(p_summary->>'failed_checks','0')||' failed checks; source '||p_source||'.','internal');
 update public.tickets set updated_at=now() where id=p_ticket;
end;$$;
create function public.dispute_ticket(p_ticket uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare t public.tickets;begin
 if public.actor_role() is distinct from 'customer'::public.app_role then raise exception 'Customer required' using errcode='42501'; end if;
 select * into t from public.tickets where id=p_ticket for update;
 if not found or not public.can_read_org(t.organization_id) then raise exception 'Ticket not found' using errcode='P0002'; end if;
 if t.status<>'Resolved' or length(btrim(p_reason)) not between 10 and 10000 then raise exception 'Resolved ticket and explanation required'; end if;
 update public.tickets set status='Investigating',resolved_at=null,confirmed_at=null,reopened_count=reopened_count+1,updated_at=now() where id=p_ticket;
 perform public.emit_ticket_event(p_ticket,'status','Customer disputes recovery: '||p_reason,'public','Resolved','Investigating');
end;$$;
revoke all on function public.create_ticket(jsonb),public.change_ticket(uuid,jsonb),public.save_case_record(uuid,jsonb),public.record_diagnostic(uuid,text,jsonb,uuid),public.dispute_ticket(uuid,text) from public,anon,authenticated;
grant execute on function public.create_ticket(jsonb),public.change_ticket(uuid,jsonb),public.save_case_record(uuid,jsonb),public.record_diagnostic(uuid,text,jsonb,uuid),public.dispute_ticket(uuid,text) to authenticated;
-- Subscribe to authorized public ticket rows only; private note/report tables are not published.
do $$ begin if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tickets') then alter publication supabase_realtime add table public.tickets;end if;end $$;
$study$;
 end if;
end $repair$;-- Extend proof uploads without changing visibility, organization policies, or size limits.
alter table public.ticket_attachments drop constraint ticket_attachments_content_type_check;
alter table public.ticket_attachments add constraint ticket_attachments_content_type_check
 check (content_type in ('image/png','image/jpeg','text/plain','text/csv','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'));

update storage.buckets set allowed_mime_types = array[
 'image/png','image/jpeg','text/plain','text/csv','application/pdf','application/msword',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
] where id = 'ticket-evidence';

do $repair$
begin
 if to_regprocedure('public.apply_ticket_workflow(uuid,timestamp with time zone,jsonb,jsonb,jsonb)') is null then
  execute $workflow$-- Save a focused workflow action atomically using the existing authorized mutations.
create function public.apply_ticket_workflow(p_ticket uuid,p_expected_updated_at timestamptz,p_records jsonb,p_change jsonb,p_update jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare t public.tickets; rec jsonb;
begin
 if public.actor_role() is null or public.actor_role() not in ('support_analyst','data_engineer','product_tech') or not public.can_read_ticket(p_ticket) then raise exception 'Technical access required' using errcode='42501'; end if;
 select * into t from public.tickets where id=p_ticket for update;
 if not found then raise exception 'Ticket not found' using errcode='P0002'; end if;
 if t.updated_at is distinct from p_expected_updated_at then raise exception 'Ticket changed; reload before saving' using errcode='40001'; end if;
 if t.status='Closed' then raise exception 'Ticket is closed'; end if;
 if jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>1 then raise exception 'Invalid workflow records'; end if;
 for rec in select value from jsonb_array_elements(p_records) loop
  if rec->>'kind' is null or rec->>'kind' not in ('triage','restoration') then raise exception 'Invalid workflow record'; end if;
  perform public.save_case_record(p_ticket,rec);
 end loop;
 if p_change is not null and p_change<>'null'::jsonb then perform public.change_ticket(p_ticket,p_change); end if;
 if p_update is not null and p_update<>'null'::jsonb then
  perform public.add_ticket_update(p_ticket,p_update->>'body',(p_update->>'visibility')::public.visibility);
 end if;
end; $$;
revoke all on function public.apply_ticket_workflow(uuid,timestamptz,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.apply_ticket_workflow(uuid,timestamptz,jsonb,jsonb,jsonb) to authenticated;
$workflow$;
 end if;
end $repair$;
notify pgrst, 'reload schema';
commit;
