# Phase 2 interview walkthrough

Start `npm.cmd run dev` from the repository root, then open http://localhost:3000/login. No environment configuration is needed for the local synthetic demo.

1. Choose **Customer**. The customer can see only Atlas Industries tickets.
2. Select **Report an issue**. Use a title such as “Latest synthetic employee upload failed”. Pick Data Upload Failure, describe the error, and submit. Optional evidence must be sanitized and below 5 MB; a full employee dataset is unnecessary.
3. The ticket opens as **Reported**. Note its SUP number. Return to the ticket table and try title/status/category filters.
4. Use **Switch role** → **Technical Support Analyst**. Open the same ticket from Ticket management. Northstar and Meridian demo tickets are visible here too.
5. Change status to **Investigating**, with a customer-friendly explanation. Add an **Internal note** containing a hypothesis and an investigation step. This is not a confirmed diagnosis.
6. Set priority and assign **Data Engineering** and Jordan Chen. Optional internal evidence is restricted to internal teams.
7. Switch to **Data Engineer**. Open the shared ticket, add findings as a private note, then choose **Fix in Progress**.
8. Switch to **Customer Success Manager** and publish a **Public update**. This role can communicate but cannot change investigation controls.
9. Switch back to **Customer**. Verify the public update and status events are visible. The internal notes and evidence must be absent. Send a reply or attach a sanitized sample.
10. Switch to Data Engineer or Support. Record restoration method, recovery verification and closure evidence in **Verify service restoration**, then enter a resolution summary and mark **Resolved**.
11. Optional: Support may reopen a resolved ticket by choosing Investigating. Reopening increments a stored counter and keeps the previous history.
12. Return to Customer and choose **Confirm resolution**. The ticket becomes **Closed** and the history remains readable. Closed tickets cannot be edited.
13. Restart the server and reopen the ticket. Its history remains in `apps/web/.data/supportops.sqlite`.

All displayed metrics are computed from stored tickets. Notification events are stored but not delivered; n8n is deferred. The subsequent study-case integration adds Python diagnostics, reports, Problem/improvement records and automatic refresh; see `docs/study-case-integration.md` for the complete workflow. A disputed or reopened incident requires a fresh recovery verification before resolving again.

## Automated smoke test

With the demo server running:

```powershell
node scripts/smoke-phase2.mjs
```

This creates and preserves one synthetic acceptance ticket, switches personas through request cookies, tests API and rendered-page visibility, validates downloads and rejects unauthorized changes.

## Supabase mode

Apply `202610280001_ticket_operations.sql` with `npx.cmd supabase db push` after the foundation migration. Set `SUPPORTOPS_AUTH_MODE=supabase`, configure the public URL/key and provision accounts per the README. Set the server-only `SUPABASE_SECRET_KEY` for validated evidence uploads. Without that key, other ticket operations work but uploads return a setup error. Do not enable anonymous role selection against the real database.

The SQL/RLS tests use embedded PostgreSQL with stubbed Supabase Auth and Storage tables. Live Supabase password login, object upload, signed URLs and pgTAP still require service-level acceptance before deployment.
