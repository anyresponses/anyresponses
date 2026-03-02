# anyresponses

The Universal Gateway making every model speak the Open Responses standard.
This README covers the core NPM package; see `README.md` in the repo root for full routing rules and provider details.

## Official links

- Website: https://www.anyresponses.com/
- Open Responses protocol: https://www.openresponses.org

## Install

```bash
npm install anyresponses
```

## Usage

`input` can be a plain string or an Open Responses message array.

### Custom providers

```js
const { AnyResponses } = require("anyresponses");

const client = new AnyResponses([
  {
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY,
  },
  {
    provider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
]);

const response = await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Hello from AnyResponses",
});

console.log(response);
```

### AnyResponses gateway

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
  input: "Hello",
});

console.log(response);
```

### Gateway BYOK

```js
const { AnyResponses } = require("anyresponses");

const client = new AnyResponses({
  apiKey: process.env.ANYRESPONSES_API_KEY,
});

const response = await client.responses.create({
  model: "my-integration-id/gpt-4o-mini",
  input: [{ type: "message", role: "user", content: "Hello" }],
});

console.log(response);
```

## Env

- Official API key: `ANYRESPONSES_API_KEY`

## Runtime and module format

- CommonJS only (`require`); no ESM build exported yet.
- No bundled TypeScript types.
- Requires a runtime with global `fetch` and `TextDecoder` (Node 18+ recommended; older Node needs polyfills).
- For `vertex`, WebCrypto (`crypto.subtle`) is required to sign JWTs.

## Exports

- `AnyResponses`
- `PROVIDERS`
