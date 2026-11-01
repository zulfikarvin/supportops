-- Save a focused workflow action atomically using the existing authorized mutations.
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
