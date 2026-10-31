# SupportOps

Independent technical support portfolio for fictional people analytics incidents. Not affiliated with Crunchr. Synthetic data only; this MVP is not production certified for sensitive HR data.

## Current milestone: ITIL study-case integration

The supplied October 2026 study case has been integrated with the original roadmap. **n8n and outbound email are deferred at the user's request.** No automation service is required to use the platform.

New features: incident/service-request routing, business impact and urgency-based priority, accountable ownership and major-incident coordination, hypothesis/evidence/checklist records, verified restoration and customer disputes, real Python CSV diagnostics, separate customer/internal report drafts, version history, review/approval/publication, authorized PDF downloads and access logs, separate Problems/known errors, controlled improvement actions, evidence-based recurrence groups and defined analytics cohorts. See [requirement mapping and limits](docs/study-case-integration.md).

### Password-free demo access

The app defaults to demo mode. Open `/login`, choose one of five roles, and enter without Supabase credentials. Switch roles from the workspace sidebar or use Exit demo. The selected persona is remembered in an HttpOnly cookie for eight hours. Tickets, messages, activity, notification events and evidence persist in a local SQLite database at `apps/web/.data/supportops.sqlite`. All roles share this synthetic dataset, so switching roles continues the same investigation. Demo customers belong to Atlas Industries; internal roles can also see Northstar and Meridian tickets.

Demo mode does not log into Supabase or grant database permissions. To use authenticated mode, set `SUPPORTOPS_AUTH_MODE=supabase` in `apps/web/.env.local`, configure the Supabase values below, and restart the app. The demo endpoint is disabled in authenticated mode. Account provisioning applies only to Supabase mode. Local SQLite requires Node 22.17+ and a writable persistent disk; use Supabase mode on Vercel.

The existing customer/internal dashboards, filtered ticket tables, intake, assignments, public/private messages, attachments and persistent history remain. The same UI uses either a synthetic SQLite demo or Supabase Auth/RLS and transactional RPCs. Metrics come from stored records. Four fictional incidents seed a new demo database; the study-case smoke test creates additional evidence-linked demonstration records.

Demo views check for authorized changes every five seconds and preserve focused form edits. Supabase mode also subscribes to authorized ticket-row changes, with polling as fallback; private case records are not published to Realtime. Live WebSocket delivery still needs Supabase service acceptance. Ticket events retain the sanitized outbox, but no notifications are sent.

## Local setup (Windows PowerShell)

For the password-free demo, use Node 22.17+ and npm, then run `npm.cmd ci` and `npm.cmd run dev`. No Docker or environment file is needed. SQLite uses Node's experimental built-in API.

For the full demo with Python diagnostics, install Python 3.13 and run:

```powershell
npm.cmd ci
python -m venv services/diagnostics/.venv
services/diagnostics/.venv/Scripts/python.exe -m pip install -r services/diagnostics/requirements.lock.txt
npm.cmd run dev:full
```

`dev:full` creates a random local service token in the ignored `apps/web/.env.local`, starts hidden local web/diagnostic processes if their ports are free, and writes logs to ignored `.data/`. Existing listeners are retained. If you change environment values, restart the affected processes. Open http://localhost:3000/login. Select a role, open a ticket, and use the **Run HR upload diagnostics** section. Tokens are server-only and never included in browser requests.

The Python service binds to `127.0.0.1:8001`. For hosted deployments configure `DIAGNOSTICS_URL` and a matching `DIAGNOSTICS_API_TOKEN` of at least 32 characters on both services; use HTTPS and a separately hosted Python runtime. Vercel does not start the Python service for you. See [diagnostic service](services/diagnostics/README.md).

For local Supabase mode, additionally start Docker Desktop with Linux containers. Use `npm.cmd` if PowerShell blocks npm.ps1. Supabase CLI is invoked through npx; no global installation is required.

```powershell
npm.cmd ci
npx.cmd supabase start
npx.cmd supabase db reset
npx.cmd supabase status
Copy-Item apps/web/.env.example apps/web/.env.local
```

Replace the URL/key in `apps/web/.env.local` with the local API URL and publishable (or legacy anon) key from `supabase status`. Never use a service-role/secret key. Then:

Set `SUPPORTOPS_AUTH_MODE=supabase` for this configuration. For attachments also set the **server-only** `SUPABASE_SECRET_KEY` to the project's secret key (the local legacy service-role key is also accepted by the SDK). It is used only for storage upload after user authorization and file-byte validation. Never prefix this variable with `NEXT_PUBLIC_`. Ticket reads and RPCs always use the user's session and public key.

```powershell
npm.cmd run dev
```

Open http://localhost:3000. Demo mode works immediately without environment configuration. For database-backed account sign-in, set `SUPPORTOPS_AUTH_MODE=supabase`; this mode displays setup guidance if Supabase credentials are missing. There are no shared account passwords and no public signup route.

## Hosted Supabase alternative

Create a separate development project. In Authentication settings disable public signup, set Site URL to your application URL, and configure password policy/rate limits. Link and migrate:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref YOUR_PROJECT_REF
npx.cmd supabase db push
```

Run `supabase/seed.sql` in the development SQL editor to add only fictional organizations. Use the project URL and publishable key from the Supabase Connect dialog in the web environment. The local config file does not change hosted Auth settings; configure those explicitly in the dashboard.

## Provision authorized accounts

In local Studio (http://localhost:54323) or the hosted Authentication dashboard, create a user with an individual password and confirmed email. Copy that user's UUID. In the trusted SQL editor run this template after replacing the UUID and display name:

```sql
insert into public.profiles(id, display_name, role)
values ('AUTH_USER_UUID', 'Atlas demo customer', 'customer');
insert into public.organization_memberships(organization_id, user_id)
select id, 'AUTH_USER_UUID'::uuid from public.organizations where name = 'Atlas Industries';
```

Create separate users for `support_analyst`, `customer_success`, `data_engineer`, and `product_tech`, inserting a profile with the corresponding role. Internal roles do not require customer memberships. Use a second customer with Northstar membership to test isolation. Never run these statements through a browser client or allow users to select their own role. Do not reuse passwords in production.

## Validation

```powershell
npm.cmd run test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npx.cmd supabase test db
```

`npm.cmd run test` includes persistent SQLite workflow tests and embedded PostgreSQL tests using PGlite. They execute all three migrations and RLS/RPC assertions with stubbed Auth/Storage surfaces. They do not replace live Supabase Auth, object storage, signed URL or Realtime testing. `supabase test db` additionally runs the original pgTAP tests against a running local Supabase instance.

```powershell
services/diagnostics/.venv/Scripts/python.exe -m pytest services/diagnostics -q
node scripts/smoke-study-case.mjs
```

The study-case smoke test requires both local services. It preserves synthetic incidents, report revisions, an open Problem and a verified improvement action so you can inspect them afterward. It also checks real Python findings and published PDF authorization.

With the demo server running, execute `node scripts/smoke-phase2.mjs` for the customer → analyst → Data Engineer → CSM → customer workflow. It creates one synthetic acceptance ticket and preserves its completed history. It checks private note/evidence isolation, downloads, unauthorized mutations, closure, and server-rendered pages.

Manual Phase 1 acceptance: sign in as each provisioned role, verify the displayed database role, sign out, confirm `/workspace` redirects to login, and verify no role/membership editing is available. Live authentication cannot be verified without a provisioned instance.

## Vercel deployment

Import the GitHub repository into Vercel, choose Next.js, and set Root Directory to `apps/web`, with workspace files outside the root included. Set `SUPPORTOPS_AUTH_MODE=supabase`, both `NEXT_PUBLIC_SUPABASE_*` values, `SUPABASE_SECRET_KEY` for attachments, and diagnostic URL/token for Python checks. Apply all three migrations before deployment. Set the hosted Supabase Site URL to the Vercel URL. Keep previews on a development Supabase project. SQLite is not durable on Vercel. No remote migrations or deployment were performed automatically.

## Integrated delivery roadmap

| Phase | Current state |
| --- | --- |
| 1 Foundation | Implemented; live Supabase service acceptance remains required. |
| 2 Incident core | Implemented with persistent local and Supabase adapters. |
| 3 Collaboration | Team queues, public/private communication, checklists and automatic refresh implemented. Supabase WebSocket configuration is present but live delivery is unverified. |
| 4 Diagnostics | FastAPI/Pandas checks, fixtures, protected invocation, sanitized persistence and pytest implemented. |
| 5 Automation | Deferred. No n8n or outbound notification delivery required. |
| 6 Reports | Separate drafts, review, approval, immutable published customer versions, PDFs and access auditing implemented. |
| 7 Problems and improvement | Separate Problems/known errors, controlled changes, evidence-gated verification, recurrence and cohort metrics implemented. |
| 8 Polish and deployment | Documentation and local acceptance scripts supplied. Visual/accessibility interaction review and live Supabase/Vercel deployment acceptance remain outstanding. |

Incidents require verified service restoration before resolution. A full root-cause review, published report, closed Problem or completed preventive action is **not** a prerequisite for incident closure. Customer disputes reopen the incident and preserve prior history. The internal policy still trusts provisioned internal staff across organizations; team queues filter work but do not add per-assignment staff access restrictions.
