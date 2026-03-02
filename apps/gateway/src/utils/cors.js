export function applyCors(c, response) {
  const origin = c.req.header("origin") || "*";
  response.headers.set("access-control-allow-origin", origin);
  response.headers.set("access-control-allow-methods", "POST, OPTIONS");
  response.headers.set("access-control-allow-headers", "content-type, x-provider, authorization");
  response.headers.set("access-control-max-age", "86400");
  return response;
}
