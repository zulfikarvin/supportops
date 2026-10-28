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
  perform public.emit_ticket_event(p_ticket,'status',t.status::text||' → '||next_status::text||case when explanation<>'' then ': '||explanation else '' end,'public',t.status,next_status,
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
