# SupportOps

Independent technical support portfolio for fictional people analytics incidents. Not affiliated with Crunchr. Synthetic data only; this MVP is not production certified for sensitive HR data.

## Current milestone: Phase 2 core tickets

### Password-free demo access

The app defaults to demo mode. Open `/login`, choose one of five roles, and enter without Supabase credentials. Switch roles from the workspace sidebar or use Exit demo. The selected persona is remembered in an HttpOnly cookie for eight hours. Tickets, messages, activity, notification events and evidence persist in a local SQLite database at `apps/web/.data/supportops.sqlite`. All roles share this synthetic dataset, so switching roles continues the same investigation. Demo customers belong to Atlas Industries; internal roles can also see Northstar and Meridian tickets.

Demo mode does not log into Supabase or grant database permissions. To use authenticated mode, set `SUPPORTOPS_AUTH_MODE=supabase` in `apps/web/.env.local`, configure the Supabase values below, and restart the app. The demo endpoint is disabled in authenticated mode. Account provisioning applies only to Supabase mode. Local SQLite requires Node 22.17+ and a writable persistent disk; use Supabase mode on Vercel.

Implemented: customer and internal dashboards, filtered/searchable ticket tables, issue submission, investigation controls, team/employee assignment, public replies and private notes, timestamped status history, resolution documentation, reopening, customer confirmation, and private attachments. The same UI uses either a persistent synthetic SQLite demo or Supabase Auth/RLS and transactional RPCs. Metrics are derived from stored tickets. Four fictional incidents are seeded into a new demo database.

Realtime, Python diagnostics, extended collaboration, full analytics and n8n delivery remain for subsequent phases. Ticket events already create a sanitized outbox, but no notifications are sent yet. See [architecture](docs/architecture.md) and the [Phase 2 walkthrough](docs/phase2-demo.md).

## Local setup (Windows PowerShell)

For the password-free demo, use Node 22.17+ and npm, then run `npm.cmd ci` and `npm.cmd run dev`. No Docker or environment file is needed. SQLite uses Node's experimental built-in API.

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

`npm.cmd run test` includes persistent SQLite lifecycle tests and embedded PostgreSQL tests using PGlite. The latter execute both migrations and RLS/RPC assertions with stubbed Auth/Storage surfaces. They do not test live Supabase Auth, object upload, signed URLs or Realtime. `supabase test db` additionally runs the original pgTAP tests against a running local Supabase instance.

With the demo server running, execute `node scripts/smoke-phase2.mjs` for the customer → analyst → Data Engineer → CSM → customer workflow. It creates one synthetic acceptance ticket and preserves its completed history. It checks private note/evidence isolation, downloads, unauthorized mutations, closure, and server-rendered pages.

Manual Phase 1 acceptance: sign in as each provisioned role, verify the displayed database role, sign out, confirm `/workspace` redirects to login, and verify no role/membership editing is available. Live authentication cannot be verified without a provisioned instance.

## Vercel deployment

Import the GitHub repository into Vercel, choose Next.js, and set Root Directory to `apps/web`, with workspace files outside the root included. Set `SUPPORTOPS_AUTH_MODE=supabase`, both `NEXT_PUBLIC_SUPABASE_*` values, and `SUPABASE_SECRET_KEY` if attachments are needed. Apply both migrations before deployment. Set the hosted Supabase Site URL to the Vercel URL. Keep preview deployments on a separate development Supabase project. The SQLite demo does not provide durable storage on Vercel.

## Next milestones

2. Implemented: core ticket workflows, uploads, role permissions and transactional activity history. Live Supabase service acceptance remains outstanding.
3. Team capabilities, tested Realtime, resolution confirmation and outbox creation.
4. FastAPI diagnostic validation, synthetic CSV fixtures and pytest.
5. Authenticated n8n delivery, retries, idempotency and importable workflows.
6. Analytics from stored records, security acceptance, UI review, deployment and full interview walkthrough.

The current walkthrough covers the core support workflow. Python diagnostics, Realtime, and actual n8n delivery are not yet available.
