# Staff roles cannot open the hosted dashboard

The live database returned `PGRST205` for `public.case_records`: the study-case migration was missing. Role authentication succeeded; staff dashboards need investigation records that the customer dashboard does not query.

1. Open **SupportOps Development** in Supabase. Confirm this is the project configured in Vercel's `NEXT_PUBLIC_SUPABASE_URL`.
2. Open **SQL Editor → New query**.
3. Copy the entire contents of [hosted-staff-workspace.sql](../supabase/repairs/hosted-staff-workspace.sql) into the editor and click **Run**.
4. Refresh SupportOps, then select each staff role.

The repair first installs ticket operations if missing, then applies the missing study-case tables and workflow RPC, updates evidence MIME types, and refreshes the API schema cache. It runs in one transaction, preserves existing accounts and tickets, and can be run again. The foundation migration must already exist. The repair also supports databases where ticket operations were already installed; partially installed operations are rejected for inspection. No Vercel environment change is needed to repair the database.

Afterward, test a customer report → analyst triage → Data Engineering investigation → Product & Tech escalation if needed → verified resolution → customer confirmation. Customer Success can follow public progress throughout.

If you previously saw `Apply the foundation and ticket_operations migrations first`, copy the latest version of the repair from GitHub and run the entire file again. The earlier attempt stopped before making changes. If SQL Editor reports an aborted transaction, run `ROLLBACK;` first, then run the repair.
