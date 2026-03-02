# anyresponses gateway

Cloudflare Workers gateway using Hono.
Implements the Open Responses `/responses` endpoint and forwards requests to providers.

## Tech stack

- Cloudflare Workers (runtime, edge deploys)
- Hono (HTTP routing)
- D1 (SQLite) for API keys, integrations, routing rules, logs, billing
- Cloudflare Analytics Engine (usage analytics, optional)
- `anyresponses` core package for provider adapters

## Configuration

Gateway configuration is via Wrangler (`apps/gateway/wrangler.jsonc`):

- Provider credentials and base URLs (see Supported providers below).
- `BYOK_ENCRYPTION_KEY` (optional): base64url-encoded 32-byte key for decrypting BYOK options stored as `enc:v1:*`.
- `MY_DB` D1 binding: required.
- `USAGE_ANALYTICS_ENGINE` binding: optional for usage analytics.

## Supported providers

Each provider maps to a full endpoint URL. Configure the required environment variables below.

Examples (full list on https://www.anyresponses.com/providers):

- `openai` (`OPENAI_API_KEY`, `OPENAI_BASE_URL`)
- `anthropic` (`ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_VERSION`)
- `bedrock` (`BEDROCK_API_KEY`, `BEDROCK_BASE_URL`, `BEDROCK_REGION`)
- `google` (`GEMINI_API_KEY`, `GEMINI_BASE_URL`)
- `openrouter` (`OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`)
- `deepseek` (`DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`)
- `huggingface` (`HF_TOKEN` or `HUGGINGFACE_API_KEY`, `HUGGINGFACE_BASE_URL`)
- `vertex` (`VERTEX_CLIENT_EMAIL`, `VERTEX_PRIVATE_KEY`, `VERTEX_PROJECT`, `VERTEX_LOCATION`, `VERTEX_BASE_URL`)

## Database (D1)

- Schema lives in `db/schema.sql`.
- Create/apply it with Wrangler (example):

```bash
wrangler d1 execute anyresponses --file db/schema.sql
```

Required seed data for the gateway to accept requests:

- `users`: must exist, `credits` must be > 0.
- `api_keys`: must exist and link to a user.
- `routing_rules`: required when requests use **no** route prefix.
- `integrations`: required when using BYOK route prefixes (one row per integration id).

Optional seed data:

- `models`: used by other apps (seed if you need model metadata).

Example (minimal local test data):

```sql
INSERT INTO users (id, email, name, credits, created_at)
VALUES ('u_1', 'dev@example.com', 'Dev', 1000000000, strftime('%s','now'));

INSERT INTO api_keys (id, user_id, name, api_key, created_at)
VALUES ('k_1', 'u_1', 'local', 'local-test-key', strftime('%s','now'));

INSERT INTO routing_rules (id, model_id, routes_json, created_at)
VALUES (
  'r_1',
  'gpt-4o-mini',
  '[{"provider":"openai","model":"gpt-4o-mini"}]',
  strftime('%s','now')
);
```

Notes:

- `*_BASE_URL` should include the full endpoint path (no suffix config).
- Use provider `openai-chat`, `deepseek`, `aliyun`, `minimax`, or `moonshot` to call chat completions endpoints.
- Bedrock requests use `Authorization: Bearer` and hit `/model/{model}/converse` (or `/converse-stream` when streaming).
- Gemini streaming derives the stream URL by replacing `:generateContent` with `:streamGenerateContent`.
- Vertex uses service account credentials; `VERTEX_PRIVATE_KEY` can be passed with escaped newlines (for example `\\n`).
- If `integrations.options_json` contains encrypted values (`enc:v1:*`), set `BYOK_ENCRYPTION_KEY`; otherwise store plain values.

## Development

```bash
pnpm -C apps/gateway dev
```

## Deploy

```bash
pnpm -C apps/gateway deploy
```
