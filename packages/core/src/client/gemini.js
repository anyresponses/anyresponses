const { createGeminiAdapter } = require("../adapters/gemini");
function createGeminiClient(options = {}) {
  const apiKey = options.apiKey;
  if (!apiKey) {
    throw new Error("Missing Gemini API key");
  }

  const baseUrl = options.baseUrl || options.defaultBaseUrl;
  if (!baseUrl) {
    throw new Error("Missing Gemini base URL");
  }

  const fetchImpl = globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available");
  }

  const adapter = createGeminiAdapter({
    provider: "gemini",
  });

  async function createResponse(request, requestOptions = {}) {
    const endpointUrl = interpolateModel(baseUrl, request.model);
    const headers = buildHeaders(apiKey, requestOptions.headers);
    const body = buildRequestBody(request);

    if (requestOptions.debug) {
      console.log("[anyresponses] Gemini request url:", endpointUrl);
      console.log("[anyresponses] Gemini request headers:", sanitizeHeaders(headers));
      console.log("[anyresponses] Gemini request body:", body);
    }

    const response = await fetchImpl(endpointUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: requestOptions.signal,
    });

    if (requestOptions.debug) {
      console.log("[anyresponses] Gemini response status:", response.status);
    }

    const payload = await parseResponseJson(response);
    return adapter.toOpenResponse(payload, {
      request: requestOptions.requestContext || request,
      strict: requestOptions.strict,
    });
  }

  async function* streamResponse(request, requestOptions = {}) {
    const streamBaseUrl = deriveStreamUrl(baseUrl);
    const endpointUrl = interpolateModel(streamBaseUrl, request.model);
    const headers = buildHeaders(apiKey, requestOptions.headers);
    const body = buildRequestBody(request);

    if (requestOptions.debug) {
      console.log("[anyresponses] Gemini stream url:", endpointUrl);
      console.log("[anyresponses] Gemini stream headers:", sanitizeHeaders(headers));
      console.log("[anyresponses] Gemini stream body:", body);
    }

    const streamUrl = appendQueryParam(endpointUrl, "alt", "sse");
    const response = await fetchImpl(streamUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: requestOptions.signal,
    });

    if (!response.ok) {
      const errorPayload = await parseResponseJson(response);
      throw new Error(errorPayload?.error?.message || "Gemini stream failed");
    }

    const events = sseToEvents(response.body);
    yield* adapter.toOpenStream(events, {
      request: requestOptions.requestContext || request,
      strict: requestOptions.strict,
    });
  }

  return {
    createResponse,
    streamResponse,
  };
}

function buildHeaders(apiKey, extraHeaders) {
  return {
    "content-type": "application/json",
    "x-goog-api-key": apiKey,
    ...(extraHeaders || {}),
  };
}

function buildRequestBody(request) {
  if (!request || typeof request !== "object") {
    throw new TypeError("request must be an object");
  }
  const { model, ...body } = request;
  return body;
}

async function parseResponseJson(response) {
  let rawText = null;
  let payload = null;
  try {
    rawText = await response.text();
  } catch (err) {
    rawText = null;
  }
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch (err) {
      payload = parseSsePayload(rawText);
    }
  }
  if (!response.ok) {
    const message = payload?.error?.message || `Gemini request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    if (rawText) {
      error.raw = rawText;
    }
    throw error;
  }
  if (!payload || typeof payload !== "object") {
    const error = new Error("Gemini response was empty or invalid JSON");
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

function parseSsePayload(rawText) {
  if (typeof rawText !== "string" || !rawText.includes("data:")) {
    return null;
  }

  const lines = rawText.split(/\r?\n/);
  let dataLines = [];
  let lastEvent = null;

  const flush = () => {
    if (dataLines.length === 0) {
      return;
    }
    const payload = dataLines.join("\n");
    dataLines = [];
    if (!payload || payload === "[DONE]") {
      return;
    }
    try {
      lastEvent = JSON.parse(payload);
    } catch (err) {
      // Ignore malformed chunks; keep the last good event.
    }
  };

  for (const line of lines) {
    if (line === "") {
      flush();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  flush();
  return lastEvent;
}

function interpolateModel(baseUrl, model) {
  if (typeof baseUrl !== "string") {
    return baseUrl;
  }
  if (baseUrl.includes("{model}")) {
    return baseUrl.replace("{model}", encodeURIComponent(model || ""));
  }
  return baseUrl;
}

function deriveStreamUrl(baseUrl) {
  if (typeof baseUrl !== "string") {
    return baseUrl;
  }
  if (baseUrl.includes(":streamGenerateContent")) {
    return baseUrl;
  }
  if (baseUrl.includes(":generateContent")) {
    return baseUrl.replace(":generateContent", ":streamGenerateContent");
  }
  return baseUrl;
}

function appendQueryParam(urlString, key, value) {
  if (typeof urlString !== "string") {
    return urlString;
  }
  try {
    const url = new URL(urlString);
    url.searchParams.set(key, value);
    return url.toString();
  } catch (err) {
    const separator = urlString.includes("?") ? "&" : "?";
    return `${urlString}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
}

function sanitizeHeaders(headers) {
  if (!headers) {
    return headers;
  }
  const sanitized = { ...headers };
  if (sanitized["x-goog-api-key"]) {
    sanitized["x-goog-api-key"] = "[redacted]";
  }
  return sanitized;
}

module.exports = {
  createGeminiClient,
};
