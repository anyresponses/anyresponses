# AnyResponses

Multi-provider client that routes requests by model prefix. This README documents
provider configuration rules, supported providers, and routing behavior.

## Official links

- Website: https://www.anyresponses.com/
- Open Responses protocol: https://www.openresponses.org
- DeepWiki: https://deepwiki.com/anyresponses/anyresponses

## Quick install and usage

```bash
npm install anyresponses
```

```js
const { AnyResponses } = require("anyresponses");

const client = new AnyResponses({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY,
});

const response = await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Hello",
});
```

`input` can be a plain string or an Open Responses message array.

## Quick curl test (official gateway)

```bash
curl https://api.anyresponses.com/responses \
  -H "Authorization: Bearer $ANYRESPONSES_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "input": [{ "type": "message", "role": "user", "content": "Hello" }]
  }'
```

## Code structure

- `packages/core`: NPM package source code, already published to the official npm registry (see `packages/core/README.md`).
- `apps/gateway`: Official gateway service (Cloudflare Workers + Hono, see `apps/gateway/README.md`).
- `apps/frontend`: Official website frontend (Next.js via OpenNext on Cloudflare, see `apps/frontend/README.md`).

## Runtime and module format

- CommonJS only (`require`); no ESM build exported yet.
- No bundled TypeScript types.
- Requires a runtime with global `fetch` and `TextDecoder` (Node 18+ recommended; older Node needs polyfills).
- For `vertex`, WebCrypto (`crypto.subtle`) is required to sign JWTs.

## Connection methods

AnyResponses supports three connection paths. Pick the one that matches how you
want to supply credentials and routing rules.

### 1) Provider configs in code (constructor options)

```js
const { AnyResponses, PROVIDERS } = require("anyresponses");

const client = new AnyResponses([
  {
    provider: PROVIDERS.OPENAI,
    apiKey: process.env.OPENAI_API_KEY,
  },
  {
    provider: PROVIDERS.ANTHROPIC,
    apiKey: process.env.ANTHROPIC_API_KEY,
    id: "claude",
  },
]);

const response = await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: [{ type: "message", role: "user", content: "Hello" }],
});
```

### 2) Environment variables (auto or explicit)

```bash
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
```

```js
const { AnyResponses, PROVIDERS } = require("anyresponses");

const client = new AnyResponses();

const routedClient = AnyResponses.fromEnv(process.env, [
  {
    provider: PROVIDERS.OPENAI,
    id: "vendor_a",
    apiKey: process.env.OPENAI_VENDOR_A_API_KEY,
  },
]);
```

### 3) Official AnyResponses gateway

Set `ANYRESPONSES_API_KEY` (or pass `{ apiKey }` without `provider`) to send
requests to the hosted gateway at `https://api.anyresponses.com/responses`.
When this key is present, provider configs are ignored and the gateway accepts models **without a route prefix**.
If you include a route prefix (BYOK), the gateway will use your configured integration; otherwise the prefix is ignored.

```js
const { AnyResponses } = require("anyresponses");

const client = new AnyResponses({
  apiKey: process.env.ANYRESPONSES_API_KEY,
});

const response = await client.responses.create({
  model: "gpt-4o-mini",
  input: [{ type: "message", role: "user", content: "Hello" }],
  stream: true,
});
```

## Configuration rules

AnyResponses accepts either:

- An array of provider configs
- A single provider config object with a `provider` field

If you pass no options (or an empty array/object), AnyResponses will read
provider configs from environment variables.

Each provider config supports:

- `provider` (required): one of the supported providers listed below
- `id` (optional): route id to use in model strings
- `apiKey` (required for all providers in this list)
- `baseUrl` (optional): overrides the default endpoint
- Provider-specific fields (e.g. `region` for Bedrock, `version` for Anthropic)

Route id resolution:

- If `id` is provided, route id = `id`.
- If `id` is not provided, route id = `provider`.
- All route ids must be unique. Duplicate ids throw an error.

Examples:

```js
const { AnyResponses, PROVIDERS } = require("anyresponses");

// Array form
const client = new AnyResponses([
  {
    provider: PROVIDERS.OPENAI,
    id: "vendorA",
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
  },
  {
    provider: PROVIDERS.OPENAI,
    id: "vendorB",
    apiKey: process.env.OPENAI_API_KEY_2,
    baseUrl: process.env.OPENAI_BASE_URL_2,
  },
  {
    provider: PROVIDERS.ANTHROPIC,
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
]);

// Single object form
const client2 = new AnyResponses({
  provider: PROVIDERS.OPENAI,
  apiKey: process.env.OPENAI_API_KEY,
});
```

## Environment variables

When you do not pass options, AnyResponses builds provider configs from
environment variables. You can also construct a client directly from an env
object with `AnyResponses.fromEnv(env, options?)`. When both are provided,
options override env for the same route id.

Supported fields per provider:

- `API_KEY` (required to create a config)
- `BASE_URL` (optional)
- `REGION` (Bedrock only)
- `VERSION` (Anthropic only)

Default route id (no `id` provided):

```
OPENAI_API_KEY=...
OPENAI_BASE_URL=...
OPENAI_CHAT_API_KEY=...
ANTHROPIC_API_KEY=...
BEDROCK_API_KEY=...
BEDROCK_REGION=us-east-1
```

Multiple configs per provider (id derived from the env key, lowercased):

```
OPENAI_VENDOR_A_API_KEY=...
OPENAI_VENDOR_A_BASE_URL=...
OPENAI_VENDOR_B_API_KEY=...
```

Hugging Face supports either `HUGGINGFACE_API_KEY` or `HF_TOKEN`:

```
HUGGINGFACE_API_KEY=...
HF_TOKEN=...
```

Usage:

```js
const client = new AnyResponses();

await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: [{ type: "message", role: "user", content: "Hello" }],
});

await client.responses.create({
  model: "vendor_a/gpt-4o-mini",
  input: [{ type: "message", role: "user", content: "Hello" }],
});
```

Using an explicit env object:

```js
const { AnyResponses, PROVIDERS } = require("anyresponses");

const client = AnyResponses.fromEnv(process.env, [
  {
    provider: PROVIDERS.OPENAI,
    id: "vendor_a",
    apiKey: process.env.OPENAI_VENDOR_A_API_KEY,
  },
]);
```

## Routing rules

Requests are routed by the `model` prefix:

```js
await client.responses.create({
  model: "vendorA/gpt-4o-mini",
  input: [{ type: "message", role: "user", content: "Hello" }],
});
```

- The prefix before `/` is the route id.
- If you did not set `id`, the default route id is the provider name.
- Multiple configs can share the same provider as long as their route ids differ.

## Supported providers

Use `PROVIDERS` for enum-style selection:

```js
const { PROVIDERS } = require("anyresponses");
```

Examples (full list on https://www.anyresponses.com/providers):

- `openai` (responses endpoint)
- `anthropic` (messages endpoint)
- `bedrock` (AWS Bedrock runtime)
- `google` (Gemini)
- `openrouter` (routing gateway)
- `deepseek` (OpenAI-compatible chat)
- `huggingface` (router)
- `vertex` (GCP Vertex AI)

Notes:

- The `model` string in requests must include the route id prefix.
- For `vertex`, `privateKey` can be passed with escaped newlines (e.g. `\\n`).
