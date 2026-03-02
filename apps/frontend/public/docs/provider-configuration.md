## Provider configs
Use a single config or an array. Use id to create explicit route prefixes.

```javascript
const client = new AnyResponses([
  {
    provider: PROVIDERS.OPENAI,
    id: "primary",
    apiKey: process.env.OPENAI_API_KEY,
  },
  {
    provider: PROVIDERS.OPENAI,
    id: "backup",
    apiKey: process.env.OPENAI_BACKUP_API_KEY,
    baseUrl: process.env.OPENAI_BACKUP_BASE_URL,
  },
]);
```

## Defaults and requirements
Each provider declares required options, optional options, and defaults. The PROVIDERS enum is generated from providers.json to keep ids aligned.

```javascript
const client = new AnyResponses({
  provider: PROVIDERS.ANTHROPIC,
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseUrl: process.env.ANTHROPIC_BASE_URL,
  version: "2023-06-01",
});
```

## Provider constants
Use PROVIDERS.OPENAI, PROVIDERS.ANTHROPIC, and other constants to avoid typo-driven routing errors.

```javascript
const client = new AnyResponses({
  provider: PROVIDERS.GOOGLE,
  apiKey: process.env.GOOGLE_API_KEY,
});
```
