# Architecture and delivery boundaries

SupportOps is an independent portfolio using synthetic data, not an official Crunchr product.

- `apps/web`: Next.js App Router, React, TypeScript, Tailwind, shadcn-style component source, Lucide. Server Actions validate inputs; SSR clients use user session cookies and the public Supabase key.
- `supabase`: PostgreSQL migrations, RLS, private evidence bucket, safe organization seed, transactional pgTAP tests.
- `services/diagnostics`: Phase 4 FastAPI/Pandas service.
- `automation/n8n`: Phase 5 authenticated outbox delivery.

## Phase 1 decisions

Update: password-free demo mode is now the default at the user's request. `/login` presents five fictional personas; a validated role cookie controls only the demo workspace. It never enters `requireUser`, creates a Supabase session, changes a database role, or uses privileged credentials. `SUPPORTOPS_AUTH_MODE=supabase` restores administrator-provisioned account login and disables the demo session endpoint. Future persistent demo workflows need a separate synthetic data implementation; the persona cookie must never be accepted as authorization for real Supabase records.

Identity is validated with Supabase Auth `getUser` on the server. Proxy refreshes session cookies. Every protected page and operation must independently authorize; proxy is not the authorization boundary. RLS uses database profiles and memberships, never editable JWT user metadata. Profiles and memberships have no client write grants. Accounts are provisioned by a trusted administrator. Customer Success is an internal role; the MVP internal team is trusted across organizations. Introduce scoped staff assignments before restricting CSM access to a customer subset.

Child records independently check ticket access and visibility. Diagnostic records are internal only; notification events are backend only. Storage reads join authorized attachment metadata, and the bucket is private. No upload policy is installed yet. File extension and MIME allowlists alone are not sufficient validation; Phase 2 must verify bytes before accepting uploads.

All application writes are denied in Phase 1. Phase 2 should add narrowly scoped RPCs for ticket creation, updates, status changes and assignment. Each mutation must atomically append activity and relevant notification events, and must derive actor/organization authorization from the session. No broad ticket UPDATE policy should be added. Customer resolution confirmation must be a distinct restricted operation. Investigation permissions differ from triage permissions.

Realtime is intentionally not enabled yet. Add only tested tables to the publication in Phase 3; verify customer isolation using authenticated clients. Never publish the notification outbox. Outbox retries and diagnostic failures must not roll back unrelated ticket operations.

Session plumbing follows the [Supabase SSR client guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client) and [Next.js Proxy convention](https://nextjs.org/docs/app/getting-started/proxy).

## Delivery status

Phase 1 source implemented; live Auth/RLS acceptance requires a configured Supabase instance and executing the database tests. Phases 2–6 remain unimplemented. The workspace page deliberately describes this boundary instead of presenting simulated tickets or metrics.
