## Request builders
AnyResponses builds provider-specific payloads for OpenAI Responses, OpenAI Chat, Anthropic Messages, Gemini, and Bedrock Converse.

```javascript
const response = await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Summarize this",
});
```

## Input normalization
Input can be a string, a message array, or Open Responses-style input items. The builders normalize into provider-native shapes.

```javascript
await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Plain text input",
});

await client.responses.create({
  model: "openai/gpt-4o-mini",
  messages: [
    { role: "system", content: "You are a helpful assistant" },
    { role: "user", content: "Hello" },
  ],
});

await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: [
    { type: "message", role: "user", content: "Hello" },
    { type: "message", role: "assistant", content: "Hi" },
  ],
});
```

## Tool calls
Tool definitions and tool_choice are mapped into the provider format when available.

```javascript
await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Call the weather tool",
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
