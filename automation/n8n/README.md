# Automation (Phase 5)

Deferred at the user's request during study-case integration. Do not install or configure n8n for the current application. Outbox rows remain persisted, but no email or webhook delivery runs.

The database reserves a backend-only notification outbox with unique idempotency keys. Delivery workers and importable workflows are not implemented in Phase 1. They must use authenticated webhooks, retry delivery independently of ticket operations, and avoid raw HR data in payloads.
