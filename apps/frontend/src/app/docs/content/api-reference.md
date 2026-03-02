## AnyResponses
Create a client and issue requests using the Open Responses request schema.

```javascript
const { AnyResponses, PROVIDERS } = require("anyresponses");

const client = new AnyResponses({
  provider: PROVIDERS.OPENAI,
  apiKey: process.env.OPENAI_API_KEY,
});

const response = await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Hello",
});
```

## AnyResponses.fromEnv
Load configuration from a specific env source.

```javascript
const client = AnyResponses.fromEnv(process.env, [
  { provider: PROVIDERS.OPENAI, id: "primary" },
]);
```

## responses.create
Send a request using the Open Responses schema.

```javascript
await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: [
    { type: "message", role: "user", content: "Hello" },
    { type: "message", role: "assistant", content: "Hi" },
  ],
  temperature: 0.2,
  max_output_tokens: 256,
});
```

## Streaming
Set stream: true to receive Open Responses-style events.

```javascript
const response = await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Stream this",
  stream: true,
});

for await (const event of response) {
  console.log(event.type);
}
```
