function buildBedrockConverseRequest(openRequest = {}) {
  if (!openRequest || typeof openRequest !== "object") {
    throw new TypeError("request must be an object");
  }

  const model = openRequest.model;
  const { messages, system } = mapInputToBedrock(openRequest);

  const payload = {
    model,
    messages,
  };

  if (system.length > 0) {
    payload.system = system;
  }

  const inferenceConfig = buildInferenceConfig(openRequest);
  if (Object.keys(inferenceConfig).length > 0) {
    payload.inferenceConfig = inferenceConfig;
  }

  const toolConfig = buildToolConfig(openRequest.tools, openRequest.tool_choice);
  if (toolConfig) {
    payload.toolConfig = toolConfig;
  }

  if (openRequest.additionalModelRequestFields && typeof openRequest.additionalModelRequestFields === "object") {
    payload.additionalModelRequestFields = openRequest.additionalModelRequestFields;
  }

  if (openRequest.additional_model_request_fields && typeof openRequest.additional_model_request_fields === "object") {
    payload.additionalModelRequestFields = openRequest.additional_model_request_fields;
  }

  return payload;
}

function mapInputToBedrock(openRequest) {
  const systemBlocks = [];
  const messages = [];

  const instructions = openRequest.instructions;
  if (typeof instructions === "string" && instructions) {
    systemBlocks.push({ text: instructions });
  } else if (Array.isArray(instructions)) {
    for (const item of instructions) {
      if (typeof item === "string" && item) {
        systemBlocks.push({ text: item });
      }
    }
  }

  if (Array.isArray(openRequest.messages)) {
    for (const message of openRequest.messages) {
      mapMessageToBedrock(message, systemBlocks, messages);
    }
  } else {
    const items = normalizeInputItems(openRequest.input ?? openRequest.messages);
    for (const item of items) {
      if (!item || typeof item !== "object") {
        continue;
      }
      if (item.type === "message" || item.role) {
        mapMessageToBedrock(item, systemBlocks, messages);
        continue;
      }
      if (item.type === "function_call_output") {
        const toolResult = buildToolResultBlock(item);
        if (toolResult) {
          messages.push({
            role: "user",
            content: [toolResult],
          });
        }
      }
    }
  }

  if (messages.length === 0) {
    messages.push({ role: "user", content: [{ text: "" }] });
  }

  return {
    system: systemBlocks,
    messages,
  };
}

function mapMessageToBedrock(message, systemBlocks, messages) {
  if (!message || typeof message !== "object") {
    return;
  }
  const role = message.role || (message.type === "message" ? message.role : null);
  if (role === "system" || role === "developer") {
    const text = extractTextContent(message.content);
    if (text) {
      systemBlocks.push({ text });
    }
    return;
  }
  if (role === "assistant" || role === "user") {
    const content = mapMessageContent(message.content);
    messages.push({
      role,
      content,
    });
  }
}

function extractTextContent(content) {
  const parts = normalizeContentArray(content);
  const texts = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") {
      continue;
    }
    if (part.type === "input_text" || part.type === "output_text" || part.type === "text") {
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

    if (part.type === "input_text" || part.type === "output_text" || part.type === "text") {
      blocks.push({ text: part.text || "" });
      continue;
    }

    if (part.type === "input_image" || part.type === "image_url") {
      const imageBlock = mapImageBlock(part);
      if (imageBlock) {
        blocks.push(imageBlock);
      }
    }
  }

  if (blocks.length === 0) {
    blocks.push({ text: "" });
  }

  return blocks;
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

function mapImageBlock(part) {
  const imageUrl = resolveImageUrl(part);
  if (!imageUrl) {
    return null;
  }

  const dataUrl = parseDataUrl(imageUrl);
  if (dataUrl) {
    return {
      image: {
        format: mediaTypeToFormat(dataUrl.mediaType),
        source: { bytes: dataUrl.data },
      },
    };
  }

  return {
    image: {
      format: inferImageFormat(imageUrl),
      source: { url: imageUrl },
    },
  };
}

function resolveImageUrl(part) {
  if (!part || typeof part !== "object") {
    return null;
  }
  if (typeof part.image_url === "string") {
    return part.image_url;
  }
  if (part.image_url && typeof part.image_url === "object") {
    return part.image_url.url || null;
  }
  if (typeof part.url === "string") {
    return part.url;
  }
  return null;
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

function mediaTypeToFormat(mediaType) {
  if (typeof mediaType !== "string") {
    return "png";
  }
  const lower = mediaType.toLowerCase();
  if (lower.includes("jpeg") || lower.includes("jpg")) {
    return "jpeg";
  }
  if (lower.includes("png")) {
    return "png";
  }
  if (lower.includes("webp")) {
    return "webp";
  }
  if (lower.includes("gif")) {
    return "gif";
  }
  return "png";
}

function inferImageFormat(url) {
  if (typeof url !== "string") {
    return "png";
  }
  const lower = url.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "jpeg";
  }
  if (lower.endsWith(".png")) {
    return "png";
  }
  if (lower.endsWith(".webp")) {
    return "webp";
  }
  if (lower.endsWith(".gif")) {
    return "gif";
  }
  return "png";
}

function buildInferenceConfig(openRequest) {
  const config = {};
  if (typeof openRequest.temperature === "number") {
    config.temperature = openRequest.temperature;
  }
  if (typeof openRequest.top_p === "number") {
    config.topP = openRequest.top_p;
  }
  const maxTokens = openRequest.max_output_tokens ?? openRequest.max_tokens;
  if (typeof maxTokens === "number") {
    config.maxTokens = maxTokens;
  }
  if (Array.isArray(openRequest.stop)) {
    config.stopSequences = openRequest.stop;
  }
  return config;
}

function buildToolConfig(tools, toolChoice) {
  if (toolChoice === "none") {
    return null;
  }
  const normalized = normalizeTools(tools, toolChoice);
  if (!normalized.tools.length) {
    return null;
  }

  const config = {
    tools: normalized.tools,
  };

  if (normalized.toolChoice) {
    config.toolChoice = normalized.toolChoice;
  }

  return config;
}

function normalizeTools(tools, toolChoice) {
  const list = Array.isArray(tools) ? tools : [];
  const allowedNames = extractAllowedToolNames(toolChoice);
  const toolSpecs = list
    .filter((tool) => tool && tool.type === "function")
    .map((tool) => {
      const definition = tool.function || tool;
      return {
        toolSpec: {
          name: definition.name,
          description: definition.description || "",
          inputSchema: { json: definition.parameters || {} },
        },
      };
    })
    .filter((tool) => {
      if (!allowedNames || allowedNames.size === 0) {
        return true;
      }
      return allowedNames.has(tool.toolSpec.name);
    });

  const normalizedToolChoice = mapToolChoice(toolChoice);
  return {
    tools: toolSpecs,
    toolChoice: normalizedToolChoice,
  };
}

function mapToolChoice(toolChoice) {
  if (toolChoice == null) {
    return { auto: {} };
  }
  if (toolChoice === "auto") {
    return { auto: {} };
  }
  if (toolChoice === "required") {
    return { any: {} };
  }
  if (toolChoice === "none") {
    return null;
  }
  if (toolChoice && typeof toolChoice === "object") {
    if (toolChoice.type === "function" || toolChoice.name) {
      const name = toolChoice.name || toolChoice.function?.name;
      if (name) {
        return { tool: { name } };
      }
    }
    if (toolChoice.type === "allowed_tools") {
      return { auto: {} };
    }
  }
  return { auto: {} };
}

function extractAllowedToolNames(toolChoice) {
  if (!toolChoice || typeof toolChoice !== "object") {
    return null;
  }
  if (toolChoice.type !== "allowed_tools" || !Array.isArray(toolChoice.tools)) {
    return null;
  }
  const names = new Set();
  for (const tool of toolChoice.tools) {
    if (!tool || typeof tool !== "object") {
      continue;
    }
    if (tool.type === "function" && tool.name) {
      names.add(tool.name);
    }
  }
  return names;
}

function buildToolResultBlock(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  if (!item.call_id) {
    return null;
  }

  const content = mapToolOutputContent(item.output);
  return {
    toolResult: {
      toolUseId: item.call_id,
      content,
      status: item.status || "success",
    },
  };
}

function mapToolOutputContent(output) {
  if (typeof output === "string") {
    return [{ text: output }];
  }
  if (Array.isArray(output)) {
    const parts = [];
    for (const part of output) {
      if (!part || typeof part !== "object") {
        continue;
      }
      if (part.type === "input_text" || part.type === "output_text" || part.type === "text") {
        parts.push({ text: part.text || "" });
        continue;
      }
      if (part.type === "input_image" || part.type === "image_url") {
        const imageBlock = mapImageBlock(part);
        if (imageBlock) {
          parts.push(imageBlock);
        }
      }
    }
    if (parts.length > 0) {
      return parts;
    }
  }
  return [{ text: "" }];
}

module.exports = {
  buildBedrockConverseRequest,
};
