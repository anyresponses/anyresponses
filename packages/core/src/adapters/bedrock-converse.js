const { generateId } = require("../utils/id");
const { nowSeconds } = require("../utils/time");
const { toAsyncIterable } = require("../utils/iter");
const { normalizeResponse } = require("../normalize/response");

function createBedrockConverseAdapter(adapterOptions = {}) {
  const provider = adapterOptions.provider || "bedrock";

  function toOpenResponse(input, options = {}) {
    if (!input || typeof input !== "object") {
      throw new TypeError("input must be an object");
    }

    const request = options.request || {};
    const stopReason = input.stopReason || input.stop_reason || null;
    const status = mapStatus(stopReason, input.error);
    const createdAt = pickTimestamp(input.createdAt, options.created_at, nowSeconds());
    const completedAt = status === "completed" ? nowSeconds() : null;
    const message = input.output?.message || input.output?.messages?.[0] || input.message || null;

    const response = {
      id: input.id || options.response_id || generateId("resp"),
      object: "response",
      created_at: createdAt,
      completed_at: completedAt,
      status,
      incomplete_details: status === "incomplete" ? { reason: mapIncompleteReason(stopReason) } : null,
      model: request.model || input.modelId || input.model || null,
      previous_response_id: request.previous_response_id || null,
      instructions: request.instructions || null,
      output: buildOutputItems(message, status),
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
      usage: buildUsage(input.usage, options.usage),
      max_output_tokens: request.max_output_tokens ?? null,
      max_tool_calls: request.max_tool_calls ?? null,
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
      state.messageAdded = true;
      return makeEvent("response.output_item.added", {
        output_index: state.messageOutputIndex,
        item: buildMessageItem([], "in_progress", state.messageId),
      }, state);
    };
    const ensureResponseStarted = () => {
      if (state.responseStarted) {
        return null;
      }
      state.responseStarted = true;
      return [
        emitCreated(),
        makeEvent("response.in_progress", {
          response: buildResponseFromState(state, "in_progress"),
        }, state),
      ];
    };

    for await (const rawEvent of iterable) {
      const normalized = coerceBedrockEvent(rawEvent);
      if (!normalized) {
        continue;
      }

      const startedEvents = ensureResponseStarted();
      if (startedEvents) {
        for (const event of startedEvents) {
          yield event;
        }
      }

      if (normalized.type === "messageStart") {
        const payload = normalized.payload || {};
        if (payload.modelId) {
          state.model = payload.modelId;
        }
        const addedEvent = ensureMessageAdded();
        if (addedEvent) {
          yield addedEvent;
        }
      }

      if (normalized.type === "contentBlockStart") {
        const payload = normalized.payload || {};
        const index = payload.contentBlockIndex ?? payload.index ?? 0;
        const start = payload.start || {};
        if (start.text != null) {
          const addedEvent = ensureMessageAdded();
          if (addedEvent) {
            yield addedEvent;
          }
          state.activeContentIndex = state.contentIndex;
          state.activeContentText = "";
          yield makeEvent("response.content_part.added", {
            item_id: state.messageId,
            output_index: state.messageOutputIndex,
            content_index: state.activeContentIndex,
            part: buildOutputTextPart(""),
          }, state);
        }
        if (start.toolUse) {
          const toolUse = start.toolUse;
          state.toolBlocks.set(index, {
            id: toolUse.toolUseId || generateId("call"),
            name: toolUse.name || "tool",
            json: stringifyToolInput(toolUse.input),
          });
        }
      }

      if (normalized.type === "contentBlockDelta") {
        const payload = normalized.payload || {};
        const index = payload.contentBlockIndex ?? payload.index ?? 0;
        const delta = payload.delta || {};
        if (delta.text != null) {
          const text = delta.text || "";
          state.messageText += text;
          state.activeContentText += text;
          yield makeEvent("response.output_text.delta", {
            item_id: state.messageId,
            output_index: state.messageOutputIndex,
            content_index: state.activeContentIndex || 0,
            delta: text,
            logprobs: [],
          }, state);
        }
        if (delta.toolUse) {
          const toolState = state.toolBlocks.get(index);
          if (toolState) {
            appendToolInput(toolState, delta.toolUse.input);
          }
        }
      }

      if (normalized.type === "contentBlockStop") {
        const payload = normalized.payload || {};
        const index = payload.contentBlockIndex ?? payload.index ?? 0;
        if (state.activeContentText != null) {
          const text = state.activeContentText;
          yield makeEvent("response.output_text.done", {
            item_id: state.messageId,
            output_index: state.messageOutputIndex,
            content_index: state.activeContentIndex || 0,
            text,
            logprobs: [],
          }, state);
          yield makeEvent("response.content_part.done", {
            item_id: state.messageId,
            output_index: state.messageOutputIndex,
            content_index: state.activeContentIndex || 0,
            part: buildOutputTextPart(text),
          }, state);
          state.contentIndex += 1;
          state.activeContentIndex = null;
          state.activeContentText = null;
        }
        const toolState = state.toolBlocks.get(index);
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
          state.toolBlocks.delete(index);
        }
      }

      if (normalized.type === "messageStop") {
        const payload = normalized.payload || {};
        state.stopReason = payload.stopReason || payload.stop_reason || state.stopReason;
        state.status = mapStopReasonToStatus(state.stopReason);
        if (state.messageAdded && !state.messageDone) {
          yield makeEvent("response.output_item.done", {
            output_index: state.messageOutputIndex,
            item: buildMessageItem(
              state.messageText ? [buildOutputTextPart(state.messageText)] : [],
              state.status,
              state.messageId,
            ),
          }, state);
          state.messageDone = true;
        }
        state.pendingCompletion = true;
      }

      if (normalized.type === "metadata") {
        const payload = normalized.payload || {};
        if (payload.usage) {
          state.usage = payload.usage;
        }
      }
    }

    if (!state.responseStarted) {
      return;
    }

    const finalStatus = state.status || mapStopReasonToStatus(state.stopReason);
    if (state.messageAdded && !state.messageDone) {
      yield makeEvent("response.output_item.done", {
        output_index: state.messageOutputIndex,
        item: buildMessageItem(
          state.messageText ? [buildOutputTextPart(state.messageText)] : [],
          finalStatus,
          state.messageId,
        ),
      }, state);
      state.messageDone = true;
    }

    const responseEventType = finalStatus === "failed" ? "response.failed" : "response.completed";
    yield makeEvent(responseEventType, {
      response: buildResponseFromState(state, finalStatus),
    }, state);
  }

  return {
    provider,
    toOpenResponse,
    toOpenStream,
    capabilities: {
      streaming: true,
      tool_use: true,
      multimodal: true,
    },
  };
}

function buildOutputItems(message, status) {
  if (!message || typeof message !== "object") {
    return [];
  }
  const items = [];
  const contentBlocks = normalizeContentBlocks(message.content);
  const messageContent = [];

  for (const block of contentBlocks) {
    if (block && typeof block === "object" && block.text != null) {
      messageContent.push(buildOutputTextPart(block.text || ""));
      continue;
    }
    if (block && typeof block === "object" && block.toolUse) {
      const toolUse = block.toolUse;
      items.push(buildFunctionCallItem({
        id: toolUse.toolUseId || generateId("call"),
        name: toolUse.name || "tool",
        json: stringifyToolInput(toolUse.input),
      }, status));
    }
  }

  if (messageContent.length > 0) {
    items.unshift(buildMessageItem(messageContent, status, generateId("msg")));
  }

  return items;
}

function normalizeContentBlocks(content) {
  if (!content) {
    return [];
  }
  if (Array.isArray(content)) {
    return content;
  }
  if (typeof content === "string") {
    return [{ text: content }];
  }
  return [];
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

function mapStatus(stopReason, error) {
  if (error) {
    return "failed";
  }
  if (stopReason === "max_tokens" || stopReason === "length") {
    return "incomplete";
  }
  if (stopReason === "content_filtered" || stopReason === "guardrail_intervened") {
    return "failed";
  }
  return "completed";
}

function mapStopReasonToStatus(stopReason) {
  if (stopReason === "max_tokens" || stopReason === "length") {
    return "incomplete";
  }
  if (stopReason === "content_filtered" || stopReason === "guardrail_intervened") {
    return "failed";
  }
  return "completed";
}

function mapIncompleteReason(stopReason) {
  if (stopReason === "max_tokens" || stopReason === "length") {
    return "max_output_tokens";
  }
  return "unknown";
}

function buildUsage(primary, fallback) {
  const usage = primary || fallback || {};
  const inputTokens = usage.inputTokens ?? usage.input_tokens ?? 0;
  const outputTokens = usage.outputTokens ?? usage.output_tokens ?? 0;
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: usage.totalTokens ?? usage.total_tokens ?? inputTokens + outputTokens,
    input_tokens_details: {
      cached_tokens: usage.cachedTokens ?? usage.cached_tokens ?? 0,
    },
    output_tokens_details: {
      reasoning_tokens: usage.reasoningTokens ?? usage.reasoning_tokens ?? 0,
    },
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
    responseStarted: false,
    messageDone: false,
    pendingCompletion: false,
    activeContentIndex: null,
    activeContentText: null,
    messageText: "",
    toolBlocks: new Map(),
    toolCalls: [],
    stopReason: null,
    status: "in_progress",
    request,
    model: request.model || null,
    createdAt: nowSeconds(),
    strict: options.strict !== false,
    usage: null,
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
    max_tool_calls: state.request.max_tool_calls ?? null,
  };

  return normalizeResponse(response, state.request, { strict: state.strict });
}

function buildOutputItemsFromState(state, status) {
  const content = [];
  if (state.messageText) {
    content.push({ text: state.messageText });
  }
  for (const toolCall of state.toolCalls) {
    content.push({
      toolUse: {
        toolUseId: toolCall.id,
        name: toolCall.name,
        input: safeParseJson(toolCall.json),
      },
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

function stringifyToolInput(input) {
  if (typeof input === "string") {
    return input;
  }
  if (input == null) {
    return "";
  }
  try {
    return JSON.stringify(input);
  } catch (err) {
    return String(input);
  }
}

function appendToolInput(toolState, input) {
  if (!toolState) {
    return;
  }
  if (typeof input === "string") {
    toolState.json += input;
    return;
  }
  if (input == null) {
    return;
  }
  const serialized = stringifyToolInput(input);
  if (!serialized) {
    return;
  }
  toolState.json = toolState.json ? toolState.json + serialized : serialized;
}

function coerceBedrockEvent(event) {
  if (!event || typeof event !== "object") {
    return null;
  }

  if (typeof event.type === "string") {
    const payload = event[event.type] || event.data || event.payload || null;
    return { type: event.type, payload };
  }

  const keys = [
    "messageStart",
    "contentBlockStart",
    "contentBlockDelta",
    "contentBlockStop",
    "messageStop",
    "metadata",
    "error",
  ];
  for (const key of keys) {
    if (event[key]) {
      return { type: key, payload: event[key] };
    }
  }

  return null;
}

module.exports = {
  createBedrockConverseAdapter,
};
