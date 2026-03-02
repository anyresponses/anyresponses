## How do I add another provider?
Add a new provider config and give it a unique id. The id becomes the routing prefix.

```javascript
const client = new AnyResponses({
  provider: PROVIDERS.ANTHROPIC,
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

## Can I reuse a provider with multiple endpoints?
Yes. Create multiple configs for the same provider and give each one a unique id.

```javascript
const client = new AnyResponses([
  { provider: PROVIDERS.OPENAI, id: "primary", apiKey: "..." },
  { provider: PROVIDERS.OPENAI, id: "backup", apiKey: "..." },
]);
```

## What happens if I set ANYRESPONSES_API_KEY?
The client switches to gateway mode and sends requests to https://api.anyresponses.com/responses.

```javascript
const client = new AnyResponses({
  apiKey: process.env.ANYRESPONSES_API_KEY,
});
