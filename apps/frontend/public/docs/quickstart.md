## Quickstart
AnyResponses is a routing client that keeps responses aligned with the Open
Responses protocol, so you can switch providers without rewriting your parsing
logic. Learn more about the spec at
[openresponses.org](https://www.openresponses.org/).

## Install
Use your package manager of choice.

```bash
npm install anyresponses
```

```bash
pnpm add anyresponses
```

## Choose a call path
Pick the integration mode that matches how you want to supply credentials.

- [Custom provider keys](/docs/custom-provider-keys): configure providers in code or env and route by prefix.
- [Official gateway key](/docs/gateway-anyresponses-key): one AnyResponses key, hosted models only.
- [Gateway BYOK](/docs/gateway-byok): use the official gateway with an Integration ID prefix.

## First request (custom provider keys)
Use your own provider key and a prefixed model id.

```javascript
const { AnyResponses, PROVIDERS } = require("anyresponses");

const client = new AnyResponses({
  provider: PROVIDERS.OPENAI,
  apiKey: process.env.OPENAI_API_KEY,
});

const response = await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: [{ type: "message", role: "user", content: "Hello" }],
});

console.log(JSON.stringify(response, null, 2));
```

## First request (official gateway key)
Use your AnyResponses key and a model id from the hosted catalog.

```javascript
const { AnyResponses } = require("anyresponses");

const client = new AnyResponses({
  apiKey: process.env.ANYRESPONSES_API_KEY,
});

const response = await client.responses.create({
  model: "gpt-4o-mini",
  input: [{ type: "message", role: "user", content: "Hello" }],
});

console.log(JSON.stringify(response, null, 2));
```

## First request (gateway BYOK)
After enabling BYOK in [Integrations](/integrations), call the gateway with your
AnyResponses key and a prefixed model id using your Integration ID.

```javascript
const { AnyResponses } = require("anyresponses");

const client = new AnyResponses({
  apiKey: process.env.ANYRESPONSES_API_KEY,
});

const response = await client.responses.create({
  model: "my-integration-id/gpt-4o-mini",
  input: [{ type: "message", role: "user", content: "Hello" }],
});

console.log(JSON.stringify(response, null, 2));
```

## Read the output
All providers are normalized into the Open Responses response shape, so you can
inspect the full response object directly.

```javascript
console.log(JSON.stringify(response, null, 2));
```

## Next steps
- [Custom provider keys](/docs/custom-provider-keys)
- [Official gateway key](/docs/gateway-anyresponses-key)
- [Gateway BYOK](/docs/gateway-byok)
- [API parameters](/docs/api-parameters)
- [Official acceptance tests](/docs/official-tests)
