function buildGeminiRequest(openRequest = {}) {
  const input = openRequest.input ?? openRequest.messages ?? "";
  const { systemInstruction, contents } = mapInputToGemini(input);

  const request = {
    model: openRequest.model,
    contents,
  };

  if (systemInstruction) {
    request.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  if (openRequest.tools && openRequest.tools.length > 0) {
    request.tools = [{ function_declarations: mapTools(openRequest.tools) }];
  }

  if (openRequest.tool_choice) {
    request.tool_config = mapToolChoice(openRequest.tool_choice);
  }

  const generationConfig = {};
  if (typeof openRequest.max_output_tokens === "number") {
    generationConfig.maxOutputTokens = openRequest.max_output_tokens;
  }
  if (typeof openRequest.temperature === "number") {
    generationConfig.temperature = openRequest.temperature;
  }
  if (typeof openRequest.top_p === "number") {
    generationConfig.topP = openRequest.top_p;
  }
  if (Object.keys(generationConfig).length > 0) {
    request.generationConfig = generationConfig;
  }

  return request;
}

function mapInputToGemini(input) {
  const items = normalizeInputItems(input);
  const contents = [];
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
        contents.push({
          role: item.role === "assistant" ? "model" : "user",
          parts: mapMessageParts(item.content),
        });
      }
    }
  }

  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: "" }] });
  }

  return {
    systemInstruction: systemParts.join("\n\n"),
    contents,
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

function mapMessageParts(content) {
  const parts = normalizeContentArray(content);
  const mapped = [];

  for (const part of parts) {
    if (!part || typeof part !== "object") {
      continue;
    }

    if (part.type === "input_text" || part.type === "output_text") {
      mapped.push({ text: part.text || "" });
      continue;
    }

    if (part.type === "input_image") {
      const url = typeof part.image_url === "string" ? part.image_url : "";
      const dataUrl = parseDataUrl(url);
      if (dataUrl) {
        mapped.push({
          inline_data: {
            mime_type: dataUrl.mediaType,
            data: dataUrl.data,
          },
        });
      } else {
        mapped.push({
          file_data: {
            file_uri: url,
            mime_type: inferMediaType(url),
          },
        });
      }
    }
  }

  if (mapped.length === 0) {
    mapped.push({ text: "" });
  }

  return mapped;
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
        parameters: definition.parameters || {},
      };
    });
}

function mapToolChoice(toolChoice) {
  const config = { function_calling_config: { mode: "AUTO" } };

  if (typeof toolChoice === "string") {
    if (toolChoice === "none") {
      config.function_calling_config.mode = "NONE";
      return config;
    }
    if (toolChoice === "required") {
      config.function_calling_config.mode = "ANY";
      return config;
    }
    return config;
  }

  if (toolChoice && typeof toolChoice === "object" && toolChoice.type === "function") {
    const name = toolChoice.name || toolChoice.function?.name;
    config.function_calling_config.mode = "ANY";
    if (name) {
      config.function_calling_config.allowed_function_names = [name];
    }
    return config;
  }

  return config;
}

module.exports = {
  buildGeminiRequest,
};
