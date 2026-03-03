## Overview
AnyResponses is a routing client and adapter layer that keeps Open Responses output stable across providers. You configure providers once, then switch the model prefix to route traffic.

> Tip: Use the PROVIDERS enum so route ids stay consistent across services.

## What is AnyResponses?
AnyResponses normalizes provider-specific responses into a single Open Responses-compatible format. That means you can swap vendors without rewriting your response parsing code.

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

console.log(response);
```

## When to use it
- You want a single request format that works across multiple vendors.
- You need a fallback or migration path between providers.
- You are building internal tooling that should stay portable across SDKs.

## Key capabilities
- Route selection by model prefix.
- Response normalization to Open Responses shape.
- Streaming event conversion plus SSE helpers.
- Environment-based provider configuration.

## Unified output example
Responses are normalized, so you can inspect the full response object regardless
of provider.

```javascript
const openaiResponse = await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Summarize this.",
});

const otherResponse = await client.responses.create({
  model: "anthropic/claude-3-haiku",
  input: "Summarize this.",
});

console.log(JSON.stringify(openaiResponse, null, 2));
console.log(JSON.stringify(otherResponse, null, 2));
```
