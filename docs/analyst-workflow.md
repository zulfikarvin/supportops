# Simplified analyst ticket workflow

Data Engineering uses the same focused components and transactional actions, with a different first step: **Review & diagnose → Record findings & progress → Verify & resolve**. Support's priority and assignment are read-only. Engineers can start investigation with one click, optionally validate approved CSV samples, and see saved findings without copying results into another form. Findings default to staff-only visibility. The final step reuses the fix and verification inputs exactly as described below. Public/private timelines and optional tools stay in the sticky right sidebar. Diagnostic history remains readable after resolution and closure. No additional migration is needed beyond the simplified workflow migration already listed here.

The analyst ticket page has one main work column and three normal actions. On desktop, the customer timeline, private notes, and optional tools occupy a sticky right sidebar with independent scrolling. Smaller screens stack these panels below the main work. Existing records, customer confirmation, staff permissions, public/private updates, evidence previews, reports, diagnostics, and prevention features remain available.

| Action | Enter once | What saves together |
| --- | --- | --- |
| Assess & assign | Customer impact (prefilled from the report), impact level, urgency, one owner | Triage record, calculated priority, accountable owner, assigned employee, inferred team, and Reported → Triaged |
| Post an update | One message, audience, optional status change | One public/private message and the status change; no second explanation box |
| Resolve ticket | What fixed it, how recovery was verified, verification confirmation | Restoration record, actual save time, resolution summary, and Resolved status |

Priority is derived from impact and urgency; there is no second editable priority selector. The selected owner fills both the accountable-owner and employee assignment fields. The person's provisioned role determines their team. Editing a legacy ticket with separate accountable and assigned owners makes this choice explicit in the Owner selector, initially populated from the assigned employee.

The existing report description prefills customer impact if no assessment exists. This is source text for the analyst to review, not an inferred impact assessment. Classification, major-incident coordination, and the communication interval are under optional settings. Critical incidents still require a named lead.

The fix text is used as both the customer-safe resolution summary and restoration method. The verification text explicitly includes the test, result, and supporting evidence/reference; it supplies both the existing verification-result and closure-evidence fields. No successful test or checkbox is fabricated. Restoration time is recorded at submission. Reopened incidents require fresh verification before resolving again. Only the customer confirms closure.

Advanced investigation details, approved-sample diagnostics, evidence upload, Problems, prevention actions, and history are collapsed optional tools. Reports appear for analysts once the ticket is resolved or closed and remain subject to review and publication controls. Specialists and CSM keep their existing role permissions.

Focused actions use `/api/tickets/[id]/workflow`. SQLite wraps their existing mutations in one transaction; Supabase uses `202611010002_simplified_ticket_workflow.sql`. Both reject stale ticket timestamps, and record edits additionally check versions. A failed assignment or status update rolls back the entire combined action. Existing low-level authorized APIs remain available.

For an existing Supabase deployment, apply the workflow migration through SQL Editor or the normal migration process before using the combined actions. Local demo mode needs no setup.
