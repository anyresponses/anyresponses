## Prefix rules
Custom provider mode requires a `routeId/model` prefix. Missing prefixes throw
routing errors.

```javascript
const { AnyResponses, PROVIDERS } = require("anyresponses");

const client = new AnyResponses({
  provider: PROVIDERS.OPENAI,
  apiKey: process.env.OPENAI_API_KEY,
});

await client.responses.create({
  model: "gpt-4o-mini",
  input: "This throws in custom provider mode",
});
```

## Gateway mode overrides provider configs
If `ANYRESPONSES_API_KEY` is set (or `apiKey` is provided without `provider`),
AnyResponses sends requests to the official gateway and ignores provider configs.

```javascript
const { AnyResponses } = require("anyresponses");

const client = new AnyResponses({
  apiKey: process.env.ANYRESPONSES_API_KEY,
});
```

## Normalized output
Responses are always normalized into the Open Responses response shape so
downstream parsing stays consistent across providers.

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

console.log(JSON.stringify(response, null, 2));
```

## OpenAI SDK compatibility
The hosted gateway is compatible with the OpenAI Responses interface.

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.ANYRESPONSES_API_KEY,
  baseURL: "https://api.anyresponses.com/responses",
});
```
