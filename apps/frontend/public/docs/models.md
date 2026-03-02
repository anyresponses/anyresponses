## Overview
Gateway model ids are defined by the AnyResponses hosted catalog. Use the model
id directly when you call the official gateway key.

- Hosted catalog: [Models](/models)
- Custom provider keys use provider-specific model ids with a prefix.

## Using a hosted model id
Pick a model from the catalog and pass it as `model`.

```javascript
const { AnyResponses } = require("anyresponses");

const client = new AnyResponses({
  apiKey: process.env.ANYRESPONSES_API_KEY,
});

const response = await client.responses.create({
  model: "gpt-4o-mini",
  input: "Hello",
});
```

## Prefixes vs hosted ids
- Official gateway key: `model` comes from the catalog and has no prefix.
- Custom provider keys: `model` must include a prefix, such as
  `openai/gpt-4o-mini`.
- Gateway BYOK: `model` must include a prefix because the gateway uses it to
  select your Integration ID.

## Model selection tips
- Start with the lowest-cost model that meets your latency and quality goals.
- Use [Models](/models) for pricing, context length, and test status.
