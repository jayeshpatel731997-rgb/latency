# Latency

Latency is a VS Code extension scaffold for latency tooling.

## Development

Install dependencies and compile the extension:

```sh
npm install
npm run compile
```

The extension activates after VS Code finishes starting.

## Backend

The backend requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and a server-only
`SUPABASE_SERVICE_ROLE_KEY`. Never expose the service-role key to the extension
or advertiser portal.

Apply the SQL files in `backend/migrations` in numeric order before starting
the backend.
