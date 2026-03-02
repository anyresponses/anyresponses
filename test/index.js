const dotenv = require("dotenv");
const { AnyResponses } = require("anyresponses");

async function main() {
  dotenv.config();
  // const client = AnyResponses.fromEnv(process.env);
  const client = new AnyResponses();

  const request = {
    model: "gpt-4o-mini",
    input: [
      {
        type: "message",
        role: "user",
        content: "Hello",
      },
    ],
    stream: true,
  };

  const response = await client.responses.create(request, { debug: true });

  if (request.stream) {
    let finalResponse = null;
    for await (const event of response) {
      console.log(event);
      if (event?.type === "response.output_text.delta" && event.delta) {
        process.stdout.write(event.delta);
      }
      if (
        event?.type === "response.completed" ||
        event?.type === "response.failed"
      ) {
        finalResponse = event.response || null;
      }
    }
    process.stdout.write("\n");
    console.log(JSON.stringify(finalResponse || {}, null, 2));
    return;
  }

  console.log(JSON.stringify(response, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
