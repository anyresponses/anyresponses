function buildOpenAIRequest(openRequest = {}) {
  return {
    ...openRequest,
    model: openRequest.model,
  };
}

function buildOpenAIChatRequest(openRequest = {}) {
  if (!openRequest || typeof openRequest !== "object") {
    throw new TypeError("request must be an object");
  }

  const messages = buildMessages(openRequest);
  const payload = {
    model: openRequest.model,
    messages,
  };

  if (openRequest.temperature != null) {
    payload.temperature = openRequest.temperature;
  }
  if (openRequest.top_p != null) {
    payload.top_p = openRequest.top_p;
  }
  if (openRequest.presence_penalty != null) {
    payload.presence_penalty = openRequest.presence_penalty;
  }
  if (openRequest.frequency_penalty != null) {
    payload.frequency_penalty = openRequest.frequency_penalty;
  }
  if (openRequest.max_output_tokens != null) {
    payload.max_tokens = openRequest.max_output_tokens;
  } else if (openRequest.max_tokens != null) {
    payload.max_tokens = openRequest.max_tokens;
  }
  if (openRequest.stream_options != null) {
    payload.stream_options = openRequest.stream_options;
  }

  const tools = normalizeTools(openRequest.tools);
  if (tools.length) {
    payload.tools = tools;
  }
  const toolChoice = normalizeToolChoice(openRequest.tool_choice);
  if (toolChoice != null) {
    payload.tool_choice = toolChoice;
  }

  return payload;
}

function buildMessages(openRequest) {
  if (Array.isArray(openRequest.messages)) {
    return openRequest.messages;
  }

  const messages = [];
  if (openRequest.instructions) {
    messages.push({ role: "system", content: openRequest.instructions });
  }

  const input = openRequest.input;
  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
    return messages;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      if (!item || typeof item !== "object") {
        continue;
      }
      if (item.type && item.type !== "message") {
        continue;
      }
      const role = item.role || "user";
      const content = normalizeContent(item.content);
      messages.push({ role, content });
    }
  }

  return messages;
}

function normalizeContent(content) {
  if (content == null) {
    return "";
  }
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts = [];
    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }
      if (part.type === "input_text" || part.type === "text") {
        parts.push({ type: "text", text: part.text || "" });
        continue;
      }
      if (part.type === "input_image") {
        const url = normalizeImageUrl(part.image_url);
        if (url) {
          parts.push({ type: "image_url", image_url: { url } });
        }
        continue;
      }
      if (part.type === "image_url") {
        const url = normalizeImageUrl(part.image_url || part.url);
        if (url) {
          parts.push({ type: "image_url", image_url: { url } });
        }
        continue;
      }
      if (part.type === "text" && part.text) {
        parts.push({ type: "text", text: part.text });
      }
    }
    if (parts.length === 1 && parts[0].type === "text") {
      return parts[0].text;
    }
    return parts;
  }
  return String(content);
}

function normalizeImageUrl(imageUrl) {
  if (!imageUrl) {
    return null;
  }
  if (typeof imageUrl === "string") {
    return imageUrl;
  }
  if (typeof imageUrl === "object") {
    return imageUrl.url || null;
  }
  return null;
}

function normalizeTools(tools) {
  const list = Array.isArray(tools) ? tools : [];
  return list
    .filter((tool) => tool && typeof tool === "object")
    .map((tool) => {
      if (tool.type !== "function") {
        return tool;
      }
      return {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters || {},
        },
      };
    });
}

function normalizeToolChoice(toolChoice) {
  if (toolChoice == null) {
    return null;
  }
  if (toolChoice === "auto" || toolChoice === "none") {
    return toolChoice;
  }
  if (toolChoice && typeof toolChoice === "object") {
    if (toolChoice.type === "function" && toolChoice.name) {
      return {
        type: "function",
        function: { name: toolChoice.name },
      };
    }
    if (toolChoice.name) {
      return {
        type: "function",
        function: { name: toolChoice.name },
      };
    }
  }
  return null;
}

module.exports = {
  buildOpenAIRequest,
  buildOpenAIChatRequest,
};
