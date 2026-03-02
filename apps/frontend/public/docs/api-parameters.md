## Request shape
AnyResponses accepts the Open Responses request schema and normalizes it to each
provider. The primary entrypoint is `responses.create`.

```javascript
const response = await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Summarize this",
});
```

> Assumes a configured client. See [Quickstart](/docs/quickstart) for setup.

## Required fields
- `model`: required for all calls.
- `input` or `messages`: provide at least one user message.

## Model id rules
- Custom provider keys require a prefix: `routeId/model`.
- Official gateway key uses hosted model ids without prefixes.
- Gateway BYOK requires a prefix so the gateway knows which Integration ID to use.

## Input formats
AnyResponses accepts multiple input styles and normalizes them.

```javascript
await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Plain text input",
});

await client.responses.create({
  model: "openai/gpt-4o-mini",
  messages: [
    { role: "system", content: "You are concise" },
    { role: "user", content: "Hello" },
  ],
});

await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: [
    { type: "message", role: "system", content: "You are concise" },
    { type: "message", role: "user", content: "Hello" },
  ],
});
```

## Multimodal input
Use an input message with mixed text and image parts when the provider supports
image inputs.

```javascript
await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: [
    {
      type: "message",
      role: "user",
      content: [
        { type: "input_text", text: "Describe this image." },
        { type: "input_image", image_url: "https://example.com/image.png" },
      ],
    },
  ],
});
```

## Generation controls
Common generation parameters are forwarded when supported by the provider.

- `temperature`
- `top_p`
- `max_output_tokens`
- `max_tokens` (legacy alias used by some providers)
- `presence_penalty`, `frequency_penalty`

```javascript
await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Write a short haiku",
  temperature: 0.4,
  top_p: 0.9,
  max_output_tokens: 120,
});
```

## Tools and tool_choice
Function tools are normalized to provider formats when available.

```javascript
await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "What is the weather in Tokyo?",
  tools: [
    {
      type: "function",
      name: "get_weather",
      description: "Get the weather by city",
      parameters: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      },
    },
  ],
  tool_choice: { type: "function", name: "get_weather" },
});
```

## Streaming
Set `stream: true` to receive Open Responses events.

```javascript
const stream = await client.responses.create({
  model: "openai/gpt-4o-mini",
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

## Response fields
Responses are normalized to the Open Responses shape. Inspect the full response
object for `output`, `usage`, and tool call details.

```javascript
const response = await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Hello",
});

console.log(JSON.stringify(response, null, 2));
```

## Errors and routing
- Missing prefixes in custom provider mode throw routing errors.
- Unknown route ids throw errors listing configured ids.
- Gateway mode ignores provider configs when `ANYRESPONSES_API_KEY` is set.
