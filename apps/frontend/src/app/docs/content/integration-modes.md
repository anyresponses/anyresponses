## Custom Provider Keys
Bring your own provider keys and keep the same response shape.

```javascript
const { AnyResponses, PROVIDERS } = require("anyresponses");

const client = new AnyResponses([
  {
    provider: PROVIDERS.OPENAI,
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
    id: "openai",
  },
  {
    provider: PROVIDERS.ANTHROPIC,
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    id: "anthropic",
  },
]);

await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: [{ type: "message", role: "user", content: "Hello" }],
});
```

## AnyResponses SDK (Gateway)
Use the official AnyResponses API key and route by model prefix.

```javascript
const { AnyResponses } = require("anyresponses");

const client = new AnyResponses({
  apiKey: process.env.ANYRESPONSES_API_KEY,
});

await client.responses.create({
  model: "gpt-4o-mini",
  input: [{ type: "message", role: "user", content: "Hello" }],
});
```

## OpenAI Responses SDK
Point the OpenAI SDK to AnyResponses and keep responses calls intact.

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.ANYRESPONSES_API_KEY,
  baseURL: "https://api.anyresponses.com/responses",
});

const response = await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Hello",
});
```

## Gateway (HTTP)
Send raw HTTP requests directly to the hosted gateway.

```bash
curl https://api.anyresponses.com/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANYRESPONSES_API_KEY" \
  -d '{
    "model": "gpt-4o-mini",
    "input": [{ "type": "message", "role": "user", "content": "Hello" }]
  }'
```
