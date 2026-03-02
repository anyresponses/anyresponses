## Overview
AnyResponses uses provider ids as routing prefixes. The prefix before the slash
in `model` selects the provider config.

- Full catalog: [Providers](/providers)
- Use `PROVIDERS` to avoid typos.

## Provider ids and prefixes
Route ids are derived from the provider id unless you specify an `id`.

```javascript
const { AnyResponses, PROVIDERS } = require("anyresponses");

const client = new AnyResponses({
  provider: PROVIDERS.OPENAI,
  apiKey: process.env.OPENAI_API_KEY,
});

await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Hello",
});
```

## Multiple configs for the same provider
Use `id` to create multiple routes for a single provider.

```javascript
const client = new AnyResponses([
  { provider: PROVIDERS.OPENAI, id: "primary", apiKey: "..." },
  { provider: PROVIDERS.OPENAI, id: "backup", apiKey: "..." },
]);

await client.responses.create({
  model: "primary/gpt-4o-mini",
  input: "Route to primary",
});
```

## Provider-specific options
Most providers accept `apiKey` and optionally `baseUrl`. Some providers require
additional fields such as `region` or `version`.

```javascript
const client = new AnyResponses({
  provider: PROVIDERS.BEDROCK,
  apiKey: process.env.BEDROCK_API_KEY,
  region: process.env.BEDROCK_REGION,
});
```

## Where to find provider details
The complete list of providers, defaults, and required fields is available at
[Providers](/providers).
