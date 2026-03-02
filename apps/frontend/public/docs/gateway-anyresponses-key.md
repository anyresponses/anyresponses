## Overview
Use the official AnyResponses gateway when you want a single key that accesses
hosted models without managing provider credentials yourself.

- One key for many hosted models.
- No provider prefixes required.
- Model list available at [Models](/models).

## Configure the gateway key
Set `ANYRESPONSES_API_KEY` or pass `apiKey` without a provider.

```javascript
const { AnyResponses } = require("anyresponses");

const client = new AnyResponses({
  apiKey: process.env.ANYRESPONSES_API_KEY,
});
```

> Note: When the official key is present, provider configs are ignored.

## Pick a model
Use a model id from the hosted catalog. Example ids are listed at
[Models](/models).

```javascript
const response = await client.responses.create({
  model: "gpt-4o-mini",
  input: "Hello from the gateway",
});

console.log(JSON.stringify(response, null, 2));
```

## Streaming from the gateway
Set `stream: true` and consume Open Responses events.

```javascript
const stream = await client.responses.create({
  model: "gpt-4o-mini",
  input: "Stream this",
  stream: true,
});

let finalResponse = null;
for await (const event of stream) {
  console.log(event);
  if (event.type === "response.output_text.delta") {
    process.stdout.write(event.delta || "");
  }
  if (event.type === "response.completed" || event.type === "response.failed") {
    finalResponse = event.response || null;
  }
}

process.stdout.write("\n");
console.log(JSON.stringify(finalResponse || {}, null, 2));
```

## OpenAI SDK compatibility
The gateway is compatible with the OpenAI Responses interface.

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.ANYRESPONSES_API_KEY,
  baseURL: "https://api.anyresponses.com/responses",
});

const response = await client.responses.create({
  model: "gpt-4o-mini",
  input: "Hello",
});

console.log(JSON.stringify(response, null, 2));
```

## Raw HTTP
If you prefer curl or fetch, send JSON to `/responses`.

```bash
curl https://api.anyresponses.com/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANYRESPONSES_API_KEY" \
  -d '{
    "model": "gpt-4o-mini",
    "input": [{ "type": "message", "role": "user", "content": "Hello" }]
  }'
```
