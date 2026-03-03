## Overview
BYOK (bring your own key) lets you use the official AnyResponses gateway while
routing through a provider key you configured in the AnyResponses console. The
request flow is the same as the official gateway key, but the `model` id must
include your Integration ID prefix.

## Enable BYOK
- Open [Integrations](/integrations) in the AnyResponses console.
- Add your provider API key under BYOK settings.
- Note the Integration ID that is created for routing.

## Call the gateway with your Integration ID prefix
Authenticate with your AnyResponses key and prefix the model id with your
Integration ID.

```javascript
const { AnyResponses } = require("anyresponses");

const client = new AnyResponses({
  apiKey: process.env.ANYRESPONSES_API_KEY,
});

const response = await client.responses.create({
  model: "my-integration-id/gpt-4o-mini",
  input: [{ type: "message", role: "user", content: "Hello" }],
});

console.log(response);
```

## Same flow as the official gateway
BYOK uses the same SDK calls as the official gateway. For detailed request
examples, see [Official gateway key](/docs/gateway-anyresponses-key). The only
difference is the `model` prefix, which must be your Integration ID.

Once the Integration ID is configured, you can route to any model supported by
that provider by changing the model name after the prefix.

## Notes and tradeoffs
- BYOK uses the official gateway but routes through your Integration ID.
- If you do not want to manage multiple provider API keys, use
  [Official gateway key](/docs/gateway-anyresponses-key) instead.
