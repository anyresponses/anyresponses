const { createAnthropicAdapter } = require("../adapters/anthropic");
const DEFAULT_VERSION = "2023-06-01";

function createAnthropicClient(options = {}) {
  const apiKey = options.apiKey;
  if (!apiKey) {
    throw new Error("Missing Anthropic API key");
  }

  const baseUrl = options.baseUrl || options.defaultBaseUrl;
  if (!baseUrl) {
    throw new Error("Missing Anthropic base URL");
  }
  const endpointUrl = baseUrl;
  const version = options.version || DEFAULT_VERSION;
  const fetchImpl = globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available");
  }

  const adapter = createAnthropicAdapter({
    provider: "anthropic",
  });

  async function createResponse(request, requestOptions = {}) {
    const headers = buildHeaders(apiKey, version, requestOptions.headers);
    const body = buildRequestBody(request, false);
    if (requestOptions.debug) {
      console.log("[anyresponses] Anthropic request url:", endpointUrl);
      console.log("[anyresponses] Anthropic request headers:", sanitizeHeaders(headers));
      console.log("[anyresponses] Anthropic request body:", body);
    }
    const response = await fetchImpl(endpointUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: requestOptions.signal,
    });

    if (requestOptions.debug) {
      console.log("[anyresponses] Anthropic response status:", response.status);
    }
    const payload = await parseResponseJson(response);
    return adapter.toOpenResponse(payload, {
      request: requestOptions.requestContext || mapRequestToOpenOptions(request),
      strict: requestOptions.strict,
    });
  }

  async function* streamResponse(request, requestOptions = {}) {
    const headers = buildHeaders(apiKey, version, requestOptions.headers);
    const body = buildRequestBody(request, true);
    if (requestOptions.debug) {
      console.log("[anyresponses] Anthropic stream url:", endpointUrl);
      console.log("[anyresponses] Anthropic stream headers:", sanitizeHeaders(headers));
      console.log("[anyresponses] Anthropic stream body:", body);
    }
    const response = await fetchImpl(endpointUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: requestOptions.signal,
    });

    if (!response.ok) {
      const errorPayload = await parseResponseJson(response);
      throw new Error(errorPayload?.error?.message || "Anthropic stream failed");
    }

    const events = sseToEvents(response.body);
    yield* adapter.toOpenStream(events, {
      request: requestOptions.requestContext || mapRequestToOpenOptions(request),
      strict: requestOptions.strict,
    });
  }

  return {
    createResponse,
    streamResponse,
  };
}

function buildHeaders(apiKey, version, extraHeaders) {
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": version,
    ...(extraHeaders || {}),
  };
}

function sanitizeHeaders(headers) {
  if (!headers) {
    return headers;
  }
  const sanitized = { ...headers };
  if (sanitized["x-api-key"]) {
    sanitized["x-api-key"] = "[redacted]";
  }
  return sanitized;
}

function buildRequestBody(request, stream) {
  if (!request || typeof request !== "object") {
    throw new TypeError("request must be an object");
  }
  return {
    ...request,
    stream,
  };
}

async function parseResponseJson(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch (err) {
    payload = null;
  }
  if (!response.ok) {
    let rawText = null;
    if (!payload && response.body) {
      try {
        rawText = await response.text();
      } catch (err) {
        rawText = null;
      }
    }
    const message = payload?.error?.message || `Anthropic request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    if (rawText) {
      error.raw = rawText;
    }
    throw error;
  }
  return payload;
}

async function* sseToEvents(stream) {
  if (!stream) {
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines = [];

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line === "") {
        const payload = dataLines.join("\n");
        dataLines = [];
        if (!payload) {
          continue;
        }
        if (payload === "[DONE]") {
          return;
        }
        try {
          yield JSON.parse(payload);
        } catch (err) {
          continue;
        }
        continue;
      }

      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
  }
}

function mapRequestToOpenOptions(request) {
  if (!request || typeof request !== "object") {
    return {};
  }

  return {
    model: request.model || null,
    instructions: request.system || null,
    tools: request.tools || [],
    tool_choice: request.tool_choice || null,
    max_output_tokens: request.max_tokens ?? null,
    temperature: request.temperature ?? null,
    top_p: request.top_p ?? null,
  };
}

module.exports = {
  createAnthropicClient,
};
