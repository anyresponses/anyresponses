const { generateId } = require("../utils/id");
const { nowSeconds } = require("../utils/time");
const { toAsyncIterable } = require("../utils/iter");
const { normalizeResponse } = require("../normalize/response");

function createAnthropicAdapter(adapterOptions = {}) {
  const provider = adapterOptions.provider || "anthropic";

  function toOpenResponse(input, options = {}) {
    if (!input || typeof input !== "object") {
      throw new TypeError("input must be an object");
    }

    const status = mapStatus(input);
    const responseId = input.id || options.response_id || generateId("resp");
    const createdAt = pickTimestamp(input.created_at, options.created_at, nowSeconds());
    const completedAt = pickTimestamp(input.completed_at, options.completed_at, status === "completed" ? nowSeconds() : null);
    const request = options.request || {};
    const output = buildOutputItems(input, status);
    const usage = buildUsage(input.usage, options.usage);

    const response = {
      id: responseId,
      object: "response",
      created_at: createdAt,
      completed_at: completedAt,
      status,
      incomplete_details: status === "incomplete" ? { reason: mapIncompleteReason(input.stop_reason) } : null,
      model: input.model || request.model || null,
      previous_response_id: request.previous_response_id || null,
      instructions: request.instructions || null,
      output,
      error: input.error || null,
      tools: request.tools || [],
      tool_choice: request.tool_choice || null,
      truncation: request.truncation || "disabled",
      parallel_tool_calls: Boolean(request.parallel_tool_calls),
      text: request.text || null,
      top_p: request.top_p ?? null,
      presence_penalty: request.presence_penalty ?? null,
      frequency_penalty: request.frequency_penalty ?? null,
      top_logprobs: request.top_logprobs ?? null,
      temperature: request.temperature ?? null,
      reasoning: request.reasoning || null,
      usage,
      max_output_tokens: request.max_output_tokens ?? null,
    };

    return normalizeResponse(response, request, { strict: options.strict !== false });
  }

  async function* toOpenStream(events, options = {}) {
    const iterable = toAsyncIterable(events);
    const state = createStreamState(options);
    const emitCreated = () => makeEvent("response.created", {
      response: buildResponseFromState(state, "in_progress"),
    }, state);
    const ensureMessageAdded = () => {
      if (state.messageAdded) {
        return null;
      }
      state.messageOutputIndex = state.nextOutputIndex;
      state.nextOutputIndex += 1;
      const item = buildMessageItem([], "in_progress", state.messageId);
      state.messageAdded = true;
      return makeEvent("response.output_item.added", {
        output_index: state.messageOutputIndex,
        item,
      }, state);
    };

    for await (const event of iterable) {
      if (!event || typeof event !== "object") {
        continue;
      }

      if (event.usage) {
        updateUsage(state, event.usage);
      }

      if (event.type === "message_start") {
        if (event.message && event.message.id) {
          state.responseId = event.message.id;
        }
        if (event.message && event.message.model) {
          state.model = event.message.model;
        }
        if (event.message && event.message.usage) {
          updateUsage(state, event.message.usage);
        }
        if (!state.responseStarted) {
          state.responseStarted = true;
          yield emitCreated();
          yield makeEvent("response.in_progress", {
            response: buildResponseFromState(state, "in_progress"),
          }, state);
        }
        const addedEvent = ensureMessageAdded();
        if (addedEvent) {
          yield addedEvent;
        }
      }

      if (!state.responseStarted) {
        state.responseStarted = true;
        yield emitCreated();
        yield makeEvent("response.in_progress", {
          response: buildResponseFromState(state, "in_progress"),
        }, state);
      }

      if (event.type === "content_block_start") {
        const block = event.content_block || {};
        if (block.type === "text") {
          const addedEvent = ensureMessageAdded();
          if (addedEvent) {
            yield addedEvent;
          }
          yield makeEvent("response.content_part.added", {
            item_id: state.messageId,
            output_index: state.messageOutputIndex,
            content_index: state.contentIndex,
            part: buildOutputTextPart(""),
          }, state);
          state.activeContentType = "text";
        }

        if (block.type === "tool_use") {
          const toolState = {
            id: block.id || generateId("call"),
            name: block.name || "tool",
            json: "",
          };
          state.toolBlocks.set(event.index, toolState);
        }
      }

      if (event.type === "content_block_delta") {
        const delta = event.delta || {};
        if (delta.type === "text_delta") {
          state.messageText += delta.text || "";
          yield makeEvent("response.output_text.delta", {
            item_id: state.messageId,
            output_index: state.messageOutputIndex,
            content_index: state.contentIndex,
            delta: delta.text || "",
            logprobs: [],
          }, state);
        }

        if (delta.type === "input_json_delta") {
          const toolState = state.toolBlocks.get(event.index);
          if (toolState) {
            toolState.json += delta.partial_json || "";
          }
        }
      }

      if (event.type === "content_block_stop") {
        const toolState = state.toolBlocks.get(event.index);
        if (state.activeContentType === "text") {
          yield makeEvent("response.output_text.done", {
            item_id: state.messageId,
            output_index: state.messageOutputIndex,
            content_index: state.contentIndex,
            text: state.messageText,
            logprobs: [],
          }, state);
          yield makeEvent("response.content_part.done", {
            item_id: state.messageId,
            output_index: state.messageOutputIndex,
            content_index: state.contentIndex,
            part: buildOutputTextPart(state.messageText),
          }, state);
          state.contentIndex += 1;
          state.activeContentType = null;
        }

        if (toolState) {
          const callItem = buildFunctionCallItem(toolState, "completed");
          const outputIndex = state.nextOutputIndex;
          state.nextOutputIndex += 1;
          yield makeEvent("response.output_item.added", {
            output_index: outputIndex,
            item: callItem,
          }, state);
          yield makeEvent("response.output_item.done", {
            output_index: outputIndex,
            item: callItem,
          }, state);
          state.toolCalls.push(toolState);
          state.toolBlocks.delete(event.index);
        }
      }

      if (event.type === "message_delta") {
        if (event.delta && event.delta.stop_reason) {
          state.stopReason = event.delta.stop_reason;
        }
      }

      if (event.type === "message_stop") {
        state.status = mapStopReasonToStatus(state.stopReason);
        if (state.messageAdded) {
          yield makeEvent("response.output_item.done", {
            output_index: state.messageOutputIndex,
            item: buildMessageItem([buildOutputTextPart(state.messageText)], state.status, state.messageId),
          }, state);
        }
        const responseEventType = state.status === "failed" ? "response.failed" : "response.completed";
        yield makeEvent(responseEventType, {
          response: buildResponseFromState(state, state.status),
        }, state);
      }
    }
  }

  return {
    provider,
    toOpenResponse,
    toOpenStream,
    capabilities: {
      streaming: true,
      tool_use: true,
      multimodal: false,
    },
  };
}

function buildOutputItems(input, status) {
  const items = [];
  const contentBlocks = normalizeContent(input.content);
  const messageContent = [];

  for (const block of contentBlocks) {
    if (block.type === "text") {
      messageContent.push(buildOutputTextPart(block.text || ""));
      continue;
    }
    if (block.type === "tool_use") {
      const toolState = {
        id: block.id,
        name: block.name,
        json: stringifyToolInput(block.input),
      };
      items.push(buildFunctionCallItem(toolState, status));
    }
  }

  if (messageContent.length > 0) {
    items.unshift(buildMessageItem(messageContent, status, generateId("msg")));
  }

  return items;
}

function buildMessageItem(content, status, id) {
  return {
    id,
    type: "message",
    role: "assistant",
    status: status || "completed",
    content,
  };
}

function buildOutputTextPart(text) {
  return {
    type: "output_text",
    text,
    annotations: [],
    logprobs: [],
  };
}

function buildFunctionCallItem(toolState, status) {
  const callId = toolState.id || generateId("call");
  return {
    id: callId,
    type: "function_call",
    call_id: callId,
    name: toolState.name || "tool",
    arguments: toolState.json || "{}",
    status: status || "completed",
  };
}

function mapStatus(input) {
  if (input.error || input.stop_reason === "error") {
    return "failed";
  }
  if (input.stop_reason === "max_tokens" || input.stop_reason === "length") {
    return "incomplete";
  }
  return "completed";
}

function mapStopReasonToStatus(stopReason) {
  if (stopReason === "error") {
    return "failed";
  }
  if (stopReason === "max_tokens" || stopReason === "length") {
    return "incomplete";
  }
  return "completed";
}

function mapIncompleteReason(stopReason) {
  if (stopReason === "max_tokens" || stopReason === "length") {
    return "max_output_tokens";
  }
  return "unknown";
}

function normalizeContent(content) {
  if (!content) {
    return [];
  }
  if (Array.isArray(content)) {
    return content;
  }
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return [];
}

function stringifyToolInput(input) {
  if (typeof input === "string") {
    return input;
  }
  try {
    return JSON.stringify(input ?? {});
  } catch (err) {
    return String(input);
  }
}

function buildUsage(primary, fallback) {
  const usage = primary || fallback || {};
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const inputTokensDetails = {
    cached_tokens: usage.cached_tokens
      ?? usage.input_tokens_details?.cached_tokens
      ?? usage.cache_read_input_tokens
      ?? 0,
  };
  const outputTokensDetails = {
    reasoning_tokens: usage.reasoning_tokens
      ?? usage.output_tokens_details?.reasoning_tokens
      ?? 0,
  };
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    input_tokens_details: inputTokensDetails,
    output_tokens_details: outputTokensDetails,
  };
}

function pickTimestamp(primary, fallback, defaultValue) {
  if (typeof primary === "number") {
    return primary;
  }
  if (typeof fallback === "number") {
    return fallback;
  }
  return defaultValue;
}

function createStreamState(options) {
  const request = options.request || {};
  return {
    sequence: 0,
    responseId: options.response_id || generateId("resp"),
    messageId: options.message_id || generateId("msg"),
    messageOutputIndex: null,
    nextOutputIndex: 0,
    contentIndex: 0,
    messageAdded: false,
    activeContentType: null,
    toolBlocks: new Map(),
    toolCalls: [],
    stopReason: null,
    status: "in_progress",
    responseStarted: false,
    messageText: "",
    usage: null,
    request,
    model: request.model || null,
    createdAt: nowSeconds(),
    strict: options.strict !== false,
  };
}

function makeEvent(type, payload, state) {
  state.sequence += 1;
  return {
    type,
    sequence_number: state.sequence,
    ...payload,
  };
}

function buildResponseFromState(state, status) {
  const output = status === "in_progress" ? [] : buildOutputItemsFromState(state, status);
  const response = {
    id: state.responseId,
    object: "response",
    created_at: state.createdAt,
    completed_at: status === "completed" ? nowSeconds() : null,
    status,
    incomplete_details: status === "incomplete" ? { reason: mapIncompleteReason(state.stopReason) } : null,
    model: state.model || "unknown",
    previous_response_id: state.request.previous_response_id || null,
    instructions: state.request.instructions || null,
    output,
    error: null,
    tools: state.request.tools || [],
    tool_choice: state.request.tool_choice || null,
    truncation: state.request.truncation || "disabled",
    parallel_tool_calls: Boolean(state.request.parallel_tool_calls),
    text: state.request.text || null,
    top_p: state.request.top_p ?? null,
    presence_penalty: state.request.presence_penalty ?? null,
    frequency_penalty: state.request.frequency_penalty ?? null,
    top_logprobs: state.request.top_logprobs ?? null,
    temperature: state.request.temperature ?? null,
    reasoning: state.request.reasoning || null,
    usage: state.usage ? buildUsage(state.usage, null) : null,
    max_output_tokens: state.request.max_output_tokens ?? null,
  };

  return normalizeResponse(response, state.request, { strict: state.strict });
}

function updateUsage(state, usage) {
  if (!usage || typeof usage !== "object") {
    return;
  }
  if (!state.usage) {
    state.usage = {};
  }
  if (typeof usage.input_tokens === "number") {
    state.usage.input_tokens = usage.input_tokens;
  }
  if (typeof usage.output_tokens === "number") {
    state.usage.output_tokens = usage.output_tokens;
  }
  if (typeof usage.cached_tokens === "number") {
    state.usage.cached_tokens = usage.cached_tokens;
  }
  if (typeof usage.cache_read_input_tokens === "number" && state.usage.cached_tokens === undefined) {
    state.usage.cached_tokens = usage.cache_read_input_tokens;
  }
  if (typeof usage.reasoning_tokens === "number") {
    state.usage.reasoning_tokens = usage.reasoning_tokens;
  }
}

function buildOutputItemsFromState(state, status) {
  const content = [];
  if (state.messageText) {
    content.push({ type: "text", text: state.messageText });
  }
  for (const toolCall of state.toolCalls) {
    content.push({
      type: "tool_use",
      id: toolCall.id,
      name: toolCall.name,
      input: safeParseJson(toolCall.json),
    });
  }
  if (content.length === 0) {
    return [];
  }
  return buildOutputItems({ content }, status);
}

function safeParseJson(value) {
  if (typeof value !== "string") {
    return value || {};
  }
  try {
    return JSON.parse(value);
  } catch (err) {
    return {};
  }
}

module.exports = {
  createAnthropicAdapter,
};
