# AnyResponses frontend

Marketing site + docs UI for AnyResponses, built with Next.js and deployed to Cloudflare via OpenNext.

## Tech stack

- Next.js App Router + React
- OpenNext Cloudflare runtime adapter
- Tailwind CSS
- Wrangler for Cloudflare deploys

## Project structure

- `src/app`: pages, API routes, and UI components
- `src/app/docs/content`: markdown sources for docs pages
- `public/docs`: static docs assets
- `src/data/providers.json`: provider metadata used across the site

## Development

From the repo root:

```bash
pnpm -C apps/frontend dev
```

From within `apps/frontend`:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Preview (Cloudflare runtime)

```bash
npm run preview
```

## Deploy

```bash
npm run deploy
```

## Environment configuration

The site can render without env vars, but API routes for auth, billing, and integrations require them.

Core:
- `MY_DB` (D1 binding)
- `AUTH_SECRET` (session signing)

Auth (optional, supports GitHub + Google login):
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- `AUTH_BASE_URL` (optional override for callback URLs)
- `AUTH_SESSION_MAX_AGE` (optional)

Billing (optional):
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

BYOK integrations (optional):
- `BYOK_ENCRYPTION_KEY` (base64url-encoded 32-byte key)

## Database schema

Use the shared schema at `db/schema.sql` for the D1 database.

## Type generation

```bash
npm run cf-typegen
```
