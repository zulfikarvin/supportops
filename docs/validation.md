# Phase 1 verification record

The environment had no pre-existing source files. Node 22 and npm 10 are available. PowerShell execution policy blocks npm.ps1, so commands use npm.cmd.

Docker CLI is installed, but no running engine is reachable. Therefore local Supabase migrations, pgTAP tests, storage policies and live authentication have not been executed. SQL tests are supplied, not certified as passing. No hosted Supabase credentials have been supplied.

Web verification completed on 2026-10-27:

- `npm.cmd run typecheck`: passed.
- `npm.cmd run test`: passed, 3 capability tests with Vitest 5.0.5.
- `npm.cmd run build`: passed with Next.js 16.4.3, including route generation and TypeScript.
- Dependency installation audit after upgrading Vitest: zero known vulnerabilities.
- `npm.cmd run lint`: passed with zero errors and zero warnings after correcting an export-style warning.

No browser interaction or live Auth integration test was performed. Database acceptance remains a separate required step before Phase 1 can be considered fully validated.

## Password-free demo update — 2026-10-28

- Six unit tests passed, including strict persona validation and disabling demo access outside demo mode.
- TypeScript passed.
- Lint and the production build passed.
- Local HTTP checks passed for all five role selections and corresponding persona pages, missing-session redirect, invalid-role rejection, cross-origin POST rejection, relative redirect preservation, and clearing the demo cookie through Exit demo.
- Demo role selection stores only a fictional persona cookie; no Supabase session or database access is created.

## Phase 2 core ticket implementation — 2026-10-28

Implemented both local persistent demo storage and Supabase RPC-backed ticket workflows. Sixteen automated tests passed, including disk reopening, customer isolation, role permissions, private evidence download denial, upload validation, PostgreSQL migration execution, transactional RPCs, RLS visibility, resolution/reopening/confirmation and sanitized unique outbox events. Embedded PostgreSQL tests stub the Auth/Storage service surfaces and do not constitute live Supabase acceptance.

The localhost HTTP smoke test passed through customer creation, analyst investigation and private note, engineering assignment/status, CSM public update, customer-visible filtering, private/public attachments, cross-organization denial, disguised upload rejection, resolution, customer confirmation and closed history. All four customer screens and the internal ticket screen returned HTTP 200; customer HTML contained no private test records.

Final checks passed: 16 tests across 4 files, ESLint with zero reported issues, TypeScript, and the Next.js production build. The build's broad-filesystem-tracing warning was corrected by scoping the SQLite path to `.data`. Node 22 still reports the expected experimental warning for its built-in SQLite API. Dependency installation audit reported zero known vulnerabilities.

Browser automation could not initialize because the runtime reported a sandbox setup refresh error. Visual interaction QA is therefore not verified. Docker also remains unavailable, so live Supabase Auth, Storage, signed URL behavior and the local pgTAP suite are not verified. No remote migrations were applied automatically.
