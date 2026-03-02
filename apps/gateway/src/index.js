import { Hono } from "hono";
import { registerResponsesRoutes } from "./routes/responses.js";
import { applyCors } from "./utils/cors.js";

const app = new Hono();

app.get("/health", (c) => c.text("ok"));
registerResponsesRoutes(app);

app.onError((err, c) => {
  const message = err?.message || "Internal error";
  const response = c.json({ error: { code: "internal_error", message } }, 500);
  return applyCors(c, response);
});

export default app;
