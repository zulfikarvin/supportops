# SupportOps

Independent technical support portfolio for fictional people analytics incidents. Not affiliated with Crunchr. Synthetic data only; this MVP is not production certified for sensitive HR data.

## Current milestone: Phase 1 foundation

### Password-free demo access

The app now defaults to demo mode. Open `/login`, choose one of five roles, and enter the fictional workspace without Supabase credentials. Switch roles from the workspace header or use Exit demo to clear the session. The selected persona is remembered in an HttpOnly cookie for eight hours. Ticket workflows remain planned for Phase 2.

Demo mode does not log into Supabase or grant database permissions. To use the original authenticated mode, set `SUPPORTOPS_AUTH_MODE=supabase` in `apps/web/.env.local`, configure the Supabase values below, and restart the app. The demo endpoint is disabled in authenticated mode. The account provisioning instructions below apply only to Supabase mode.

Implemented: monorepo, Next.js App Router application, responsive sign-in and protected workspace, Supabase cookie/session clients, server-validated password login/logout, five administrator-managed roles, schema for all ten core tables, read-isolation RLS, private storage, synthetic organization seed, role unit tests and SQL security tests.

Ticket workflows, uploads, Realtime, diagnostics, analytics and n8n delivery are planned for subsequent phases. No browser-only ticket simulation or invented metrics are included. See [architecture](docs/architecture.md).

## Local setup (Windows PowerShell)

Prerequisites: Node 22+, npm, Docker Desktop running with Linux containers. Use `npm.cmd` if PowerShell blocks npm.ps1. Supabase CLI is invoked through npx; no global installation is required.

```powershell
npm.cmd ci
npx.cmd supabase start
npx.cmd supabase db reset
npx.cmd supabase status
Copy-Item apps/web/.env.example apps/web/.env.local
```

Replace the URL/key in `apps/web/.env.local` with the local API URL and publishable (or legacy anon) key from `supabase status`. Never use a service-role/secret key. Then:

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

Database tests require a running local Supabase and the seed. They run in a rollback transaction and check cross-organization reads, note visibility, self-promotion, membership writes, internal reads, and outbox denial. Unit tests check the capability model; they do not prove RLS enforcement. Status persistence and notification delivery tests belong with the later implementation.

Manual Phase 1 acceptance: sign in as each provisioned role, verify the displayed database role, sign out, confirm `/workspace` redirects to login, and verify no role/membership editing is available. Live authentication cannot be verified without a provisioned instance.

## Vercel deployment

Push this repository to your own GitHub repository. Import into Vercel, choose Next.js, and set Root Directory to `apps/web`, with workspace files outside the root included. Set the two `NEXT_PUBLIC_SUPABASE_*` values for the intended environment. Deploy only after migrations and database tests pass. Set the hosted Supabase Site URL to the Vercel URL. No service-role key is needed for Phase 1. Keep preview deployments on a separate development Supabase project.

## Next milestones

2. Transactional ticket RPCs, customer portal, investigation workspace, uploads and immutable activity.
3. Team capabilities, tested Realtime, resolution confirmation and outbox creation.
4. FastAPI diagnostic validation, synthetic CSV fixtures and pytest.
5. Authenticated n8n delivery, retries, idempotency and importable workflows.
6. Analytics from stored records, security acceptance, UI review, deployment and full interview walkthrough.

The requested 19-step interview scenario becomes an acceptance script after these phases; it is not yet available end to end.
