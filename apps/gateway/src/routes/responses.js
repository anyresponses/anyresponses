import { AnyResponses, PROVIDERS, eventsToSSE } from "anyresponses";
import providersData from "../../../../packages/core/reference/providers.json";
import { streamFromAsyncIterable } from "../utils/stream.js";
import { applyCors } from "../utils/cors.js";
import { decryptOptions } from "../utils/byok-crypto.js";

const PROVIDER_META = Array.isArray(providersData.providers)
  ? providersData.providers
  : [];
const PROVIDER_META_BY_ID = new Map(
  PROVIDER_META.map((entry) => [entry.id, entry]),
);
const MONEY_SCALE_DIGITS = 10;
const MONEY_SCALE = 10n ** 10n;
const DEFAULT_INTEGRATION_LOG_ID = "anyresponses";

export function registerResponsesRoutes(app) {
  app.options("/responses", (c) => {
    return applyCors(c, new Response(null, { status: 204 }));
  });

  app.post("/responses", async (c) => {
    const apiKey = extractBearerToken(c.req.header("authorization"));
    if (!apiKey) {
      return applyCors(c, c.json({ error: { code: "unauthorized", message: "Missing API key" } }, 401));
    }

    const db = getDb(c);
    const apiKeyRecord = await db
      .prepare(
        "SELECT api_keys.id as id, api_keys.user_id as user_id, CAST(users.credits AS TEXT) as credits FROM api_keys JOIN users ON api_keys.user_id = users.id WHERE api_key = ?"
      )
      .bind(apiKey)
      .first();
    if (!apiKeyRecord?.id) {
      return applyCors(c, c.json({ error: { code: "unauthorized", message: "Invalid API key" } }, 401));
    }

    const startedAt = Date.now();
    const defaultIntegrationId = DEFAULT_INTEGRATION_LOG_ID;
    let body = null;
    try {
      body = await readRequestBody(c);
    } catch (err) {
      await writeRequestLog(db, {
        apiKeyId: apiKeyRecord.id,
        userId: apiKeyRecord.user_id,
        integrationId: defaultIntegrationId,
        provider: "unknown",
        model: "",
        stream: false,
        status: 400,
        errorCode: "invalid_request",
        errorMessage: "Invalid request body",
        startedAt,
      });
      return applyCors(c, c.json({ error: { code: "invalid_request", message: "Invalid request body" } }, 400));
    }

    const requestedModel = typeof body?.model === "string" ? body.model : "";
    const stream = Boolean(body?.stream);
    const parsedModel = parseModelParts(requestedModel);
    if (parsedModel.invalid || !parsedModel.modelId) {
      await writeRequestLog(db, {
        apiKeyId: apiKeyRecord.id,
        userId: apiKeyRecord.user_id,
        integrationId: defaultIntegrationId,
        provider: "unknown",
        model: requestedModel,
        stream,
        status: 400,
        errorCode: "invalid_request",
        errorMessage: "Invalid model id",
        startedAt,
      });
      return applyCors(c, c.json({ error: { code: "invalid_request", message: "Invalid model id" } }, 400));
    }

    const creditsUnits = coerceBigInt(apiKeyRecord.credits) ?? 0n;
    if (creditsUnits <= 0n) {
      await writeRequestLog(db, {
        apiKeyId: apiKeyRecord.id,
        userId: apiKeyRecord.user_id,
        integrationId: defaultIntegrationId,
        provider: parsedModel.routeId || "unknown",
        model: requestedModel,
        stream,
        status: 402,
        errorCode: "insufficient_balance",
        errorMessage: "Insufficient balance",
        startedAt,
      });
      return applyCors(
        c,
        c.json({ error: { code: "insufficient_balance", message: "Insufficient balance" } }, 402),
      );
    }

    const { configs: envProviderConfigs, byProvider: providerConfigByProvider } =
      buildEnvProviderConfigs(c.env);
    const baseProviderConfigs = envProviderConfigs.slice();

    let integrationRecord = null;
    let integrationRouteId = null;
    let providerMeta = null;

    if (parsedModel.routeId) {
      integrationRecord = await loadIntegrationById(
        db,
        apiKeyRecord.user_id,
        parsedModel.routeId,
      );
      if (!integrationRecord?.id) {
        await writeRequestLog(db, {
          apiKeyId: apiKeyRecord.id,
          userId: apiKeyRecord.user_id,
          integrationId: defaultIntegrationId,
          provider: parsedModel.routeId,
          model: requestedModel,
          stream,
          status: 400,
          errorCode: "integration_not_found",
          errorMessage: "Integration not found",
          startedAt,
        });
        return applyCors(c, c.json({ error: { code: "integration_not_found", message: "Integration not found" } }, 400));
      }
      providerMeta = PROVIDER_META_BY_ID.get(integrationRecord.provider_id);
      if (!providerMeta) {
        await writeRequestLog(db, {
          apiKeyId: apiKeyRecord.id,
          userId: apiKeyRecord.user_id,
          integrationId: defaultIntegrationId,
          provider: integrationRecord.provider_id,
          model: requestedModel,
          stream,
          status: 400,
          errorCode: "unsupported_provider",
          errorMessage: "Unsupported provider id",
          startedAt,
        });
        return applyCors(c, c.json({ error: { code: "unsupported_provider", message: "Unsupported provider id" } }, 400));
      }
      integrationRouteId = parsedModel.routeId;
    }

    const buildSmartRoutingPlan = async () => {
      const routingEntries = await loadRoutingRule(db, parsedModel.modelId);
      if (!routingEntries || routingEntries.length === 0) {
        return {
          error: {
            status: 400,
            code: "routing_not_configured",
            message: "No routing rule configured for model",
          },
        };
      }
      const routingResult = buildRoutingAttempts(
        routingEntries,
        parsedModel.modelId,
        providerConfigByProvider,
        baseProviderConfigs,
      );
      if (routingResult.attempts.length === 0) {
        return {
          error: {
            status: 500,
            code: "routing_unavailable",
            message: "No configured providers for routing rule",
          },
        };
      }
      return {
        attempts: routingResult.attempts,
        providerConfigs: routingResult.providerConfigs,
      };
    };

    const runPlan = async (plan) => {
      const client = new AnyResponses(plan.providerConfigs);
      if (stream) {
        const { events, attempt } = await runStreamAttempts(
          client,
          plan.attempts,
          body,
        );
        return { type: "stream", events, attempt };
      }
      const { response, attempt } = await runNonStreamAttempts(
        client,
        plan.attempts,
        body,
      );
      return { type: "json", response, attempt };
    };

    const sendResult = async (result, integrationId) => {
      const normalizedIntegrationId = normalizeIntegrationId(integrationId);
      if (result.type === "stream") {
        const sse = eventsToSSEWithLogging(result.events, {
          onComplete: async ({ response, error }) => {
            const resolvedIntegrationId = error
              ? DEFAULT_INTEGRATION_LOG_ID
              : normalizedIntegrationId;
            const usage = extractUsage(response);
            const costUsd = extractCostUsd(response);
            const costUnits = decimalToUnits(costUsd);
            await applyBilling(db, {
              requestId: response?.id || null,
              userId: apiKeyRecord.user_id,
              apiKeyId: apiKeyRecord.id,
              costUnits,
            });
            await writeRequestLog(db, {
              apiKeyId: apiKeyRecord.id,
              userId: apiKeyRecord.user_id,
              integrationId: resolvedIntegrationId,
              provider: result.attempt.providerId,
              model: requestedModel,
              stream,
              status: error ? 502 : 200,
              responseStatus: response?.status || null,
              finishReason: response?.incomplete_details?.reason || null,
              inputTokens: usage?.inputTokens ?? null,
              outputTokens: usage?.outputTokens ?? null,
              totalTokens: usage?.totalTokens ?? null,
              costUnits,
              feedback: null,
              feedbackText: null,
              errorCode: error ? "stream_error" : null,
              errorMessage: error ? error.message || "Stream error" : null,
              startedAt,
            });
            await writeUsageAnalyticsEvent(c.env, {
              requestId: response?.id || null,
              userId: apiKeyRecord.user_id,
              apiKeyId: apiKeyRecord.id,
              integrationId: resolvedIntegrationId,
              provider: result.attempt.providerId,
              model: requestedModel,
              stream,
              status: error ? 502 : 200,
              errorCode: error ? "stream_error" : null,
              inputTokens: usage?.inputTokens ?? null,
              outputTokens: usage?.outputTokens ?? null,
              totalTokens: usage?.totalTokens ?? null,
              costUsd,
              startedAt,
            });
          },
        });
        const readable = streamFromAsyncIterable(sse);
        return applyCors(c, new Response(readable, {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          },
        }));
      }

      const usage = extractUsage(result.response);
      const costUsd = extractCostUsd(result.response);
      const costUnits = decimalToUnits(costUsd);
      await applyBilling(db, {
        requestId: result.response?.id || null,
        userId: apiKeyRecord.user_id,
        apiKeyId: apiKeyRecord.id,
        costUnits,
      });
      await writeRequestLog(db, {
        apiKeyId: apiKeyRecord.id,
        userId: apiKeyRecord.user_id,
        integrationId: normalizedIntegrationId,
        provider: result.attempt.providerId,
        model: requestedModel,
        stream,
        status: 200,
        responseStatus: result.response?.status || null,
        finishReason: result.response?.incomplete_details?.reason || null,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
        costUnits,
        feedback: null,
        feedbackText: null,
        startedAt,
      });
      await writeUsageAnalyticsEvent(c.env, {
        requestId: result.response?.id || null,
        userId: apiKeyRecord.user_id,
        apiKeyId: apiKeyRecord.id,
        integrationId: normalizedIntegrationId,
        provider: result.attempt.providerId,
        model: requestedModel,
        stream,
        status: 200,
        errorCode: null,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
        costUsd,
        startedAt,
      });
      return applyCors(c, c.json(result.response));
    };

    const logAndReturnFailure = async (failure, attempts, integrationId = defaultIntegrationId) => {
      const fallbackProvider = attempts.length > 0
        ? attempts[attempts.length - 1].providerId
        : "unknown";
      await writeRequestLog(db, {
        apiKeyId: apiKeyRecord.id,
        userId: apiKeyRecord.user_id,
        integrationId,
        provider: fallbackProvider,
        model: requestedModel,
        stream,
        status: failure.status,
        errorCode: failure.code,
        errorMessage: failure.message,
        startedAt,
      });
      return applyCors(c, c.json({
        error: { code: failure.code, message: failure.message },
      }, failure.status));
    };

    let byokFailure = null;
    let byokAttempts = [];
    if (integrationRecord?.id && providerMeta && integrationRouteId) {
      const integrationResult = await buildIntegrationConfig(
        integrationRecord,
        providerMeta,
        integrationRouteId,
        c,
      );
      if (integrationResult.error) {
        if (integrationRecord.always_use === 1) {
          return await logAndReturnFailure(
            integrationResult.error,
            [{ providerId: integrationRecord.provider_id }],
          );
        }
        byokFailure = integrationResult.error;
        byokAttempts = [{ providerId: integrationRecord.provider_id }];
      } else if (integrationResult.config) {
        const plan = {
          attempts: [
            {
              providerId: integrationRecord.provider_id,
              routeId: integrationRouteId,
              modelId: parsedModel.modelId,
            },
          ],
          providerConfigs: mergeProviderConfigs(
            baseProviderConfigs,
            integrationResult.config,
          ),
        };
        try {
          const result = await runPlan(plan);
          return await sendResult(result, integrationRecord.integration_id);
        } catch (err) {
          if (integrationRecord.always_use === 1) {
            return await logAndReturnFailure({
              status: 502,
              code: "upstream_error",
              message: err?.message || "Upstream error",
            }, plan.attempts);
          }
          byokFailure = {
            status: 502,
            code: "upstream_error",
            message: err?.message || "Upstream error",
          };
          byokAttempts = plan.attempts;
        }
      }
    }

    const routingPlan = await buildSmartRoutingPlan();
    if (routingPlan.error) {
      if (byokFailure) {
        return await logAndReturnFailure(byokFailure, byokAttempts);
      }
      return await logAndReturnFailure(
        routingPlan.error,
        [{ providerId: "smart-routing" }],
      );
    }

    try {
      const result = await runPlan(routingPlan);
      return await sendResult(result, defaultIntegrationId);
    } catch (err) {
      return await logAndReturnFailure({
        status: 502,
        code: "upstream_error",
        message: err?.message || "Upstream error",
      }, routingPlan.attempts);
    }
  });
}

async function buildIntegrationConfig(
  record,
  providerMeta,
  routeId,
  c,
) {
  let parsed = {};
  if (record.options_json) {
    try {
      parsed = JSON.parse(record.options_json);
    } catch (err) {
      parsed = {};
    }
  }

  let decrypted = {};
  try {
    decrypted = await decryptOptions(parsed, c.env.BYOK_ENCRYPTION_KEY);
  } catch (err) {
    return {
      error: {
        status: 500,
        code: "decrypt_failed",
        message: "Failed to decrypt integration options",
      },
    };
  }

  const normalized = normalizeOptions(providerMeta, decrypted);
  const missing = getMissingRequiredOptions(providerMeta, normalized);
  if (missing.length > 0) {
    return {
      error: {
        status: 400,
        code: "missing_required_option",
        message: `Missing required options: ${missing.join(", ")}`,
      },
    };
  }

  return {
    config: {
      provider: record.provider_id,
      id: routeId,
      ...normalized,
    },
  };
}

function normalizeOptions(providerMeta, options) {
  const required = Array.isArray(providerMeta.required_options)
    ? providerMeta.required_options
    : [];
  const optional = Array.isArray(providerMeta.optional_options)
    ? providerMeta.optional_options
    : [];
  const defaultOptions =
    providerMeta.default_options && typeof providerMeta.default_options === "object"
      ? Object.keys(providerMeta.default_options)
      : [];
  const requiredOneOf = Array.isArray(providerMeta.required_one_of)
    ? providerMeta.required_one_of
    : [];
  const allowed = new Set([
    ...required,
    ...optional,
    ...defaultOptions,
    ...requiredOneOf.flat().filter(Boolean),
  ]);
  const resolved = {};
  for (const [key, value] of Object.entries(options || {})) {
    if (!allowed.has(key)) {
      continue;
    }
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      continue;
    }
    resolved[key] = trimmed;
  }
  return resolved;
}

function getMissingRequiredOptions(providerMeta, options) {
  const missing = [];
  const required = Array.isArray(providerMeta.required_options)
    ? providerMeta.required_options
    : [];
  for (const key of required) {
    if (!hasValue(options[key])) {
      missing.push(key);
    }
  }
  const requiredOneOf = Array.isArray(providerMeta.required_one_of)
    ? providerMeta.required_one_of
    : [];
  if (requiredOneOf.length > 0) {
    const satisfied = requiredOneOf.some((group) => {
      if (!Array.isArray(group) || group.length === 0) {
        return false;
      }
      return group.every((key) => hasValue(options[key]));
    });
    if (!satisfied) {
      missing.push("required_one_of");
    }
  }
  return missing;
}

function hasValue(value) {
  return value != null && value !== "";
}

async function readRequestBody(c) {
  const contentType = c.req.header("content-type") || "";
  if (contentType.includes("application/json")) {
    return await c.req.json();
  }
  const parsed = await c.req.parseBody();
  return coerceFormBody(parsed);
}

function coerceFormBody(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return {};
  }
  const body = { ...parsed };
  for (const key of ["input", "messages", "tools", "tool_choice", "metadata"]) {
    if (typeof body[key] === "string") {
      try {
        body[key] = JSON.parse(body[key]);
      } catch (err) {
        // Keep original string if parsing fails.
      }
    }
  }
  return body;
}

function parseModelParts(model) {
  if (typeof model !== "string") {
    return { routeId: null, modelId: "", invalid: true };
  }
  const trimmed = model.trim();
  if (!trimmed) {
    return { routeId: null, modelId: "", invalid: true };
  }
  if (!trimmed.includes("/")) {
    return { routeId: null, modelId: trimmed, invalid: false };
  }
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length < 2) {
    return { routeId: null, modelId: "", invalid: true };
  }
  return { routeId: parts[0], modelId: parts.slice(1).join("/"), invalid: false };
}

function buildRequestPayload(body, routeId, modelId, stream) {
  const payload = { ...body, model: `${routeId}/${modelId}` };
  if (stream) {
    payload.stream = true;
  }
  return payload;
}

function mergeProviderConfigs(providerConfigs, integrationConfig) {
  const routeIdToReplace = integrationConfig?.id || integrationConfig?.provider;
  if (!routeIdToReplace) {
    return providerConfigs.slice();
  }
  const filtered = providerConfigs.filter((entry) => {
    if (!entry || typeof entry !== "object") {
      return true;
    }
    const existingId = Object.prototype.hasOwnProperty.call(entry, "id")
      ? entry.id
      : entry.provider;
    return existingId !== routeIdToReplace;
  });
  filtered.push(integrationConfig);
  return filtered;
}

function getConfigOptions(config) {
  if (!config || typeof config !== "object") {
    return {};
  }
  const { provider, id, ...options } = config;
  return options;
}

function buildEnvProviderConfigs(env) {
  const resolvedEnv = env || {};
  const baseConfigs = [
    {
      provider: PROVIDERS.ANTHROPIC,
      apiKey: resolvedEnv.ANTHROPIC_API_KEY,
      baseUrl: resolvedEnv.ANTHROPIC_BASE_URL,
      version: resolvedEnv.ANTHROPIC_VERSION,
    },
    {
      provider: PROVIDERS.OPENAI,
      apiKey: resolvedEnv.OPENAI_API_KEY,
      baseUrl: resolvedEnv.OPENAI_BASE_URL,
    },
    {
      provider: PROVIDERS.OPENAI_CHAT,
      apiKey: resolvedEnv.OPENAI_CHAT_API_KEY,
      baseUrl: resolvedEnv.OPENAI_CHAT_BASE_URL,
    },
    {
      provider: PROVIDERS.DEEPSEEK,
      apiKey: resolvedEnv.DEEPSEEK_API_KEY,
      baseUrl: resolvedEnv.DEEPSEEK_BASE_URL,
    },
    {
      provider: PROVIDERS.VOLCENGINE,
      apiKey: resolvedEnv.VOLCENGINE_API_KEY,
      baseUrl: resolvedEnv.VOLCENGINE_BASE_URL,
    },
    {
      provider: PROVIDERS.HUNYUAN,
      apiKey: resolvedEnv.HUNYUAN_API_KEY,
      baseUrl: resolvedEnv.HUNYUAN_BASE_URL,
    },
    {
      provider: PROVIDERS.ALIYUN,
      apiKey: resolvedEnv.ALIYUN_API_KEY,
      baseUrl: resolvedEnv.ALIYUN_BASE_URL,
    },
    {
      provider: PROVIDERS.MINIMAX,
      apiKey: resolvedEnv.MINIMAX_API_KEY,
      baseUrl: resolvedEnv.MINIMAX_BASE_URL,
    },
    {
      provider: PROVIDERS.MOONSHOT,
      apiKey: resolvedEnv.MOONSHOT_API_KEY,
      baseUrl: resolvedEnv.MOONSHOT_BASE_URL,
    },
    {
      provider: PROVIDERS.BEDROCK,
      apiKey: resolvedEnv.BEDROCK_API_KEY,
      baseUrl: resolvedEnv.BEDROCK_BASE_URL,
      region: resolvedEnv.BEDROCK_REGION,
    },
    {
      provider: PROVIDERS.OPENROUTER,
      apiKey: resolvedEnv.OPENROUTER_API_KEY,
      baseUrl: resolvedEnv.OPENROUTER_BASE_URL,
    },
    {
      provider: PROVIDERS.GROQ,
      apiKey: resolvedEnv.GROQ_API_KEY,
      baseUrl: resolvedEnv.GROQ_BASE_URL,
    },
    {
      provider: PROVIDERS.HUGGINGFACE,
      apiKey: resolvedEnv.HF_TOKEN || resolvedEnv.HUGGINGFACE_API_KEY,
      baseUrl: resolvedEnv.HUGGINGFACE_BASE_URL,
    },
    {
      provider: PROVIDERS.GOOGLE,
      apiKey: resolvedEnv.GEMINI_API_KEY,
      baseUrl: resolvedEnv.GEMINI_BASE_URL,
    },
    {
      provider: PROVIDERS.ZAI,
      apiKey: resolvedEnv.ZAI_API_KEY,
      baseUrl: resolvedEnv.ZAI_BASE_URL,
    },
    {
      provider: PROVIDERS.ZHIPUAI,
      apiKey: resolvedEnv.ZHIPUAI_API_KEY,
      baseUrl: resolvedEnv.ZHIPUAI_BASE_URL,
    },
    {
      provider: PROVIDERS.TOGETHER,
      apiKey: resolvedEnv.TOGETHER_API_KEY,
      baseUrl: resolvedEnv.TOGETHER_BASE_URL,
    },
    {
      provider: PROVIDERS.SILICONFLOW,
      apiKey: resolvedEnv.SILICONFLOW_API_KEY,
      baseUrl: resolvedEnv.SILICONFLOW_BASE_URL,
    },
    {
      provider: PROVIDERS.XIAOMIMIMO,
      apiKey: resolvedEnv.XIAOMIMIMO_API_KEY,
      baseUrl: resolvedEnv.XIAOMIMIMO_BASE_URL,
    },
    {
      provider: PROVIDERS.DEEPINFRA,
      apiKey: resolvedEnv.DEEPINFRA_API_KEY,
      baseUrl: resolvedEnv.DEEPINFRA_BASE_URL,
    },
    {
      provider: PROVIDERS.XAI,
      apiKey: resolvedEnv.XAI_API_KEY,
      baseUrl: resolvedEnv.XAI_BASE_URL,
    },
    {
      provider: PROVIDERS.NOVITA,
      apiKey: resolvedEnv.NOVITA_API_KEY,
      baseUrl: resolvedEnv.NOVITA_BASE_URL,
    },
    {
      provider: PROVIDERS.ATLASCLOUD,
      apiKey: resolvedEnv.ATLASCLOUD_API_KEY,
      baseUrl: resolvedEnv.ATLASCLOUD_BASE_URL,
    },
    {
      provider: PROVIDERS.VERTEX,
      clientEmail: resolvedEnv.VERTEX_CLIENT_EMAIL,
      privateKey: resolvedEnv.VERTEX_PRIVATE_KEY,
      project: resolvedEnv.VERTEX_PROJECT,
      location: resolvedEnv.VERTEX_LOCATION,
      baseUrl: resolvedEnv.VERTEX_BASE_URL,
    },
  ].filter((entry) => entry && entry.provider);

  const configs = [];
  const byProvider = new Map();
  for (const config of baseConfigs) {
    const providerMeta = PROVIDER_META_BY_ID.get(config.provider);
    if (!providerMeta) {
      continue;
    }
    const options = getConfigOptions(config);
    const missing = getMissingRequiredOptions(providerMeta, options);
    if (missing.length > 0) {
      continue;
    }
    configs.push(config);
    byProvider.set(config.provider, config);
  }

  return { configs, byProvider };
}

async function loadIntegrationById(db, userId, integrationId) {
  return await db
    .prepare(
      "SELECT id, provider_id, integration_id, options_json, always_use FROM integrations WHERE user_id = ? AND integration_id = ?",
    )
    .bind(userId, integrationId)
    .first();
}

async function loadRoutingRule(db, modelId) {
  const record = await db
    .prepare("SELECT routes_json as routesJson FROM routing_rules WHERE model_id = ?")
    .bind(modelId)
    .first();
  if (!record?.routesJson) {
    return null;
  }
  try {
    const parsed = JSON.parse(record.routesJson);
    const routes = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
        ? parsed.routes
        : null;
    return normalizeRoutingEntries(routes);
  } catch (err) {
    return null;
  }
}

function normalizeRoutingEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }
  const normalized = [];
  for (const entry of entries) {
    if (typeof entry === "string") {
      const provider = entry.trim();
      if (provider) {
        normalized.push({ provider, id: null, model: null });
      }
      continue;
    }
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const provider =
      typeof entry.provider === "string" ? entry.provider.trim() : "";
    if (!provider) {
      continue;
    }
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const model = typeof entry.model === "string" ? entry.model.trim() : "";
    normalized.push({
      provider,
      id: id || null,
      model: model || null,
    });
  }
  return normalized;
}

function buildRoutingAttempts(
  entries,
  modelId,
  providerConfigByProvider,
  providerConfigs,
) {
  const attempts = [];
  const configs = providerConfigs.slice();
  const seenRouteIds = new Set();

  for (const entry of entries) {
    const providerId = entry.provider;
    const providerMeta = PROVIDER_META_BY_ID.get(providerId);
    if (!providerMeta) {
      continue;
    }
    const baseConfig = providerConfigByProvider.get(providerId);
    if (!baseConfig) {
      continue;
    }
    const routeId = entry.id || providerId;
    if (seenRouteIds.has(routeId)) {
      continue;
    }
    if (entry.id && entry.id !== providerId) {
      configs.push({ ...baseConfig, id: routeId });
    }
    attempts.push({
      providerId,
      routeId,
      modelId: entry.model || modelId,
    });
    seenRouteIds.add(routeId);
  }

  return { attempts, providerConfigs: configs };
}

async function runNonStreamAttempts(client, attempts, body) {
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const payload = buildRequestPayload(
        body,
        attempt.routeId,
        attempt.modelId,
        false,
      );
      const response = await client.responses.create(payload, { strict: true });
      return { response, attempt };
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) {
    throw lastError;
  }
  throw new Error("Upstream error");
}

async function runStreamAttempts(client, attempts, body) {
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const payload = buildRequestPayload(
        body,
        attempt.routeId,
        attempt.modelId,
        true,
      );
      const events = await client.responses.create(payload, { strict: true });
      const iterator =
        events && typeof events[Symbol.asyncIterator] === "function"
          ? events[Symbol.asyncIterator]()
          : null;
      if (!iterator) {
        throw new Error("Stream iterator not available");
      }
      let first;
      try {
        first = await iterator.next();
      } catch (err) {
        lastError = err;
        continue;
      }
      if (first.done) {
        lastError = new Error("Empty stream");
        continue;
      }
      const chained = chainFirstEvent(first.value, iterator);
      return { events: chained, attempt };
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) {
    throw lastError;
  }
  throw new Error("Upstream error");
}

async function* chainFirstEvent(firstEvent, iterator) {
  if (firstEvent !== undefined) {
    yield firstEvent;
  }
  while (true) {
    const next = await iterator.next();
    if (next.done) {
      return;
    }
    yield next.value;
  }
}

function extractBearerToken(authHeader) {
  if (!authHeader || typeof authHeader !== "string") {
    return null;
  }
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  return token || null;
}

function getDb(c) {
  const db = c.env?.MY_DB;
  if (!db) {
    throw new Error("MY_DB is not configured.");
  }
  return db;
}

function extractUsage(response) {
  if (!response || typeof response !== "object") {
    return null;
  }
  const usage = response.usage;
  if (!usage || typeof usage !== "object") {
    return null;
  }
  const inputTokens = typeof usage.input_tokens === "number" ? usage.input_tokens : null;
  const outputTokens = typeof usage.output_tokens === "number" ? usage.output_tokens : null;
  const totalTokens = typeof usage.total_tokens === "number" ? usage.total_tokens : null;
  return { inputTokens, outputTokens, totalTokens };
}

function extractCostUsd(response) {
  if (!response || typeof response !== "object") {
    return null;
  }
  const usage = response.usage;
  if (!usage || typeof usage !== "object") {
    return null;
  }
  return coerceNumber(usage.cost);
}

function coerceNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeIntegrationId(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return DEFAULT_INTEGRATION_LOG_ID;
}

function coerceBigInt(value) {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^[+-]?\d+$/.test(trimmed)) {
      return BigInt(trimmed);
    }
  }
  return null;
}

function decimalStringToUnits(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/^([+-])?(\d+)(?:\.(\d+))?$/);
  if (!match) {
    return null;
  }
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = match[2];
  let fraction = match[3] || "";
  let roundUp = false;
  if (fraction.length > MONEY_SCALE_DIGITS) {
    roundUp = fraction[MONEY_SCALE_DIGITS] >= "5";
    fraction = fraction.slice(0, MONEY_SCALE_DIGITS);
  }
  const fractionPadded = fraction.padEnd(MONEY_SCALE_DIGITS, "0");
  let units = BigInt(whole) * MONEY_SCALE + BigInt(fractionPadded || "0");
  if (roundUp) {
    units += 1n;
  }
  return sign === -1n ? -units : units;
}

function decimalToUnits(value) {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return decimalStringToUnits(value.toFixed(MONEY_SCALE_DIGITS));
  }
  if (typeof value === "string") {
    return decimalStringToUnits(value);
  }
  return null;
}

function toDbInteger(value) {
  const coerced = coerceBigInt(value);
  return coerced === null ? null : coerced.toString();
}

async function* eventsToSSEWithLogging(events, options = {}) {
  const includeDone = options.includeDone !== false;
  const onComplete = typeof options.onComplete === "function"
    ? options.onComplete
    : null;
  let finalResponse = null;
  let streamError = null;
  let didComplete = false;

  try {
    for await (const event of events) {
      if (!event || typeof event !== "object") {
        continue;
      }
      if (event.type === "response.completed" || event.type === "response.failed") {
        finalResponse = event.response || null;
        if (onComplete && !didComplete) {
          didComplete = true;
          await onComplete({ response: finalResponse, error: null });
        }
      }
      const payload = JSON.stringify(event);
      yield `event: ${event.type}\n`;
      yield `data: ${payload}\n\n`;
    }

    if (includeDone) {
      yield "data: [DONE]\n\n";
    }
  } catch (err) {
    streamError = err;
    throw err;
  } finally {
    if (onComplete && !didComplete) {
      didComplete = true;
      await onComplete({ response: finalResponse, error: streamError });
    }
  }
}

async function writeRequestLog(db, details) {
  try {
    const now = Date.now();
    const duration = Math.max(0, now - details.startedAt);
    const costUnits = toDbInteger(details.costUnits);
    const integrationId = normalizeIntegrationId(details.integrationId);
    await db
      .prepare(
        "INSERT INTO request_logs (id, api_key_id, user_id, integration_id, provider, model, stream, status, response_status, finish_reason, input_tokens, output_tokens, total_tokens, cost_usd, feedback, feedback_text, error_code, error_message, created_at, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        crypto.randomUUID(),
        details.apiKeyId,
        details.userId,
        integrationId,
        details.provider,
        details.model,
        details.stream ? 1 : 0,
        details.status,
        details.responseStatus ?? null,
        details.finishReason ?? null,
        details.inputTokens ?? null,
        details.outputTokens ?? null,
        details.totalTokens ?? null,
        costUnits,
        details.feedback ?? null,
        details.feedbackText ?? null,
        details.errorCode ?? null,
        details.errorMessage ?? null,
        now,
        duration
      )
      .run();
  } catch (err) {
    console.warn("Failed to write request log", err);
  }
}

async function writeUsageAnalyticsEvent(env, details) {
  const analytics = env?.USAGE_ANALYTICS_ENGINE;
  if (!analytics || typeof analytics.writeDataPoint !== "function") {
    return;
  }
  const now = Date.now();
  const startedAt = typeof details?.startedAt === "number" ? details.startedAt : now;
  const durationMs = Math.max(0, now - startedAt);
  const integrationId = normalizeIntegrationId(details?.integrationId);

  const indexes = [details?.apiKeyId || "unknown"];

  const doubles = [
    coerceNumber(details?.costUsd) ?? 0,
    coerceNumber(details?.inputTokens) ?? 0,
    coerceNumber(details?.outputTokens) ?? 0,
    coerceNumber(details?.totalTokens) ?? 0,
    durationMs,
    typeof details?.status === "number" ? details.status : 0,
    details?.stream ? 1 : 0,
  ];

  const blobs = [
    details?.requestId || "",
    details?.model || "",
    details?.errorCode || "",
    details?.userId || "",
    details?.provider || "",
    integrationId,
  ];

  try {
    analytics.writeDataPoint({ indexes, doubles, blobs });
  } catch (err) {
    console.warn("Failed to write analytics event", err);
  }
}

async function applyBilling(db, details) {
  const requestId = details?.requestId;
  if (!requestId || typeof requestId !== "string") {
    return;
  }
  if (!details?.userId || !details?.apiKeyId) {
    return;
  }
  const costUnits = details?.costUnits;
  if (typeof costUnits !== "bigint" || costUnits < 0n) {
    return;
  }

  try {
    const now = Date.now();
    const billingId = crypto.randomUUID();
    const costUnitsText = costUnits.toString();
    await db.batch([
      db
        .prepare(
          "INSERT INTO billing_events (id, request_id, user_id, api_key_id, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(request_id) DO NOTHING"
        )
        .bind(
          billingId,
          requestId,
          details.userId,
          details.apiKeyId,
          costUnitsText,
          now
        ),
      db
        .prepare(
          "UPDATE users SET credits = credits - ? WHERE id = ? AND EXISTS (SELECT 1 FROM billing_events WHERE id = ?)"
        )
        .bind(costUnitsText, details.userId, billingId),
    ]);
  } catch (err) {
    console.warn("Failed to apply billing", err);
  }
}
