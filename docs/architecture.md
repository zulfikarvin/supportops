# Architecture and delivery boundaries

SupportOps is an independent portfolio using synthetic data, not an official Crunchr product.

- `apps/web`: Next.js App Router, React, TypeScript, Tailwind, shadcn-style component source, Lucide. Ticket route handlers validate inputs and request origins; SSR clients use user session cookies and the public Supabase key.
- `apps/web/.data`: ignored SQLite database for the local synthetic demo. Ticket mutations, activity and notification events are committed together. Evidence bytes are stored as private database blobs.
- `supabase`: PostgreSQL migrations, RLS, private evidence bucket, safe organization seed, transactional pgTAP tests.
- `services/diagnostics`: Phase 4 FastAPI/Pandas service.
- `automation/n8n`: Phase 5 authenticated outbox delivery.

## Phase 1 decisions

Update: password-free demo mode is now the default at the user's request. `/login` presents five fictional personas; a validated role cookie controls only the demo workspace. It never enters `requireUser`, creates a Supabase session, changes a database role, or uses privileged credentials. `SUPPORTOPS_AUTH_MODE=supabase` restores administrator-provisioned account login and disables the demo session endpoint. Future persistent demo workflows need a separate synthetic data implementation; the persona cookie must never be accepted as authorization for real Supabase records.

Identity is validated with Supabase Auth `getUser` on the server. Proxy refreshes session cookies. Every protected page and operation must independently authorize; proxy is not the authorization boundary. RLS uses database profiles and memberships, never editable JWT user metadata. Profiles and memberships have no client write grants. Accounts are provisioned by a trusted administrator. Customer Success is an internal role; the MVP internal team is trusted across organizations. Introduce scoped staff assignments before restricting CSM access to a customer subset.

Child records independently check ticket access and visibility. Diagnostic records are internal only; notification events are backend only. Storage reads join authorized, completed attachment metadata. The bucket is private. Uploads validate extension and file bytes, enforce a 5 MB limit, and authorize access before persistence. In Supabase mode the backend reserves metadata through the user's RPC, uploads validated bytes with a server-only secret key, then marks the file ready. Clients have no storage INSERT grant. Downloads require fresh authorization and use short-lived signed download URLs. Demo files are served as attachment downloads after equivalent access checks.

Phase 2 adds narrow security-definer RPCs for ticket creation, updates, status changes, assignments, confirmation and attachment metadata. Direct client table writes remain denied. Each business mutation locks the ticket and atomically appends activity and relevant sanitized outbox events. Actor and organization authorization come from the session, never request-supplied roles. Support can triage and assign; technical teams can investigate; CSMs can communicate and add private notes. Only an authorized customer can confirm resolution and close a ticket. Reopening increments a counter while preserving status history.

The local demo implements the same permission model in a separate SQLite store. Its persona cookie deliberately grants access to fictional records only. Demo sessions are intentionally shared across visitors selecting the same role. It must not be connected to sensitive or live data. The local SQLite implementation requires Node 22.17+ and persistent disk and cannot be deployed durably on Vercel serverless. Supabase mode is the supported Vercel configuration.

Realtime is intentionally not enabled yet. Add only tested tables to the publication in Phase 3; verify customer isolation using authenticated clients. Never publish the notification outbox. Outbox retries and diagnostic failures must not roll back unrelated ticket operations.

Session plumbing follows the [Supabase SSR client guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client) and [Next.js Proxy convention](https://nextjs.org/docs/app/getting-started/proxy).

## Delivery status

The 31 October 2026 study-case integration adds typed case records for triage, investigation, restoration, diagnostics, reviewed reports, Problems and improvements. Version snapshots and report-download audit logs are internal-only. Customers can read only published customer reports belonging to their organization, including the PDF route. Report publication is a distinct approval gate; Problems and preventive actions do not block incident recovery or closure.

Python FastAPI/Pandas diagnostics run in a separate authenticated service. Next.js authorizes technical roles and evidence before invoking it; sample values are not persisted in diagnostic summaries. Demo views poll authorized ticket changes every five seconds. Supabase subscribes only to RLS-protected public ticket rows, with polling fallback; private case/report/diagnostic tables stay out of the publication. n8n delivery is explicitly deferred.

Core tickets and the study-case features above are implemented and covered by local tests. Live Supabase Auth, Storage, signed URLs and WebSocket delivery still require a configured instance. Visual interaction/accessibility review and hosted deployment acceptance remain outstanding. No n8n service is required. See `docs/study-case-integration.md` for scope, policy differences and the updated demonstration.
