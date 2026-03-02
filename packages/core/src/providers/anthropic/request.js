function buildAnthropicRequest(openRequest = {}) {
  const model = openRequest.model;
  const input = openRequest.input ?? openRequest.messages ?? "";
  const { system, messages } = mapInputToAnthropic(input);

  const request = {
    model,
    max_tokens: openRequest.max_output_tokens ?? openRequest.max_tokens ?? 1024,
    messages,
  };

  if (system) {
    request.system = system;
  }

  if (openRequest.tools && openRequest.tools.length > 0) {
    request.tools = mapTools(openRequest.tools);
  }

  if (openRequest.tool_choice) {
    request.tool_choice = mapToolChoice(openRequest.tool_choice);
  }

  if (typeof openRequest.temperature === "number") {
    request.temperature = openRequest.temperature;
  }

  if (typeof openRequest.top_p === "number") {
    request.top_p = openRequest.top_p;
  }

  return request;
}

function mapInputToAnthropic(input) {
  const items = normalizeInputItems(input);
  const messages = [];
  const systemParts = [];

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }

    if (item.type === "message") {
      if (item.role === "system" || item.role === "developer") {
        const text = extractTextContent(item.content);
        if (text) {
          systemParts.push(text);
        }
        continue;
      }

      if (item.role === "user" || item.role === "assistant") {
        messages.push({
          role: item.role,
          content: mapMessageContent(item.content),
        });
      }
    }
  }

  if (messages.length === 0) {
    messages.push({ role: "user", content: [{ type: "text", text: "" }] });
  }

  return {
    system: systemParts.join("\n\n"),
    messages,
  };
}

function normalizeInputItems(input) {
  if (typeof input === "string") {
    return [wrapUserMessage(input)];
  }

  if (Array.isArray(input)) {
    return input.map((item) => {
      if (typeof item === "string") {
        return wrapUserMessage(item);
      }
      return item;
    });
  }

  if (input && typeof input === "object") {
    return [input];
  }

  return [wrapUserMessage("")];
}

function wrapUserMessage(text) {
  return {
    type: "message",
    role: "user",
    content: [{ type: "input_text", text: text || "" }],
  };
}

function extractTextContent(content) {
  const parts = normalizeContentArray(content);
  const texts = [];

  for (const part of parts) {
    if (!part || typeof part !== "object") {
      continue;
    }
    if (part.type === "input_text" || part.type === "output_text") {
      texts.push(part.text || "");
    }
  }

  return texts.join("\n");
}

function mapMessageContent(content) {
  const parts = normalizeContentArray(content);
  const blocks = [];

  for (const part of parts) {
    if (!part || typeof part !== "object") {
      continue;
    }

    if (part.type === "input_text" || part.type === "output_text") {
      blocks.push({ type: "text", text: part.text || "" });
      continue;
    }

    if (part.type === "input_image") {
      const url = typeof part.image_url === "string" ? part.image_url : "";
      const dataUrl = parseDataUrl(url);
      if (dataUrl) {
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: dataUrl.mediaType,
            data: dataUrl.data,
          },
        });
      } else {
        blocks.push({
          type: "image",
          source: {
            type: "url",
            url,
            media_type: inferMediaType(url),
          },
        });
      }
    }
  }

  if (blocks.length === 0) {
    blocks.push({ type: "text", text: "" });
  }

  return blocks;
}

function normalizeContentArray(content) {
  if (typeof content === "string") {
    return [{ type: "input_text", text: content }];
  }
  if (Array.isArray(content)) {
    return content;
  }
  if (content && typeof content === "object") {
    return [content];
  }
  return [];
}

function inferMediaType(url) {
  if (typeof url !== "string") {
    return "image/jpeg";
  }
  const lower = url.toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  return "image/jpeg";
}

function parseDataUrl(value) {
  if (typeof value !== "string" || !value.startsWith("data:")) {
    return null;
  }
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }
  return {
    mediaType: match[1],
    data: match[2],
  };
}

function mapTools(tools) {
  return tools
    .filter((tool) => tool && tool.type === "function")
    .map((tool) => {
      const definition = tool.function || tool;
      return {
        name: definition.name,
        description: definition.description || "",
        input_schema: definition.parameters || {},
      };
    });
}

function mapToolChoice(toolChoice) {
  if (typeof toolChoice === "string") {
    if (toolChoice === "required") {
      return { type: "any" };
    }
    if (toolChoice === "auto" || toolChoice === "none") {
      return { type: "auto" };
    }
  }

  if (toolChoice && typeof toolChoice === "object" && toolChoice.type === "function") {
    const name = toolChoice.name || toolChoice.function?.name;
    return {
      type: "tool",
      name,
    };
  }

  return { type: "auto" };
}

module.exports = {
  buildAnthropicRequest,
};
