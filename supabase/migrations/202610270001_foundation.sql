-- Phase 1: deny-by-default reads and administrator-managed identity.
create type public.app_role as enum ('customer','support_analyst','customer_success','data_engineer','product_tech');
create type public.ticket_status as enum ('Reported','Triaged','Investigating','Escalated','Fix in Progress','Waiting for Customer','Monitoring','Resolved','Closed');
create type public.visibility as enum ('public','internal');
create type public.ticket_category as enum ('Data Upload Failure','Incorrect Dashboard Data','Data Refresh Delay','Login / SSO Issue','Product Bug','Other Technical Issue');
create table public.organizations (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 200), created_at timestamptz not null default now()
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(length(display_name) between 1 and 120),
 role public.app_role not null default 'customer', created_at timestamptz not null default now()
);
create table public.organization_memberships (
 organization_id uuid not null references public.organizations(id),
 user_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), created_by uuid references public.profiles(id),
 primary key(organization_id,user_id)
);
create index memberships_user_idx on public.organization_memberships(user_id);
create table public.tickets (
 id uuid primary key default gen_random_uuid(), number bigint generated always as identity unique,
 organization_id uuid not null references public.organizations(id),
 created_by uuid not null references public.profiles(id),
 title text not null check(length(title) between 3 and 200), description text not null check(length(description) between 10 and 20000),
 category public.ticket_category not null, status public.ticket_status not null default 'Reported',
 priority text not null default 'normal' check(priority in ('low','normal','high','critical')),
 reported_urgency text not null default 'normal' check(reported_urgency in ('low','normal','high','critical')),
 first_occurred_at timestamptz, users_affected integer check(users_affected >= 0), error_message text check(length(error_message) <= 10000),
 assigned_team text check(assigned_team in ('Support','Customer Success','Data Engineering','Product & Tech')),
 assigned_to uuid references public.profiles(id), resolution_summary text check(length(resolution_summary) <= 20000),
 resolved_at timestamptz, confirmed_at timestamptz, reopened_count integer not null default 0 check(reopened_count >= 0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index tickets_org_updated_idx on public.tickets(organization_id,updated_at desc);
create index tickets_status_team_idx on public.tickets(status,assigned_team);
create table public.ticket_updates (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.tickets(id) on delete cascade,
 created_by uuid not null references public.profiles(id), visibility public.visibility not null,
 body text not null check(length(body) between 1 and 20000), created_at timestamptz not null default now()
);
create table public.ticket_activity (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.tickets(id) on delete cascade,
 created_by uuid not null references public.profiles(id), visibility public.visibility not null,
 event_type text not null, previous_status public.ticket_status, new_status public.ticket_status,
 summary text not null check(length(summary) between 1 and 20000), created_at timestamptz not null default now()
);
create table public.ticket_attachments (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.tickets(id) on delete cascade,
 created_by uuid not null references public.profiles(id), visibility public.visibility not null,
 object_path text not null unique, filename text not null check(length(filename) between 1 and 255),
 content_type text not null check(content_type in ('image/png','image/jpeg','text/plain','text/csv')),
 size_bytes integer not null check(size_bytes between 1 and 5242880), created_at timestamptz not null default now()
);
create table public.diagnostic_runs (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.tickets(id) on delete cascade,
 created_by uuid not null references public.profiles(id), summary jsonb not null,
 created_at timestamptz not null default now()
);
create table public.notification_events (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.tickets(id) on delete cascade,
 created_by uuid not null references public.profiles(id), event_type text not null check(event_type in ('ticket.created','ticket.assigned','ticket.public_update','ticket.waiting','ticket.resolved')),
 idempotency_key text not null unique, payload jsonb not null,
 attempts integer not null default 0 check(attempts >= 0), delivered_at timestamptz, next_attempt_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index updates_ticket_idx on public.ticket_updates(ticket_id,created_at);
create index activity_ticket_idx on public.ticket_activity(ticket_id,created_at);
create index attachments_ticket_idx on public.ticket_attachments(ticket_id);
create index diagnostics_ticket_idx on public.diagnostic_runs(ticket_id);
create index notifications_pending_idx on public.notification_events(next_attempt_at) where delivered_at is null;

-- Helpers use a fixed search path and database-owned roles, never user metadata.
create function public.is_internal() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id = (select auth.uid()) and role <> 'customer');
$$;
create function public.can_read_org(org uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select public.is_internal() or exists(select 1 from public.organization_memberships where organization_id = org and user_id = (select auth.uid()));
$$;
create function public.can_read_ticket(ticket uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.tickets where id = ticket and public.can_read_org(organization_id));
$$;
revoke all on function public.is_internal(), public.can_read_org(uuid), public.can_read_ticket(uuid) from public, anon;
grant execute on function public.is_internal(), public.can_read_org(uuid), public.can_read_ticket(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_updates enable row level security;
alter table public.ticket_activity enable row level security;
alter table public.ticket_attachments enable row level security;
alter table public.diagnostic_runs enable row level security;
alter table public.notification_events enable row level security;
revoke all on public.organizations, public.profiles, public.organization_memberships, public.tickets, public.ticket_updates, public.ticket_activity, public.ticket_attachments, public.diagnostic_runs, public.notification_events from anon, authenticated;
grant select on public.organizations, public.profiles, public.organization_memberships, public.tickets, public.ticket_updates, public.ticket_activity, public.ticket_attachments, public.diagnostic_runs to authenticated;
create policy org_read on public.organizations for select to authenticated using(public.can_read_org(id));
create policy profile_read on public.profiles for select to authenticated using(id = (select auth.uid()) or public.is_internal());
create policy membership_read on public.organization_memberships for select to authenticated using(user_id = (select auth.uid()) or public.is_internal());
create policy ticket_read on public.tickets for select to authenticated using(public.can_read_org(organization_id));
create policy update_read on public.ticket_updates for select to authenticated using(public.can_read_ticket(ticket_id) and (visibility = 'public' or public.is_internal()));
create policy activity_read on public.ticket_activity for select to authenticated using(public.can_read_ticket(ticket_id) and (visibility = 'public' or public.is_internal()));
create policy attachment_read on public.ticket_attachments for select to authenticated using(public.can_read_ticket(ticket_id) and (visibility = 'public' or public.is_internal()));
create policy diagnostic_read on public.diagnostic_runs for select to authenticated using(public.is_internal() and public.can_read_ticket(ticket_id));
-- No client writes in Phase 1. Phase 2 adds narrowly scoped, transactional RPCs.
-- Notifications are backend-only; never publish this table to Realtime.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('ticket-evidence','ticket-evidence',false,5242880,array['image/png','image/jpeg','text/plain','text/csv']);
create policy evidence_read on storage.objects for select to authenticated using(
 bucket_id = 'ticket-evidence' and exists (
 select 1 from public.ticket_attachments a where a.object_path = name
 and public.can_read_ticket(a.ticket_id) and (a.visibility = 'public' or public.is_internal())
 ));
-- No upload policy until the authorized upload operation is implemented.
-- Realtime publication is deliberately deferred until role-isolation tests pass.
