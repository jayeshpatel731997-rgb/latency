# Staging Deployment

Latency uses a Render Blueprint for the API and advertiser portal, plus a
separate Supabase staging project.

## Release gates

1. All CI checks pass.
2. Supabase migrations `001` through `004` are applied in order.
3. Supabase email/password authentication is enabled and the portal URL is an
   allowed redirect URL.
4. Render secrets are configured without committing their values.
5. `/api/health` and `/api/ready` both return HTTP 200.
6. Non-payment end-to-end checks pass.

## Supabase variables

Backend only:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (legacy `SUPABASE_ANON_KEY` is supported)
- `SUPABASE_SECRET_KEY` (legacy `SUPABASE_SERVICE_ROLE_KEY` is supported)

Portal build:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Never place the secret/service-role key in a `VITE_*` variable or VS Code
extension setting.

## Render

The root `render.yaml` creates `latency-api-staging` and
`latency-portal-staging` on free staging plans. Fill every `sync: false`
variable in the Render Dashboard before applying the Blueprint.

Blueprint URL:

`https://dashboard.render.com/blueprint/new?repo=https://github.com/jayeshpatel731997-rgb/latency`

## Rollback

- Render: redeploy the last known-good Git commit.
- Portal: redeploy the previous static build.
- Database: migrations are forward-only. Take a Supabase backup before schema
  deployment and use a reviewed forward-fix migration rather than dropping
  user or accounting data.
