## Prefix rules
Provider configs can be inferred from env keys like OPENAI_API_KEY and OPENAI_BASE_URL.

```javascript
// OPENAI_API_KEY=...
// OPENAI_BASE_URL=...

const client = new AnyResponses();
```

## Custom route ids
Use suffix-based keys to create custom ids. For example, OPENAI_EDGE_API_KEY sets id "edge".

```javascript
// OPENAI_EDGE_API_KEY=...
// OPENAI_EDGE_BASE_URL=...

const client = new AnyResponses();

await client.responses.create({
  model: "edge/gpt-4o-mini",
  input: "Hello",
});
```

## fromEnv helper
Use AnyResponses.fromEnv when you want to control the env source explicitly (for example, in tests or workers).

```javascript
const client = AnyResponses.fromEnv(
  { OPENAI_API_KEY: "..." },
  [{ provider: PROVIDERS.OPENAI, id: "primary" }]
);
```

## Aliases
Some providers accept aliases such as HF_TOKEN to avoid duplicating credentials.

```javascript
// HF_TOKEN=...

const client = new AnyResponses();

await client.responses.create({
  model: "huggingface/meta-llama-3-8b",
  input: "Hello",
});
```
