# Password-free portfolio on Vercel

Use `SUPPORTOPS_AUTH_MODE=portfolio` for the public SupportOps portfolio. Reviewers see the existing five-role picker, enter with one click, and switch roles from the workspace. They never enter an email address or password, create an account, or open a magic link.

## Vercel configuration

Set these Production environment variables and redeploy the latest `main` branch:

```text
SUPPORTOPS_AUTH_MODE=portfolio
NEXT_PUBLIC_SUPABASE_URL=<hosted-project-url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
SUPABASE_SECRET_KEY=<server-only-secret-key>
```

Keep the existing Supabase values. Change only `SUPPORTOPS_AUTH_MODE` from `supabase` to `portfolio`. Do not use `demo` on Vercel: that mode uses a local SQLite file. The portfolio mode uses the existing Supabase database, Storage, RPCs, and RLS, so tickets and evidence persist across role switches and deployments. The usual five application migrations must already be installed; this feature adds no migration. Python diagnostics keeps the existing separate URL/token configuration.

## How it works

On the first role selection the server ensures five fixed synthetic Auth identities exist, creates their role profiles, and gives the Customer membership in Atlas Industries. Their reserved UUIDs start with `50000000`; their reserved addresses use `@demo.supportops.example`. Existing provisioned users are not repurposed or modified. The owner picker shows the portfolio personas to avoid duplicate names from earlier test accounts.

The server generates a one-time sign-in token for the chosen fixed identity and consumes it immediately using the regular Supabase session client. No email is sent. The one-time token and server key never appear in URLs or browser responses. All subsequent ticket requests use that user's Supabase session and existing RLS. A local demo-role cookie cannot change a hosted user's permissions. Refresh and Realtime keep using the actual session.

All visitors can deliberately use any of these five portfolio roles and share the synthetic demonstration data. Use this mode with the fictional study-case project, not confidential operational data. The Customer remains limited to its organization and cannot read private technical notes. Exiting the demo signs out only that browser session, so other reviewers using the same persona stay signed in.

`SUPPORTOPS_AUTH_MODE=supabase` retains the separate provisioned email/password experience and disables public role selection. `SUPPORTOPS_AUTH_MODE=demo` retains the original local SQLite experience.

## Acceptance checks

1. Open `/login` in an incognito window: five roles appear and no credential fields are displayed.
2. Enter Customer, create a synthetic ticket, and attach a small image/PDF.
3. Switch to Support, find that same ticket, assess it, and assign a portfolio engineer.
4. Switch through Data Engineering, Product & Tech, and CSM; verify the expected dashboards and actions.
5. Return to Customer: the ticket remains, public updates appear, and private notes stay hidden.
6. Exit the demo and re-enter: the stored records remain.

If role selection returns to `/login?error=portfolio`, check Vercel function logs. The server logs a setup stage (configuration, personas, identity, profiles, organization, membership, link, or session), never a credential. Confirm the three Supabase environment values belong to the same project and the server key is valid. Email authentication must remain enabled; public signup does not need to be enabled.
