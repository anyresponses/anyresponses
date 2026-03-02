## Event lifecycle
Streamed responses emit Open Responses-style events: response.created, response.in_progress, response.output_item.added, response.output_text.delta, response.output_text.done, and response.completed/response.failed.

```javascript
const response = await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Stream this",
  stream: true,
});

let finalResponse = null;
for await (const event of response) {
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

## Capturing the final response
When the stream completes, the final response object is attached to the
`response.completed` event.

```javascript
let finalResponse = null;

for await (const event of response) {
  if (event.type === "response.completed" || event.type === "response.failed") {
    finalResponse = event.response || null;
  }
}

console.log(JSON.stringify(finalResponse || {}, null, 2));
```
