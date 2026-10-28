begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
insert into auth.users(id) values
 ('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
insert into public.profiles(id,display_name,role) values
 ('20000000-0000-4000-8000-000000000001','Test customer','customer'),
 ('20000000-0000-4000-8000-000000000002','Test analyst','support_analyst');
insert into public.organization_memberships(organization_id,user_id) values
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
insert into public.tickets(id,organization_id,created_by,title,description,category) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Synthetic upload failure','Fictional failed upload for RLS test','Data Upload Failure'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Synthetic SSO issue','Fictional SSO issue for RLS test','Login / SSO Issue');
insert into public.ticket_updates(ticket_id,created_by,visibility,body) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','public','We are investigating.'),
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','internal','Private synthetic finding.');
insert into public.diagnostic_runs(ticket_id,created_by,summary) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','{"finding":"Synthetic missing column"}');
insert into public.ticket_activity(ticket_id,created_by,visibility,event_type,summary) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','internal','finding','Synthetic private activity');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.tickets),1::bigint,'Customer sees only their organization');
select is((select count(*) from public.ticket_updates),1::bigint,'Customer sees public updates only');
select is((select count(*) from public.ticket_updates where visibility='internal'),0::bigint,'Private notes are hidden');
select throws_ok($$update public.profiles set role='support_analyst' where id='20000000-0000-4000-8000-000000000001'$$,'42501',null,'Customer cannot promote themselves');
select throws_ok($$insert into public.organization_memberships(organization_id,user_id) values ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001')$$,'42501',null,'Customer cannot add memberships');
select throws_ok($$select * from public.notification_events$$,'42501',null,'Notification queue is private');
select is((select count(*) from public.diagnostic_runs),0::bigint,'Customer has no diagnostic access');
select is((select count(*) from public.ticket_activity),0::bigint,'Customer cannot read private activity');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.tickets),2::bigint,'Analyst sees tickets across organizations');
select is((select count(*) from public.ticket_updates),2::bigint,'Analyst sees private notes');
select is((select count(*) from public.diagnostic_runs),1::bigint,'Analyst can read sanitized diagnostic records');
select * from finish();
rollback;
