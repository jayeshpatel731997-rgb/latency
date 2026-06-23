# Latency

Latency is an opt-in VS Code extension that shows sponsored content during
supported AI-tool wait periods. The repository also contains an authenticated
advertiser portal and a Supabase-backed API.

## Repository layout

- `src/`: VS Code extension
- `backend/`: Express API and Supabase access
- `backend/migrations/`: ordered database migrations
- `portal/`: React/Vite advertiser portal
- `docs/`: deployment, operations, and privacy notes
- `render.yaml`: staging infrastructure Blueprint

## Local development

Install each package:

```sh
npm install
npm install --prefix backend
npm install --prefix portal
```

Create local environment files from `backend/.env.example` and
`portal/.env.example`. Never put a Supabase secret/service-role key in the
portal or extension.

Run the API and portal:

```sh
npm run dev --prefix backend
npm run dev --prefix portal
```

Press `F5` in VS Code to launch the Extension Development Host. Latency remains
off until `Latency: Enable Sponsored Wait Screens` is run.

## Verification

```sh
npm run compile
npm run build --prefix backend
npm run build --prefix portal
npm test
npm run package
```

CI also applies every migration to disposable PostgreSQL and runs the atomic
accounting smoke test.

## Billing

Payment funding is intentionally disabled. No Razorpay account or live billing
credentials are required for staging. Optional staging credits are controlled
by `STAGING_INITIAL_WALLET_PAISE`; production always ignores that value.

See [staging deployment](docs/DEPLOYMENT.md), [operations](docs/RUNBOOK.md), and
[privacy](docs/PRIVACY.md) for release details.
