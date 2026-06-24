# Operations Runbook

## Health

- `GET /api/health`: process liveness.
- `GET /api/ready`: Supabase connectivity and schema readiness.

Render should use `/api/health` for automatic health checks. Alert on repeated
5xx responses, readiness failures, or process restarts. Request logs are JSON
and include request ID, route, status, and duration without bodies or tokens.

## Common failures

### `PGRST202` for `record_ad_impression`

Migration `003_atomic_impression_accounting.sql` is missing. Apply all pending
migrations and retry `/api/ready`.

### RLS or permission errors

Confirm the backend has `SUPABASE_SECRET_KEY` (or the legacy service-role key).
Do not weaken RLS or grant table access to browser roles.

### Portal authentication loops

Confirm the portal URL is listed in Supabase Auth redirect URLs and the portal
was built with the staging publishable key.

## Incident response

1. Disable Render auto-deploy if a bad release is propagating.
2. Preserve request IDs and relevant Render/Supabase logs without copying
   credentials or full request bodies.
3. Redeploy the last known-good commit.
4. Rotate an exposed key in Supabase, update Render, and redeploy.
5. Document impact and add a regression test before reopening deployment.
