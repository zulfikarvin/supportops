# Role-based internal workspaces

The existing `/workspace` route selects the dashboard from the server-authorized actor role. Demo personas remain separate from Supabase authentication; the demo-session endpoint stays disabled in Supabase mode. No new schema fields or integrations are required for these dashboards.

All incident KPIs exclude `service_request` records and treat `Resolved` and `Closed` as terminal. Service requests remain accessible through Ticket Queue. An employee assignment takes precedence over the accountable triage owner; the triage owner is used only when no employee is assigned. Team workspaces include open incidents assigned to that team or owned by the logged-in employee.

| Role | KPI definitions |
| --- | --- |
| Customer Success Manager | Open authorized incidents; unique incidents needing a reply, configured cadence update, or initial high-priority communication; open high/critical incidents; resolved incidents without customer confirmation. |
| Technical Support Analyst | Reported incidents; open incidents assigned to the logged-in analyst; open high/critical incidents; Escalated incidents with no specialist team assigned. |
| Data Engineer | Open incidents assigned to Data Engineering or the logged-in engineer; assigned incidents categorized as Data Upload Failure; assigned high/critical incidents; assigned incidents in Monitoring. |
| Product & Tech | Assigned open Product Bug incidents; those without reproduction steps before fixing/monitoring or waiting for the customer; assigned incidents in Fix in Progress; assigned incidents in Monitoring. |

Communication deadlines are calculated only from an existing triage record's `update_cadence_minutes`. The deadline starts from the later of policy-record creation and the latest public staff message. Customer messages and internal notes do not reset that deadline. No SLA or account-owner assignment is inferred. Latest public customer replies are identified using stored profile roles. High-priority incidents with no public staff message need an initial update, without an invented deadline.

The CSM dashboard intentionally displays public communications only. Technical feeds display authorized public and internal events, clearly labeled. Supabase RLS remains in effect; the dashboard service and pure model additionally reject customers. Customer dashboards continue to use separate public-only queries. Ticket, record, profile, and activity reads are paginated so dashboard counts are not limited to the first Supabase response page.

Diagnostics display actual stored sample identifiers, validation failures, and timestamps. They do not establish a root cause. Source integrations, last successful imports, live pipeline health, and account ownership have no dedicated fields in the current model and are omitted. Product reproduction, components, linked incidents, Problems, and improvements appear only when records exist. Monitoring is the existing status used for awaiting verification; no new workflow states were introduced.

Dashboard queue previews show up to five incidents; attention previews show up to eight with the full count. All View All links lead to the existing Ticket Queue. Ticket rows open the existing detail and Investigation Workspace. Insights & Improvement and automatic refresh are preserved; no refresh-status label or second polling mechanism is added.
