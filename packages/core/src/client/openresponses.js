const { createAnthropicClient } = require("./anthropic");
const { createOpenAIClient, createOpenAIChatClient } = require("./openai");
const { createBedrockClient } = require("./bedrock");
const { createGeminiClient } = require("./gemini");
const { createVertexClient } = require("./vertex");
const { buildAnthropicRequest } = require("../providers/anthropic/request");
const { buildOpenAIRequest } = require("../providers/openai/request");
const { buildBedrockConverseRequest } = require("../providers/bedrock/request");
const { buildGeminiRequest } = require("../providers/gemini/request");

const PROVIDERS_CONFIG = loadProvidersConfig(
  require("../../reference/providers.json"),
);
const PROVIDER_META = Array.isArray(PROVIDERS_CONFIG.providers)
  ? PROVIDERS_CONFIG.providers
  : [];
const PROVIDER_META_BY_ID = new Map(
  PROVIDER_META.map((entry) => [entry.id, entry]),
);
const PROVIDERS = Object.freeze(buildProviderConstants(PROVIDER_META));
const PROVIDER_VALUES = new Set(Object.values(PROVIDERS));
const PROVIDER_ENV_PREFIXES = Object.freeze(buildEnvPrefixes(PROVIDER_META));
const PROVIDER_DEFAULTS = Object.freeze(buildProviderDefaults(PROVIDER_META));

const CLIENT_FACTORIES = Object.freeze({
  openai: createOpenAIClient,
  "openai-chat": createOpenAIChatClient,
  anthropic: createAnthropicClient,
  bedrock: createBedrockClient,
  gemini: createGeminiClient,
  vertex: createVertexClient,
});
const MODE_TO_CLIENT = Object.freeze({
  "openai-responses": "openai",
  "openai-chat": "openai-chat",
  "anthropic-messages": "anthropic",
  "bedrock-converse": "bedrock",
  gemini: "gemini",
  "vertex-gemini": "vertex",
});
const REQUEST_BUILDERS = Object.freeze({
  openai: buildOpenAIRequest,
  anthropic: buildAnthropicRequest,
  bedrock: buildBedrockConverseRequest,
  gemini: buildGeminiRequest,
});
const MODE_TO_REQUEST_BUILDER = Object.freeze({
  "openai-responses": "openai",
  "openai-chat": "openai",
  "anthropic-messages": "anthropic",
  "bedrock-converse": "bedrock",
  gemini: "gemini",
  "vertex-gemini": "gemini",
});

const ENV_FIELD_MAP = Object.freeze({
  API_KEY: "apiKey",
  BASE_URL: "baseUrl",
  CLIENT_EMAIL: "clientEmail",
  PRIVATE_KEY: "privateKey",
  PROJECT: "project",
  LOCATION: "location",
  REGION: "region",
  VERSION: "version",
  SCOPES: "scopes",
});
const ENV_FIELDS = Object.freeze(Object.keys(ENV_FIELD_MAP));
const OFFICIAL_ENV_KEY = "ANYRESPONSES_API_KEY";
const OFFICIAL_BASE_URL = "https://api.anyresponses.com/responses";
const OFFICIAL_PROVIDER = "anyresponses";

class AnyResponses {
  constructor(options = {}, internal = {}) {
    this._clientCache = new Map();
    this._officialClient = null;
    const { allowEnvFallback = true, env } = internal || {};
    const envSource = env === undefined ? getProcessEnv() : env;
    const hasOfficialOptions = isOfficialOptionsOnly(options) && hasValue(options.apiKey);
    const officialApiKey = resolveOfficialApiKey(options, envSource);
    const hasOfficialApiKey = hasValue(officialApiKey);
    const normalizedOptions = hasOfficialApiKey ? [] : options;
    const normalizedAllowEnv = hasOfficialApiKey ? false : allowEnvFallback;
    this._providerConfigs = normalizeProviderOptions(normalizedOptions, {
      allowEnvFallback: normalizedAllowEnv,
      env,
    });
    this._officialConfig = shouldUseOfficialMode(officialApiKey)
      ? { apiKey: officialApiKey, baseUrl: OFFICIAL_BASE_URL }
      : null;

    this.responses = {
      create: this.createResponse.bind(this),
    };
  }

  static fromEnv(env, options = []) {
    const envOptions = loadProviderConfigsFromEnv(env);
    const optionList = normalizeOptionsList(options);
    const mergedOptions = mergeProviderOptions(envOptions, optionList);
    return new AnyResponses(mergedOptions, { allowEnvFallback: false, env });
  }

  async createResponse(openRequest, requestOptions = {}) {
    if (this._officialConfig) {
      const client = this._getOfficialClient();
      const providerRequest = buildOpenAIRequest(openRequest);
      if (openRequest?.stream) {
        return client.streamResponse(providerRequest, {
          ...requestOptions,
          requestContext: openRequest,
        });
      }
      return client.createResponse(providerRequest, {
        ...requestOptions,
        requestContext: openRequest,
      });
    }
    const resolved = resolveRouteModel(openRequest?.model);
    const config = this._getProviderConfig(resolved.routeId);
    const client = this._getClient(resolved.routeId);
    const providerRequest = buildProviderRequest(
      config.provider,
      openRequest,
      resolved.model,
    );

    if (openRequest?.stream) {
      return client.streamResponse(providerRequest, {
        ...requestOptions,
        requestContext: openRequest,
      });
    }

    return client.createResponse(providerRequest, {
      ...requestOptions,
      requestContext: openRequest,
    });
  }

  _getProviderConfig(routeId) {
    const config = this._providerConfigs.get(routeId);
    if (!config) {
      const configured = Array.from(this._providerConfigs.keys()).sort();
      const configuredHint = configured.length > 0
        ? configured.join(", ")
        : "none";
      throw new Error(
        `Unsupported provider id: ${routeId}. Configured ids: ${configuredHint}`,
      );
    }
    return config;
  }

  _getOfficialClient() {
    if (this._officialClient) {
      return this._officialClient;
    }
    if (!this._officialConfig) {
      throw new Error("Official API key is not configured");
    }
    const client = createOpenAIClient({
      apiKey: this._officialConfig.apiKey,
      baseUrl: this._officialConfig.baseUrl,
      provider: OFFICIAL_PROVIDER,
    });
    this._officialClient = client;
    return client;
  }

  _getClient(routeId) {
    if (this._clientCache.has(routeId)) {
      return this._clientCache.get(routeId);
    }
    const config = this._getProviderConfig(routeId);
    const provider = config.provider;
    const options = {
      ...(PROVIDER_DEFAULTS[provider] || {}),
      ...(config.options || {}),
    };
    const meta = getProviderMeta(provider);
    const clientKey = meta.client || MODE_TO_CLIENT[meta.mode];
    const createClient = CLIENT_FACTORIES[clientKey];
    if (!createClient) {
      throw new Error(
        `Unsupported provider client: ${clientKey || "unknown"} for ${provider}`,
      );
    }
    const client = createClient(options);
    this._clientCache.set(routeId, client);
    return client;
  }
}

function isOfficialOptionsOnly(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(options, "apiKey")) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(options, "provider")) {
    return false;
  }
  return true;
}

function resolveOfficialApiKey(options, env) {
  if (isOfficialOptionsOnly(options) && hasValue(options.apiKey)) {
    return options.apiKey;
  }
  if (env && hasValue(env[OFFICIAL_ENV_KEY])) {
    return env[OFFICIAL_ENV_KEY];
  }
  return null;
}

function shouldUseOfficialMode(apiKey) {
  return hasValue(apiKey);
}

function normalizeProviderOptions(options, { allowEnvFallback = true, env } = {}) {
  const list = normalizeOptionsList(options);
  let resolvedOptions = list;
  if (resolvedOptions.length === 0 && allowEnvFallback) {
    const envSource = env === undefined ? getProcessEnv() : env;
    resolvedOptions = loadProviderConfigsFromEnv(envSource);
  }
  const resolved = new Map();
  for (let i = 0; i < resolvedOptions.length; i += 1) {
    const entry = resolvedOptions[i];
    if (!entry || typeof entry !== "object") {
      throw new TypeError(`Provider config at index ${i} must be an object`);
    }
    const provider = entry.provider;
    if (!provider || typeof provider !== "string") {
      throw new Error(
        `Provider config at index ${i} must include a non-empty provider`,
      );
    }
    if (!PROVIDER_VALUES.has(provider)) {
      const supported = Array.from(PROVIDER_VALUES).sort().join(", ");
      throw new Error(
        `Unsupported provider: ${provider}. Supported providers: ${supported}`,
      );
    }
    let id = entry.id;
    if (Object.prototype.hasOwnProperty.call(entry, "id")) {
      if (!id || typeof id !== "string" || !id.trim()) {
        throw new Error(
          `Provider config at index ${i} must include a non-empty id when provided`,
        );
      }
    }
    const routeId = id ? id : provider;
    if (resolved.has(routeId)) {
      throw new Error(`Duplicate provider id: ${routeId}`);
    }
    const { provider: _ignored, id: _ignoredId, ...rest } = entry;
    resolved.set(routeId, { provider, options: rest });
  }
  return resolved;
}

function normalizeOptionsList(options) {
  if (options == null) {
    return [];
  }
  if (Array.isArray(options)) {
    return options;
  }
  if (typeof options === "object") {
    if (Object.prototype.hasOwnProperty.call(options, "provider")) {
      return [options];
    }
    if (Object.keys(options).length === 0) {
      return [];
    }
    throw new Error(
      "AnyResponses options must be an array of provider configs or a single config with provider. Object keyed by provider is no longer supported.",
    );
  }
  throw new TypeError(
    "AnyResponses options must be an array or an object with provider",
  );
}

function mergeProviderOptions(envOptions, optionList) {
  const merged = Array.isArray(envOptions) ? envOptions.slice() : [];
  if (!Array.isArray(optionList) || optionList.length === 0) {
    return merged;
  }

  const getRouteId = (entry) => {
    if (!entry || typeof entry !== "object") {
      return null;
    }
    if (Object.prototype.hasOwnProperty.call(entry, "id")) {
      return entry.id;
    }
    return entry.provider;
  };

  for (const entry of optionList) {
    const routeId = getRouteId(entry);
    if (routeId === null || routeId === undefined) {
      merged.push(entry);
      continue;
    }
    const index = merged.findIndex(
      (item) => getRouteId(item) === routeId,
    );
    if (index === -1) {
      merged.push(entry);
    } else {
      merged[index] = entry;
    }
  }

  return merged;
}

function getProcessEnv() {
  if (typeof process !== "undefined" && process && process.env) {
    return process.env;
  }
  return {};
}

function loadProviderConfigsFromEnv(env) {
  if (!env || typeof env !== "object") {
    return [];
  }
  const configs = new Map();
  const prefixes = Object.entries(PROVIDER_ENV_PREFIXES)
    .map(([provider, prefix]) => ({ provider, prefix }))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  const envKeys = Object.keys(env);
  const fieldSet = new Set(ENV_FIELDS);
  const fieldSuffixes = ENV_FIELDS.map((field) => `_${field}`);

  const ensureConfig = (routeId, provider) => {
    const existing = configs.get(routeId);
    if (existing) {
      if (existing.provider !== provider) {
        throw new Error(`Duplicate provider id: ${routeId}`);
      }
      return existing;
    }
    const created = { provider, options: {} };
    configs.set(routeId, created);
    return created;
  };

  const setField = (config, field, value) => {
    if (value == null || value === "") {
      return;
    }
    const key = ENV_FIELD_MAP[field];
    config.options[key] = value;
  };

  for (const key of envKeys) {
    const match = prefixes.find((entry) => key.startsWith(`${entry.prefix}_`));
    if (!match) {
      continue;
    }
    const rest = key.slice(match.prefix.length + 1);
    if (!rest) {
      continue;
    }
    if (fieldSet.has(rest)) {
      const config = ensureConfig(match.provider, match.provider);
      setField(config, rest, env[key]);
      continue;
    }
    const suffixIndex = fieldSuffixes.findIndex((suffix) =>
      rest.endsWith(suffix),
    );
    if (suffixIndex === -1) {
      continue;
    }
    const field = ENV_FIELDS[suffixIndex];
    const rawId = rest.slice(0, -field.length - 1);
    if (!rawId) {
      continue;
    }
    const routeId = rawId.toLowerCase();
    const config = ensureConfig(routeId, match.provider);
    setField(config, field, env[key]);
  }

  applyEnvAliases(env, ensureConfig);

  const list = [];
  for (const [routeId, config] of configs.entries()) {
    const meta = getProviderMeta(config.provider);
    if (!hasRequiredOptions(config.options, meta)) {
      continue;
    }
    const entry = { provider: config.provider, ...config.options };
    if (routeId !== config.provider) {
      entry.id = routeId;
    }
    list.push(entry);
  }
  return list;
}

function resolveRouteModel(model) {
  if (typeof model !== "string" || !model.includes("/")) {
    throw new Error(
      "model must include provider id prefix, e.g. id/model_id",
    );
  }
  const parts = model.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error(
      "model must include provider id prefix, e.g. id/model_id",
    );
  }
  return { routeId: parts[0], model: parts.slice(1).join("/") };
}

function buildProviderRequest(resolvedProvider, openRequest, modelId) {
  const payload = {
    ...openRequest,
    model: modelId,
  };
  const meta = getProviderMeta(resolvedProvider);
  const builderKey = meta.request_builder || MODE_TO_REQUEST_BUILDER[meta.mode];
  const builder = REQUEST_BUILDERS[builderKey];
  if (!builder) {
    throw new Error(
      `Unsupported request builder: ${builderKey || "unknown"} for ${resolvedProvider}`,
    );
  }
  return builder(payload);
}

function loadProvidersConfig(config) {
  if (!config || !Array.isArray(config.providers)) {
    throw new Error("Invalid providers config: providers must be an array");
  }
  return config;
}

function buildProviderConstants(providers) {
  const constants = {};
  for (const entry of providers) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const id = entry.id;
    const key = entry.key || toProviderKey(id);
    if (!id || !key) {
      throw new Error("Provider config must include id and key");
    }
    if (constants[key]) {
      throw new Error(`Duplicate provider key: ${key}`);
    }
    constants[key] = id;
  }
  return constants;
}

function buildEnvPrefixes(providers) {
  const prefixes = {};
  for (const entry of providers) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const id = entry.id;
    const prefix = entry.env_prefix || deriveEnvPrefix(entry);
    if (!id || !prefix) {
      throw new Error(`Provider config missing env_prefix: ${id}`);
    }
    prefixes[id] = prefix;
  }
  return prefixes;
}

function buildProviderDefaults(providers) {
  const defaults = {};
  for (const entry of providers) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const id = entry.id;
    if (!id) {
      continue;
    }
    const options = {};
    if (entry.default_base_url) {
      options.defaultBaseUrl = entry.default_base_url;
    }
    if (entry.default_region) {
      options.defaultRegion = entry.default_region;
    }
    if (entry.default_options && typeof entry.default_options === "object") {
      Object.assign(options, entry.default_options);
    }
    if (Object.keys(options).length > 0) {
      defaults[id] = options;
    }
  }
  return defaults;
}

function getProviderMeta(providerId) {
  const meta = PROVIDER_META_BY_ID.get(providerId);
  if (!meta) {
    throw new Error(`Unsupported provider: ${providerId}`);
  }
  return meta;
}

function applyEnvAliases(env, ensureConfig) {
  for (const entry of PROVIDER_META) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const aliases = entry.env && Array.isArray(entry.env.aliases)
      ? entry.env.aliases
      : [];
    if (aliases.length === 0) {
      continue;
    }
    for (const alias of aliases) {
      if (!alias) {
        continue;
      }
      const value = env[alias];
      if (value == null || value === "") {
        continue;
      }
      const config = ensureConfig(entry.id, entry.id);
      if (!config.options.apiKey) {
        config.options.apiKey = value;
      }
    }
  }
}

function hasRequiredOptions(options, meta) {
  const resolved = options || {};
  const required = Array.isArray(meta.required_options)
    ? meta.required_options
    : [];
  for (const key of required) {
    if (!hasValue(resolved[key])) {
      return false;
    }
  }
  const requiredOneOf = Array.isArray(meta.required_one_of)
    ? meta.required_one_of
    : [];
  if (requiredOneOf.length > 0) {
    const satisfied = requiredOneOf.some((group) => {
      if (!Array.isArray(group) || group.length === 0) {
        return false;
      }
      return group.every((key) => hasValue(resolved[key]));
    });
    if (!satisfied) {
      return false;
    }
  }
  return true;
}

function hasValue(value) {
  return value != null && value !== "";
}

function toProviderKey(id) {
  if (typeof id !== "string") {
    return "";
  }
  return id.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function deriveEnvPrefix(entry) {
  if (!entry || typeof entry !== "object") {
    return "";
  }
  const env = entry.env || {};
  const required = Array.isArray(env.required) ? env.required : [];
  const candidate = required.find((name) => name.endsWith("_API_KEY"));
  if (!candidate) {
    return "";
  }
  return candidate.slice(0, -"_API_KEY".length);
}

module.exports = {
  AnyResponses,
  PROVIDERS,
};
