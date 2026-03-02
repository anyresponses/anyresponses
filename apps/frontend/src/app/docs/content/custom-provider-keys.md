## Overview
Use AnyResponses as a routing client when you want to bring your own provider
keys. You configure providers once and route requests by model prefix.

- Keep provider credentials in your environment or config files.
- Switch providers by editing the model id prefix.
- Use [Providers](/providers) to see the full catalog.

## Configure providers in code
Pass a provider config object or an array of configs.

```javascript
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
```

## Route by prefix
The prefix before the slash selects the provider or custom route id.

```javascript
await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Summarize this",
});

await client.responses.create({
  model: "claude/claude-3-haiku",
  input: "Summarize this",
});
```

## Load from environment
Omit options to let AnyResponses infer providers from env variables.

```bash
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
```

```javascript
const { AnyResponses } = require("anyresponses");

const client = new AnyResponses();

await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Hello",
});
```

## fromEnv helper
Use `AnyResponses.fromEnv` when you want explicit control over the env source.

```javascript
const { AnyResponses, PROVIDERS } = require("anyresponses");

const client = AnyResponses.fromEnv(process.env, [
  { provider: PROVIDERS.OPENAI, id: "primary" },
]);

await client.responses.create({
  model: "primary/gpt-4o-mini",
  input: "Hello",
});
```

## Custom route ids
Suffix env keys or set an explicit id in config.

```bash
OPENAI_EDGE_API_KEY=...
OPENAI_EDGE_BASE_URL=...
```

```javascript
const { AnyResponses } = require("anyresponses");

const client = new AnyResponses();

await client.responses.create({
  model: "edge/gpt-4o-mini",
  input: "Route to edge",
});
```

## Provider-specific options
You can override provider defaults like baseUrl, region, or version.

```javascript
const { AnyResponses, PROVIDERS } = require("anyresponses");

const client = new AnyResponses({
  provider: PROVIDERS.ANTHROPIC,
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseUrl: process.env.ANTHROPIC_BASE_URL,
  version: "2023-06-01",
});
```

## Supported providers
Use `PROVIDERS` to avoid typos and see the provider catalog at
[Providers](/providers) for the current list of ids and prefixes.

```javascript
const { PROVIDERS } = require("anyresponses");

console.log(PROVIDERS.OPENAI);
console.log(PROVIDERS.ANTHROPIC);
```
