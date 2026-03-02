const { createGeminiAdapter } = require("../adapters/gemini");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const EXPIRY_LEEWAY_SECONDS = 60;

function createVertexClient(options = {}) {
  const baseUrl = options.baseUrl || options.defaultBaseUrl;
  if (!baseUrl) {
    throw new Error("Missing Vertex base URL");
  }

  const fetchImpl = globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available");
  }

  const clientEmail = options.clientEmail;
  const privateKey = normalizePrivateKey(options.privateKey);
  const project = options.project;
  const location = options.location;
  const scope = normalizeScope(options.scopes) || DEFAULT_SCOPE;

  if (!clientEmail) {
    throw new Error("Missing Vertex client email");
  }
  if (!privateKey) {
    throw new Error("Missing Vertex private key");
  }

  const adapter = createGeminiAdapter({ provider: "vertex" });
  const tokenCache = { token: null, expiresAt: 0 };
  let pendingToken = null;

  async function createResponse(request, requestOptions = {}) {
    const endpointUrl = interpolateUrl(baseUrl, request.model, project, location);
    const token = await getAccessToken(requestOptions);
    const headers = buildHeaders(token, requestOptions.headers);
    const body = buildRequestBody(request);

    if (requestOptions.debug) {
      console.log("[anyresponses] Vertex request url:", endpointUrl);
      console.log("[anyresponses] Vertex request headers:", sanitizeHeaders(headers));
      console.log("[anyresponses] Vertex request body:", body);
    }

    const response = await fetchImpl(endpointUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: requestOptions.signal,
    });

    if (requestOptions.debug) {
      console.log("[anyresponses] Vertex response status:", response.status);
    }

    const payload = await parseResponseJson(response);
    return adapter.toOpenResponse(payload, {
      request: requestOptions.requestContext || request,
      strict: requestOptions.strict,
    });
  }

  async function* streamResponse(request, requestOptions = {}) {
    const streamBaseUrl = deriveStreamUrl(baseUrl);
    const endpointUrl = interpolateUrl(streamBaseUrl, request.model, project, location);
    const token = await getAccessToken(requestOptions);
    const headers = buildHeaders(token, requestOptions.headers);
    const body = buildRequestBody(request);

    if (requestOptions.debug) {
      console.log("[anyresponses] Vertex stream url:", endpointUrl);
      console.log("[anyresponses] Vertex stream headers:", sanitizeHeaders(headers));
      console.log("[anyresponses] Vertex stream body:", body);
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
      throw new Error(errorPayload?.error?.message || "Vertex stream failed");
    }

    const events = sseToEvents(response.body);
    yield* adapter.toOpenStream(events, {
      request: requestOptions.requestContext || request,
      strict: requestOptions.strict,
    });
  }

  async function getAccessToken(requestOptions = {}) {
    const now = Math.floor(Date.now() / 1000);
    if (tokenCache.token && tokenCache.expiresAt - EXPIRY_LEEWAY_SECONDS > now) {
      return tokenCache.token;
    }

    if (pendingToken) {
      return pendingToken;
    }

    pendingToken = fetchAccessToken(requestOptions)
      .finally(() => {
        pendingToken = null;
      });
    return pendingToken;
  }

  async function fetchAccessToken(requestOptions = {}) {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600;
    const assertion = await createJwtAssertion({
      clientEmail,
      privateKey,
      scope,
      iat: now,
      exp,
    });

    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    });

    const response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: requestOptions.signal,
    });

    const payload = await parseTokenResponse(response);
    const token = payload?.access_token;
    if (!token) {
      throw new Error("Vertex token response missing access_token");
    }

    const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
    tokenCache.token = token;
    tokenCache.expiresAt = now + expiresIn;
    return token;
  }

  return {
    createResponse,
    streamResponse,
  };
}

function buildHeaders(token, extraHeaders) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
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
    const message = payload?.error?.message || `Vertex request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    if (rawText) {
      error.raw = rawText;
    }
    throw error;
  }
  if (!payload || typeof payload !== "object") {
    const error = new Error("Vertex response was empty or invalid JSON");
    error.status = response.status;
    error.payload = payload;
    if (rawText) {
      error.raw = rawText;
    }
    throw error;
  }
  return payload;
}

async function parseTokenResponse(response) {
  const rawText = await response.text();
  let payload = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch (err) {
    payload = null;
  }
  if (!response.ok) {
    const message = payload?.error_description || payload?.error || `Token request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    if (rawText) {
      error.raw = rawText;
    }
    throw error;
  }
  if (!payload || typeof payload !== "object") {
    const error = new Error("Token response was empty or invalid JSON");
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

function interpolateUrl(baseUrl, model, project, location) {
  if (typeof baseUrl !== "string") {
    return baseUrl;
  }
  let url = baseUrl;
  url = replaceToken(url, "model", model);
  url = replaceToken(url, "project", project);
  url = replaceToken(url, "location", location);
  return url;
}

function replaceToken(url, tokenName, value) {
  const token = `{${tokenName}}`;
  if (!url.includes(token)) {
    return url;
  }
  if (value == null || value === "") {
    throw new Error(`Missing Vertex ${tokenName}`);
  }
  const encoded = encodeURIComponent(String(value));
  return url.split(token).join(encoded);
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
  if (sanitized.authorization) {
    sanitized.authorization = "[redacted]";
  }
  return sanitized;
}

function normalizePrivateKey(value) {
  if (typeof value !== "string") {
    return value;
  }
  return value.replace(/\\n/g, "\n");
}

function normalizeScope(scopes) {
  if (!scopes) {
    return "";
  }
  if (Array.isArray(scopes)) {
    return scopes.filter(Boolean).join(" ");
  }
  if (typeof scopes === "string") {
    return scopes;
  }
  return "";
}

async function createJwtAssertion({ clientEmail, privateKey, scope, iat, exp }) {
  const header = base64UrlEncodeString(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncodeString(JSON.stringify({
    iss: clientEmail,
    scope,
    aud: TOKEN_URL,
    iat,
    exp,
  }));

  const signingInput = `${header}.${payload}`;
  const signature = await signJwt(signingInput, privateKey);
  return `${signingInput}.${signature}`;
}

async function signJwt(signingInput, privateKey) {
  const subtle = globalThis?.crypto?.subtle;
  if (subtle && typeof subtle.importKey === "function") {
    const keyData = pemToArrayBuffer(privateKey);
    const key = await subtle.importKey(
      "pkcs8",
      keyData,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const data = new TextEncoder().encode(signingInput);
    const signature = await subtle.sign("RSASSA-PKCS1-v1_5", key, data);
    return base64UrlEncodeBytes(new Uint8Array(signature));
  }

  const nodeCrypto = safeRequireCrypto();
  if (!nodeCrypto?.createSign) {
    throw new Error("crypto.subtle is not available; cannot sign JWT");
  }
  const signer = nodeCrypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey);
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function base64UrlEncodeString(value) {
  const bytes = new TextEncoder().encode(String(value));
  return base64UrlEncodeBytes(bytes);
}

function base64UrlEncodeBytes(bytes) {
  if (typeof btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes)
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }
  throw new Error("Base64 encoder is not available");
}

function pemToArrayBuffer(pem) {
  if (typeof pem !== "string") {
    throw new Error("Invalid private key");
  }
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bytes = base64Decode(cleaned);
  return bytes.buffer;
}

function base64Decode(value) {
  if (typeof atob === "function") {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  throw new Error("Base64 decoder is not available");
}

function safeRequireCrypto() {
  if (typeof require !== "function") {
    return null;
  }
  try {
    return require("crypto");
  } catch (err) {
    return null;
  }
}

module.exports = {
  createVertexClient,
};
