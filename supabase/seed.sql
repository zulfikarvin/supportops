-- Fictional organizations only. No shared credentials or auth user modifications.
insert into public.organizations(id,name) values
 ('10000000-0000-4000-8000-000000000001','Atlas Industries'),
 ('10000000-0000-4000-8000-000000000002','Northstar Logistics'),
 ('10000000-0000-4000-8000-000000000003','Meridian Group')
on conflict(id) do nothing;
