## Official acceptance tests
The official Open Responses acceptance suite includes six tests. Each test below
shows the request payload and the normalized response.

## Compliance
See the official compliance requirements at
[Open Responses compliance](https://www.openresponses.org/compliance).

> Note: The request and response payloads below are examples.

## Basic Text Response
Simple user message, validates ResponseResource schema

**Request**
```json
{
  "model": "gpt-4o-mini",
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": "Say hello in exactly 3 words."
    }
  ]
}
```

**Response**
```json
{
  "id": "gen-1772274959-4TRqxMtKHyuDpQb52uU9",
  "object": "response",
  "created_at": 1772274959,
  "completed_at": 1772274959,
  "status": "completed",
  "incomplete_details": {
    "reason": "none"
  },
  "model": "openai/gpt-4o-mini",
  "previous_response_id": null,
  "instructions": null,
  "output": [
    {
      "type": "message",
      "id": "msg_mm66r2vaaxoofa",
      "status": "completed",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "Hello, how are you?",
          "annotations": [],
          "logprobs": []
        }
      ]
    }
  ],
  "error": null,
  "tools": [],
  "tool_choice": "auto",
  "truncation": "disabled",
  "parallel_tool_calls": false,
  "text": {
    "format": {
      "type": "text"
    },
    "verbosity": "medium"
  },
  "top_p": 1,
  "presence_penalty": 0,
  "frequency_penalty": 0,
  "top_logprobs": 0,
  "temperature": 1,
  "reasoning": {
    "effort": "none",
    "summary": null
  },
  "usage": {
    "input_tokens": 15,
    "output_tokens": 6,
    "total_tokens": 21,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens_details": {
      "reasoning_tokens": 0
    },
    "cost": 0.00000585
  },
  "max_output_tokens": null,
  "max_tool_calls": null,
  "store": false,
  "background": false,
  "service_tier": "auto",
  "metadata": null,
  "safety_identifier": null,
  "prompt_cache_key": null
}
```

## Streaming Response
Validates SSE streaming events and final response

**Request**
```json
{
  "model": "gpt-4o-mini",
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": "Count from 1 to 5."
    }
  ],
  "stream": true
}
```

**Response**
```json
{
  "id": "gen-1772274958-BvTF57eTZYgAomeBozIB",
  "object": "response",
  "created_at": 1772274959,
  "completed_at": 1772274959,
  "status": "completed",
  "incomplete_details": {
    "reason": "none"
  },
  "model": "openai/gpt-4o-mini",
  "previous_response_id": null,
  "instructions": null,
  "output": [
    {
      "type": "message",
      "id": "msg_mm66r2poyyk9d5",
      "status": "completed",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "1, 2, 3, 4, 5.",
          "annotations": [],
          "logprobs": []
        }
      ]
    }
  ],
  "error": null,
  "tools": [],
  "tool_choice": "auto",
  "truncation": "disabled",
  "parallel_tool_calls": false,
  "text": {
    "format": {
      "type": "text"
    },
    "verbosity": "medium"
  },
  "top_p": 1,
  "presence_penalty": 0,
  "frequency_penalty": 0,
  "top_logprobs": 0,
  "temperature": 1,
  "reasoning": {
    "effort": "none",
    "summary": null
  },
  "usage": {
    "input_tokens": 15,
    "output_tokens": 14,
    "total_tokens": 29,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens_details": {
      "reasoning_tokens": 0
    },
    "cost": 0.00001065
  },
  "max_output_tokens": null,
  "max_tool_calls": null,
  "store": false,
  "background": false,
  "service_tier": "auto",
  "metadata": null,
  "safety_identifier": null,
  "prompt_cache_key": null
}
```

## System Prompt
Include system role message in input

**Request**
```json
{
  "model": "gpt-4o-mini",
  "input": [
    {
      "type": "message",
      "role": "system",
      "content": "You are a pirate. Always respond in pirate speak."
    },
    {
      "type": "message",
      "role": "user",
      "content": "Say hello."
    }
  ]
}
```

**Response**
```json
{
  "id": "gen-1772274959-iyKjm1CVfzpLgku47lNb",
  "object": "response",
  "created_at": 1772274959,
  "completed_at": 1772274960,
  "status": "completed",
  "incomplete_details": {
    "reason": "none"
  },
  "model": "openai/gpt-4o-mini",
  "previous_response_id": null,
  "instructions": null,
  "output": [
    {
      "type": "message",
      "id": "msg_mm66r388ngn3xw",
      "status": "completed",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "Ahoy there, matey! How be ye this fine day on the briny deep?",
          "annotations": [],
          "logprobs": []
        }
      ]
    }
  ],
  "error": null,
  "tools": [],
  "tool_choice": "auto",
  "truncation": "disabled",
  "parallel_tool_calls": false,
  "text": {
    "format": {
      "type": "text"
    },
    "verbosity": "medium"
  },
  "top_p": 1,
  "presence_penalty": 0,
  "frequency_penalty": 0,
  "top_logprobs": 0,
  "temperature": 1,
  "reasoning": {
    "effort": "none",
    "summary": null
  },
  "usage": {
    "input_tokens": 25,
    "output_tokens": 19,
    "total_tokens": 44,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens_details": {
      "reasoning_tokens": 0
    },
    "cost": 0.00001515
  },
  "max_output_tokens": null,
  "max_tool_calls": null,
  "store": false,
  "background": false,
  "service_tier": "auto",
  "metadata": null,
  "safety_identifier": null,
  "prompt_cache_key": null
}
```

## Tool Calling
Define a function tool and verify function_call output

**Request**
```json
{
  "model": "gpt-4o-mini",
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": "What's the weather like in San Francisco?"
    }
  ],
  "tools": [
    {
      "type": "function",
      "name": "get_weather",
      "description": "Get the current weather for a location",
      "parameters": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "The city and state, e.g. San Francisco, CA"
          }
        },
        "required": [
          "location"
        ]
      }
    }
  ]
}
```

**Response**
```json
{
  "id": "gen-1772274959-DIQkgNmeaBcvHf21WCmo",
  "object": "response",
  "created_at": 1772274959,
  "completed_at": 1772274959,
  "status": "completed",
  "incomplete_details": {
    "reason": "none"
  },
  "model": "openai/gpt-4o-mini",
  "previous_response_id": null,
  "instructions": null,
  "output": [
    {
      "type": "function_call",
      "id": "call_k1GOfAjCnGutTrxHh64px5Rx",
      "call_id": "call_k1GOfAjCnGutTrxHh64px5Rx",
      "name": "get_weather",
      "arguments": "{\"location\":\"San Francisco, CA\"}",
      "status": "completed"
    }
  ],
  "error": null,
  "tools": [
    {
      "type": "function",
      "name": "get_weather",
      "description": "Get the current weather for a location",
      "parameters": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "The city and state, e.g. San Francisco, CA"
          }
        },
        "required": [
          "location"
        ]
      },
      "strict": true
    }
  ],
  "tool_choice": "auto",
  "truncation": "disabled",
  "parallel_tool_calls": false,
  "text": {
    "format": {
      "type": "text"
    },
    "verbosity": "medium"
  },
  "top_p": 1,
  "presence_penalty": 0,
  "frequency_penalty": 0,
  "top_logprobs": 0,
  "temperature": 1,
  "reasoning": {
    "effort": "none",
    "summary": null
  },
  "usage": {
    "input_tokens": 67,
    "output_tokens": 17,
    "total_tokens": 84,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens_details": {
      "reasoning_tokens": 0
    },
    "cost": 0.00002025
  },
  "max_output_tokens": null,
  "max_tool_calls": null,
  "store": false,
  "background": false,
  "service_tier": "auto",
  "metadata": null,
  "safety_identifier": null,
  "prompt_cache_key": null
}
```

## Image Input
Send image URL in user content

**Request**
```json
{
  "model": "gpt-4o-mini",
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": [
        {
          "type": "input_text",
          "text": "What do you see in this image? Answer in one sentence."
        },
        {
          "type": "input_image",
          "image_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAABmklEQVR42tyWAaTyUBzFew/eG4AHz+MBSAHKBiJRGFKwIgQQJKLUIioBIhCAiCAAEizAQIAECaASqFFJq84nudjnaqvuPnxzgP9xfrq5938csPn7PwHTKSoViCIEAYEAMhmoKsU2mUCWEQqB5xEMIp/HaGQG2G6RSuH9HQ7H34rFrtPbdz4jl6PbwmEsl3QA1mt4vcRKk8dz9eg6IpF7tt9fzGY0gCgafFRFo5Blc5vLhf3eCOj1yNhM5GRMVK0aATxPZoz09YXjkQDmczJgquGQAPp9WwCNBgG027YACgUC6HRsAZRKBDAY2AJoNv/ZnwzA6WScznG3p4UAymXGAEkyXrTFAh8fLAGqagQAyGaZpYsi7bHTNPz8MEj//LxuFPo+UBS8vb0KaLXubrRa7aX0RMLCykwmn0z3+XA4WACcTpCkh9MFAZpmuVXo+mO/w+/HZvNgbblcUCxaSo/Hyck80Yu6XXDcvfVZr79cvMZjuN2U9O9vKAqjZrfbIZ0mV4TUi9Xqz6jddNy//7+e3n8Fhf/Llo2kxi8AQyGRoDkmAhAAAAAASUVORK5CYII="
        }
      ]
    }
  ]
}
```

**Response**
```json
{
  "id": "gen-1772274959-6q54upZQdRJ1HgjKZ6Ci",
  "object": "response",
  "created_at": 1772274959,
  "completed_at": 1772274959,
  "status": "completed",
  "incomplete_details": {
    "reason": "none"
  },
  "model": "openai/gpt-4o-mini",
  "previous_response_id": null,
  "instructions": null,
  "output": [
    {
      "type": "message",
      "id": "msg_mm66r32ygsxbaa",
      "status": "completed",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "I see a red heart shape.",
          "annotations": [],
          "logprobs": []
        }
      ]
    }
  ],
  "error": null,
  "tools": [],
  "tool_choice": "auto",
  "truncation": "disabled",
  "parallel_tool_calls": false,
  "text": {
    "format": {
      "type": "text"
    },
    "verbosity": "medium"
  },
  "top_p": 1,
  "presence_penalty": 0,
  "frequency_penalty": 0,
  "top_logprobs": 0,
  "temperature": 1,
  "reasoning": {
    "effort": "none",
    "summary": null
  },
  "usage": {
    "input_tokens": 8520,
    "output_tokens": 7,
    "total_tokens": 8527,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens_details": {
      "reasoning_tokens": 0
    },
    "cost": 0.0012822
  },
  "max_output_tokens": null,
  "max_tool_calls": null,
  "store": false,
  "background": false,
  "service_tier": "auto",
  "metadata": null,
  "safety_identifier": null,
  "prompt_cache_key": null
}
```

## Multi-turn Conversation
Send assistant + user messages as conversation history

**Request**
```json
{
  "model": "gpt-4o-mini",
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": "My name is Alice."
    },
    {
      "type": "message",
      "role": "assistant",
      "content": "Hello Alice! Nice to meet you. How can I help you today?"
    },
    {
      "type": "message",
      "role": "user",
      "content": "What is my name?"
    }
  ]
}
```

**Response**
```json
{
  "id": "gen-1772274959-jvjb27O3ZzsngghX4uCy",
  "object": "response",
  "created_at": 1772274959,
  "completed_at": 1772274959,
  "status": "completed",
  "incomplete_details": {
    "reason": "none"
  },
  "model": "openai/gpt-4o-mini",
  "previous_response_id": null,
  "instructions": null,
  "output": [
    {
      "type": "message",
      "id": "msg_mm66r2xjjttz4g",
      "status": "completed",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "Your name is Alice. How can I assist you further?",
          "annotations": [],
          "logprobs": []
        }
      ]
    }
  ],
  "error": null,
  "tools": [],
  "tool_choice": "auto",
  "truncation": "disabled",
  "parallel_tool_calls": false,
  "text": {
    "format": {
      "type": "text"
    },
    "verbosity": "medium"
  },
  "top_p": 1,
  "presence_penalty": 0,
  "frequency_penalty": 0,
  "top_logprobs": 0,
  "temperature": 1,
  "reasoning": {
    "effort": "none",
    "summary": null
  },
  "usage": {
    "input_tokens": 40,
    "output_tokens": 12,
    "total_tokens": 52,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens_details": {
      "reasoning_tokens": 0
    },
    "cost": 0.0000132
  },
  "max_output_tokens": null,
  "max_tool_calls": null,
  "store": false,
  "background": false,
  "service_tier": "auto",
  "metadata": null,
  "safety_identifier": null,
  "prompt_cache_key": null
}
```
