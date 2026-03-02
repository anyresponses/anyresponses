const { generateId } = require("../utils/id");
const { nowSeconds } = require("../utils/time");
const { toAsyncIterable } = require("../utils/iter");
const { normalizeResponse } = require("../normalize/response");

function createGeminiAdapter(adapterOptions = {}) {
  const provider = adapterOptions.provider || "gemini";

  function toOpenResponse(input, options = {}) {
    if (!input || typeof input !== "object") {
      throw new TypeError("input must be an object");
    }

    const request = options.request || {};
    const candidate = pickCandidate(input);
    const finishReason = candidate?.finishReason || null;
    const status = mapStatus(finishReason, input.error);
    const responseId = input.id || options.response_id || generateId("resp");
    const createdAt = pickTimestamp(input.created_at, options.created_at, nowSeconds());
    const completedAt = pickTimestamp(input.completed_at, options.completed_at, status === "completed" ? nowSeconds() : null);
    const output = buildOutputItems(candidate, status);
    const usage = buildUsage(input.usageMetadata, options.usage);

    const response = {
      id: responseId,
      object: "response",
      created_at: createdAt,
      completed_at: completedAt,
      status,
      incomplete_details: status === "incomplete" ? { reason: mapIncompleteReason(finishReason) } : null,
      model: request.model || input.model || null,
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

    for await (const event of iterable) {
      if (!event || typeof event !== "object") {
        continue;
      }

      if (!state.responseStarted) {
        state.responseStarted = true;
        yield emitCreated();
        yield makeEvent("response.in_progress", {
          response: buildResponseFromState(state, "in_progress"),
        }, state);
      }

      const candidate = pickCandidate(event);
      if (!candidate) {
        continue;
      }

      const text = extractText(candidate);
      if (text) {
        if (!state.messageAdded) {
          const added = addMessageItem(state);
          if (added) {
            yield added;
          }
        }

        if (!state.contentPartAdded) {
          state.contentPartAdded = true;
          yield makeEvent("response.content_part.added", {
            item_id: state.messageId,
            output_index: state.messageOutputIndex,
            content_index: state.contentIndex,
            part: buildOutputTextPart(""),
          }, state);
        }

        const { delta, nextText } = computeDeltaAndNext(state.messageText, text);
        state.messageText = nextText;
        if (delta) {
          yield makeEvent("response.output_text.delta", {
            item_id: state.messageId,
            output_index: state.messageOutputIndex,
            content_index: state.contentIndex,
            delta,
            logprobs: [],
          }, state);
        }
      }

      const toolCalls = extractToolCalls(candidate);
      for (const toolCall of toolCalls) {
        const callItem = buildFunctionCallItem(toolCall, "completed");
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
        state.toolCalls.push(toolCall);
      }

      if (event.usageMetadata) {
        state.usage = buildUsage(event.usageMetadata, state.usage);
      }

      if (candidate.finishReason) {
        state.stopReason = candidate.finishReason;
        state.status = mapStatus(state.stopReason, null);
        state.finished = true;
        break;
      }
    }

    if (!state.finished) {
      state.status = "completed";
    }

    if (state.messageAdded) {
      if (state.contentPartAdded) {
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
      }

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

function pickCandidate(input) {
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  return candidates.length > 0 ? candidates[0] : null;
}

function buildOutputItems(candidate, status) {
  if (!candidate) {
    return [];
  }
  const parts = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];
  const textParts = [];
  const toolCalls = [];

  for (const part of parts) {
    if (part.text) {
      textParts.push(part.text);
      continue;
    }
    if (part.functionCall) {
      toolCalls.push(part.functionCall);
    }
  }

  const items = [];
  if (textParts.length > 0) {
    items.push(buildMessageItem([buildOutputTextPart(textParts.join(""))], status, generateId("msg")));
  }
  for (const toolCall of toolCalls) {
    items.push(buildFunctionCallItem(toolCall, status));
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
    arguments: stringifyArgs(toolState.args),
    status: status || "completed",
  };
}

function stringifyArgs(args) {
  if (typeof args === "string") {
    return args;
  }
  try {
    return JSON.stringify(args ?? {});
  } catch (err) {
    return String(args);
  }
}

function extractText(candidate) {
  const parts = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];
  const texts = [];
  for (const part of parts) {
    if (part.text) {
      texts.push(part.text);
    }
  }
  return texts.join("");
}

function extractToolCalls(candidate) {
  const parts = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];
  const calls = [];
  for (const part of parts) {
    if (part.functionCall) {
      calls.push(part.functionCall);
    }
  }
  return calls;
}

function computeDeltaAndNext(previous, incoming) {
  const priorText = previous || "";
  if (!incoming) {
    return { delta: "", nextText: priorText };
  }
  if (priorText && incoming.startsWith(priorText)) {
    return { delta: incoming.slice(priorText.length), nextText: incoming };
  }
  if (!priorText) {
    return { delta: incoming, nextText: incoming };
  }
  return { delta: incoming, nextText: priorText + incoming };
}

function mapStatus(finishReason, error) {
  if (error || finishReason === "SAFETY") {
    return "failed";
  }
  if (finishReason === "MAX_TOKENS") {
    return "incomplete";
  }
  return "completed";
}

function mapIncompleteReason(finishReason) {
  if (finishReason === "MAX_TOKENS") {
    return "max_output_tokens";
  }
  return "unknown";
}

function buildUsage(usageMetadata, fallback) {
  const usage = usageMetadata || fallback || {};
  const inputTokens = usage.promptTokenCount ?? usage.input_tokens ?? 0;
  const outputTokens = usage.candidatesTokenCount ?? usage.output_tokens ?? 0;
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: usage.totalTokenCount ?? inputTokens + outputTokens,
    input_tokens_details: {
      cached_tokens: usage.cachedContentTokenCount ?? 0,
    },
    output_tokens_details: {
      reasoning_tokens: usage.reasoning_tokens ?? 0,
    },
  };
}

function createStreamState(options) {
  const request = options.request || {};
  return {
    sequence: 0,
    responseId: options.response_id || generateId("resp"),
    messageId: options.message_id || generateId("msg"),
    messageOutputIndex: 0,
    nextOutputIndex: 1,
    contentIndex: 0,
    messageAdded: false,
    contentPartAdded: false,
    messageText: "",
    toolCalls: [],
    stopReason: null,
    status: "in_progress",
    responseStarted: false,
    finished: false,
    request,
    model: request.model || null,
    createdAt: nowSeconds(),
    strict: options.strict !== false,
    usage: null,
  };
}

function addMessageItem(state) {
  if (state.messageAdded) {
    return null;
  }
  state.messageAdded = true;
  return makeEvent("response.output_item.added", {
    output_index: state.messageOutputIndex,
    item: buildMessageItem([], "in_progress", state.messageId),
  }, state);
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
    usage: state.usage || null,
    max_output_tokens: state.request.max_output_tokens ?? null,
  };

  return normalizeResponse(response, state.request, { strict: state.strict });
}

function buildOutputItemsFromState(state, status) {
  const items = [];
  if (state.messageText) {
    items.push(buildMessageItem([buildOutputTextPart(state.messageText)], status, state.messageId));
  }
  for (const toolCall of state.toolCalls) {
    items.push(buildFunctionCallItem(toolCall, status));
  }
  return items;
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

module.exports = {
  createGeminiAdapter,
};
