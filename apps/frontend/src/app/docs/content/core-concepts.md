## Open Responses format
Responses follow the Open Responses resource shape: output items, status, usage, and tool calls are always in the same place. That keeps downstream parsing stable across providers.

```javascript
const response = await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Summarize this",
});

console.log(JSON.stringify(response, null, 2));
```

## Routing and model ids
Models must include a prefix in the form routeId/modelName. The route id is either the provider name or an explicit id you set.

```javascript
const client = new AnyResponses([
  { provider: PROVIDERS.OPENAI, id: "primary", apiKey: "..." },
  { provider: PROVIDERS.OPENAI, id: "backup", apiKey: "..." },
]);

await client.responses.create({
  model: "primary/gpt-4o-mini",
  input: "Route me",
});
```

## Model prefix errors
Missing prefixes throw routing errors.

```javascript
await client.responses.create({
  model: "gpt-4o-mini",
  input: "This will throw",
});
```

## Open Responses input
The SDK accepts the Open Responses input shape.

```javascript
await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: [
    { type: "message", role: "system", content: "You are concise" },
    { type: "message", role: "user", content: "Hello" },
  ],
});
```
