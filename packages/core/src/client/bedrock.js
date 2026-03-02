const { createBedrockConverseAdapter } = require("../adapters/bedrock-converse");
function createBedrockClient(options = {}) {
  const apiKey = options.apiKey;
  if (!apiKey) {
    throw new Error("Missing Bedrock API key");
  }

  const region = options.region || options.defaultRegion;
  if (!region) {
    throw new Error("Missing Bedrock region");
  }
  const baseUrl = interpolateRegion(
    options.baseUrl || options.defaultBaseUrl,
    region,
  );
  if (!baseUrl) {
    throw new Error("Missing Bedrock base URL");
  }

  const fetchImpl = globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available");
  }

  const adapter = createBedrockConverseAdapter({
    provider: options.provider || "bedrock",
  });

  async function createResponse(request, requestOptions = {}) {
    const endpointUrl = buildEndpointUrl(baseUrl, request.model, "converse");
    const headers = buildHeaders(apiKey, requestOptions.headers);
    const body = buildRequestBody(request);

    if (requestOptions.debug) {
      console.log("[anyresponses] Bedrock request url:", endpointUrl);
      console.log("[anyresponses] Bedrock request headers:", sanitizeHeaders(headers));
      console.log("[anyresponses] Bedrock request body:", body);
    }

    const response = await fetchImpl(endpointUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: requestOptions.signal,
    });

    if (requestOptions.debug) {
      console.log("[anyresponses] Bedrock response status:", response.status);
    }

    const payload = await parseResponseJson(response);
    return adapter.toOpenResponse(payload, {
      request: requestOptions.requestContext || request,
      strict: requestOptions.strict,
    });
  }

  async function* streamResponse(request, requestOptions = {}) {
    const endpointUrl = buildEndpointUrl(baseUrl, request.model, "converse-stream");
    const headers = buildHeaders(apiKey, requestOptions.headers);
    const body = buildRequestBody(request);

    if (requestOptions.debug) {
      console.log("[anyresponses] Bedrock stream url:", endpointUrl);
      console.log("[anyresponses] Bedrock stream headers:", sanitizeHeaders(headers));
      console.log("[anyresponses] Bedrock stream body:", body);
    }

    const response = await fetchImpl(endpointUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: requestOptions.signal,
    });

    if (!response.ok) {
      const errorPayload = await parseErrorResponse(response);
      throw new Error(errorPayload?.message || errorPayload?.error?.message || "Bedrock stream failed");
    }

    const contentType = response.headers.get("content-type") || "";
    const events = contentType.includes("application/vnd.amazon.eventstream")
      ? parseEventStreamBinary(response.body)
      : parseEventStream(response.body);
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
    authorization: `Bearer ${apiKey}`,
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
      payload = null;
    }
  }
  if (!response.ok) {
    const message = payload?.message || payload?.error?.message || `Bedrock request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    if (rawText) {
      error.raw = rawText;
    }
    throw error;
  }
  if (!payload || typeof payload !== "object") {
    const error = new Error("Bedrock response was empty or invalid JSON");
    error.status = response.status;
    error.payload = payload;
    if (rawText) {
      error.raw = rawText;
    }
    throw error;
  }
  return payload;
}

async function parseErrorResponse(response) {
  let rawText = null;
  try {
    rawText = await response.text();
  } catch (err) {
    rawText = null;
  }
  if (!rawText) {
    return null;
  }
  try {
    return JSON.parse(rawText);
  } catch (err) {
    return { message: rawText };
  }
}

async function* parseEventStream(stream) {
  if (!stream) {
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let mode = null;
  let dataLines = [];

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });

    if (!mode) {
      if (/(^|\n)(event:|data:|id:)/.test(buffer)) {
        mode = "sse";
      } else if (buffer.includes("{")) {
        mode = "json";
      }
    }

    if (mode === "sse") {
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line === "") {
          const event = flushSse(dataLines);
          if (event) {
            yield event;
          }
          continue;
        }
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
      continue;
    }

    const extracted = extractJsonObjects(buffer);
    buffer = extracted.remainder;
    for (const event of extracted.events) {
      yield event;
    }
  }

  if (mode === "sse") {
    const event = flushSse(dataLines);
    if (event) {
      yield event;
    }
    return;
  }

  const extracted = extractJsonObjects(buffer);
  for (const event of extracted.events) {
    yield event;
  }
  const leftover = extracted.remainder.trim();
  if (leftover) {
    try {
      yield JSON.parse(leftover);
    } catch (err) {
      // Ignore trailing fragments.
    }
  }
}

async function* parseEventStreamBinary(stream) {
  if (!stream) {
    return;
  }

  let buffer = new Uint8Array(0);
  const decoder = new TextDecoder();

  for await (const chunk of stream) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    buffer = concatBytes(buffer, bytes);

    let offset = 0;
    while (buffer.length - offset >= 12) {
      const view = new DataView(buffer.buffer, buffer.byteOffset + offset, buffer.length - offset);
      const totalLength = view.getUint32(0, false);
      const headersLength = view.getUint32(4, false);

      if (totalLength < 16 || headersLength > totalLength - 16) {
        break;
      }
      if (buffer.length - offset < totalLength) {
        break;
      }

      const message = buffer.subarray(offset, offset + totalLength);
      offset += totalLength;

      const headersBytes = message.subarray(12, 12 + headersLength);
      const payloadBytes = message.subarray(12 + headersLength, totalLength - 4);

      const headers = parseEventstreamHeaders(headersBytes);
      const event = parseEventstreamPayload(headers, payloadBytes, decoder);
      if (event) {
        yield event;
      }
    }

    if (offset > 0) {
      buffer = buffer.subarray(offset);
    }
  }
}

function flushSse(dataLines) {
  if (dataLines.length === 0) {
    return null;
  }
  const payload = dataLines.join("\n");
  dataLines.length = 0;
  if (!payload || payload === "[DONE]") {
    return null;
  }
  try {
    return JSON.parse(payload);
  } catch (err) {
    return null;
  }
}

function extractJsonObjects(buffer) {
  const events = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  let lastConsumed = 0;

  for (let i = 0; i < buffer.length; i += 1) {
    const char = buffer[i];

    if (start === -1) {
      if (char === "{") {
        start = i;
        depth = 1;
        inString = false;
        escape = false;
      }
      continue;
    }

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const jsonText = buffer.slice(start, i + 1);
        try {
          events.push(JSON.parse(jsonText));
        } catch (err) {
          // Ignore malformed chunks.
        }
        start = -1;
        lastConsumed = i + 1;
      }
    }
  }

  const remainder = start === -1 ? buffer.slice(lastConsumed) : buffer.slice(start);
  return { events, remainder };
}

function parseEventstreamHeaders(bytes) {
  const headers = {};
  let index = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();

  while (index < bytes.length) {
    const nameLength = bytes[index];
    index += 1;
    if (!nameLength || index + nameLength > bytes.length) {
      break;
    }
    const name = decoder.decode(bytes.subarray(index, index + nameLength));
    index += nameLength;
    if (index >= bytes.length) {
      break;
    }
    const type = bytes[index];
    index += 1;

    if (type === 0x00) {
      headers[name] = true;
      continue;
    }
    if (type === 0x01) {
      headers[name] = false;
      continue;
    }

    if (type === 0x02) {
      headers[name] = view.getInt8(index);
      index += 1;
      continue;
    }
    if (type === 0x03) {
      headers[name] = view.getInt16(index, false);
      index += 2;
      continue;
    }
    if (type === 0x04) {
      headers[name] = view.getInt32(index, false);
      index += 4;
      continue;
    }
    if (type === 0x05) {
      const high = view.getInt32(index, false);
      const low = view.getUint32(index + 4, false);
      index += 8;
      const value = Number((BigInt(high) << 32n) | BigInt(low));
      headers[name] = Number.isSafeInteger(value) ? value : String(value);
      continue;
    }
    if (type === 0x06 || type === 0x07) {
      const length = view.getUint16(index, false);
      index += 2;
      const slice = bytes.subarray(index, index + length);
      index += length;
      headers[name] = type === 0x07 ? decoder.decode(slice) : slice;
      continue;
    }
    if (type === 0x08) {
      const high = view.getInt32(index, false);
      const low = view.getUint32(index + 4, false);
      index += 8;
      const value = Number((BigInt(high) << 32n) | BigInt(low));
      headers[name] = Number.isSafeInteger(value) ? value : String(value);
      continue;
    }
    if (type === 0x09) {
      const slice = bytes.subarray(index, index + 16);
      index += 16;
      headers[name] = formatUuid(slice);
      continue;
    }

    break;
  }

  return headers;
}

function parseEventstreamPayload(headers, payloadBytes, decoder) {
  const messageType = headers[":message-type"] || headers["message-type"];
  const eventType = headers[":event-type"] || headers["event-type"];
  const payloadText = decoder.decode(payloadBytes);

  let payload = null;
  if (payloadText) {
    try {
      payload = JSON.parse(payloadText);
    } catch (err) {
      payload = payloadText;
    }
  }

  if (messageType && messageType !== "event") {
    return { error: typeof payload === "string" ? { message: payload } : payload };
  }

  if (eventType) {
    if (payload && typeof payload === "object" && payload[eventType]) {
      return payload;
    }
    return { [eventType]: payload ?? {} };
  }

  if (payload && typeof payload === "object") {
    return payload;
  }

  return null;
}

function concatBytes(left, right) {
  if (!left || left.length === 0) {
    return right;
  }
  if (!right || right.length === 0) {
    return left;
  }
  const out = new Uint8Array(left.length + right.length);
  out.set(left, 0);
  out.set(right, left.length);
  return out;
}

function formatUuid(bytes) {
  const hex = [];
  for (const byte of bytes) {
    hex.push(byte.toString(16).padStart(2, "0"));
  }
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

function buildEndpointUrl(baseUrl, model, endpoint) {
  if (typeof baseUrl !== "string") {
    return baseUrl;
  }
  let url = baseUrl;
  if (url.includes("{model}")) {
    url = url.replace("{model}", encodeURIComponent(model || ""));
  }
  if (url.includes("{endpoint}")) {
    url = url.replace("{endpoint}", endpoint);
  }
  if (url.includes("{model}") || url.includes("{endpoint}")) {
    return url;
  }
  const trimmed = url.replace(/\/$/, "");
  if (trimmed.endsWith("/converse") || trimmed.endsWith("/converse-stream")) {
    if (endpoint === "converse-stream" && trimmed.endsWith("/converse")) {
      return trimmed.replace(/\/converse$/, "/converse-stream");
    }
    if (endpoint === "converse" && trimmed.endsWith("/converse-stream")) {
      return trimmed.replace(/\/converse-stream$/, "/converse");
    }
    return trimmed;
  }
  return `${trimmed}/model/${encodeURIComponent(model || "")}/${endpoint}`;
}

function interpolateRegion(baseUrl, region) {
  if (typeof baseUrl !== "string") {
    return baseUrl;
  }
  if (baseUrl.includes("{region}")) {
    return baseUrl.replace("{region}", region || "");
  }
  return baseUrl;
}

function sanitizeHeaders(headers) {
  if (!headers) {
    return headers;
  }
  const sanitized = { ...headers };
  if (sanitized.authorization) {
    sanitized.authorization = "[redacted]";
  }
  return sanitized;
}

module.exports = {
  createBedrockClient,
};
