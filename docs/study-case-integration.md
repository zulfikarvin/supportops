# Study-case integration and verification

Reference: the user-supplied `SupportOps_CruncHR_Study_Case_ITIL4.docx`, version 1.1, dated 30 October 2026. It is a proposed design and supplies requirements, not proof that features already work. The user's current instruction explicitly defers n8n. The existing password-free synthetic demo remains separate from Supabase authentication.

## Requirement mapping

| Study-case requirements | Implementation |
| --- | --- |
| FR-01–14, FR-18–19 | Existing ticket workflow plus accountable ownership, restoration verification and customer dispute/reopening. |
| FR-15–17 | Authenticated FastAPI/Pandas diagnostic service; explicit sample approval; deterministic failures and unverified cause hypotheses; sanitized results tied to source evidence. |
| FR-20–23 | Deterministic source-grounded customer/internal drafts, separate review states, version snapshots, reviewer notes, immutable publication and authorized downloadable PDFs. |
| FR-24–27 | Stored-data analytics, strict evidence-based recurring groups, Problem links and sequential improvement approval/implementation/monitoring/verification. |
| FR-28 | Existing transactional notification outbox retained. No email/webhook delivery added. |
| FR-29 | Deferred per user instruction. No n8n dependency. |
| FR-30 | Existing immutable ticket events, append-only case snapshots and report-download audit records. |
| FR-31–33 | Incident/service-request intake and support triage, impact × urgency priority, named owner/major-incident lead and update cadence, internal major-incident queue. No contractual SLA is implied. |
| FR-34–37 | Independent Problem/known-error records, verified restoration evidence and controlled improvement/change records linked to Problems. Incident closure does not depend on finishing prevention work. |

The app uses a typed `case_records` envelope rather than separate tables for each design entity. `kind` identifies triage, investigation, restoration, diagnostic, report, Problem or improvement. Server schemas and PostgreSQL RPCs enforce the lifecycle; `case_record_versions` retains revisions. Related incidents are explicit UUID links in Problem data. This keeps the portfolio implementation small while preserving independent lifecycles.

## Privacy and decision boundaries

- Customer queries receive only published customer reports, never case drafts, investigation findings, diagnostics, internal reviews, private version history or Problems/actions. Report download authorization is checked afresh and recorded.
- Customer report drafts use public ticket facts and restoration evidence. Private investigation content is excluded automatically. Human review and redaction are still mandatory because free-text public evidence can contain unsuitable material.
- A diagnostic confirms defects in a sample, not the complete customer incident root cause. Analysts explicitly record evidence before confirming a cause.
- Recurrence requires exact normalized category, cause category, confirmed cause, component and error code with evidence. Similar complaint text is insufficient. Service requests are excluded from incident analytics.
- Resolution duration uses the latest stored resolved_at minus created_at for the selected creation cohort. Reopened unresolved tickets are excluded from duration calculations. Reopen rate includes currently resolved or previously reopened records in the same cohort.
- Before/after follow-up uses seven-day windows and recorded implementation time. Incomplete windows are labeled; raw counts lack exposure-volume normalization and do not establish causation.
- Major-incident leads/cadence are tracked in-app. Notification dispatch, commercial SLAs, external remediation and deployment into real HR systems are not implemented.
- The internal MVP policy continues to allow provisioned staff across tenants. Team views filter queues; assignment-scoped access for specialists and scoped CSM portfolios would require an additional policy migration.

## Test strategy and limits

Vitest tests execute SQLite persistence and the real PostgreSQL migrations in PGlite, with stubbed Supabase Auth/Storage surfaces. Negative tests cover report draft privacy, reviewer roles, unchanged approved publication, improvement evidence and role escalation. Pytest covers deterministic CSV failures, malformed/oversized input and service authentication. Local smoke tests exercise both running services, actual Python findings, PDFs and the customer-to-improvement lifecycle.

Live Supabase Auth, object storage, signed URLs, WebSocket delivery, visual interaction/accessibility and Vercel deployment remain separate acceptance tasks. No production certification is asserted. The source study-case document is not modified or committed into the repository.

## Demonstration

1. Start both services with `npm.cmd run dev:full` after installing dependencies.
2. Open `/login` and enter as Customer. Report a synthetic failed upload and business impact.
3. As Support, classify the incident, assess impact/urgency, select an accountable owner and name a lead if critical.
4. Run the missing-column fixture. Record the confirmed sample defect separately from root-cause hypotheses and complete investigation checklist items.
5. Assign Data Engineering. As Data Engineer, investigate the export mapping and run the valid corrected fixture. As Product & Tech, record reproduction steps or a product contribution. CSM publishes customer-safe progress.
6. Record service restoration, the verified workaround/fix and closure evidence. Resolve; the customer can dispute or confirm recovery.
7. Generate both report drafts. Support/CSM reviews and approves; publish only the reviewed customer report. Verify customer download and private-report denial.
8. Keep a separate Problem open after incident closure. Propose, approve, implement and monitor a linked preventive change; verify only with follow-up evidence.
9. Add an independently evidenced repeated incident. Inspect the recurring-pattern group and follow-up limitations in Problems & improvement.

`node scripts/smoke-study-case.mjs` performs this synthetic sequence and preserves the records for inspection. It creates a planned SSO request too, demonstrating incident/request separation.
