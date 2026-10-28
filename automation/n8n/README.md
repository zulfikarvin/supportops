# Automation (Phase 5)

The database reserves a backend-only notification outbox with unique idempotency keys. Delivery workers and importable workflows are not implemented in Phase 1. They must use authenticated webhooks, retry delivery independently of ticket operations, and avoid raw HR data in payloads.
