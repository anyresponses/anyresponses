"use client";

import type { KeyboardEvent } from "react";
import { useMemo, useState } from "react";

import { highlightCode } from "../lib/highlight";

const callModes = [
  {
    title: "Custom Provider Keys",
    description:
      "Bring your own provider keys and keep the same response shape.",
    builtIn: false,
    code: `const { AnyResponses, PROVIDERS } = require("anyresponses");

const client = new AnyResponses([
  {
    provider: PROVIDERS.OPENAI,
    apiKey: process.env.OPENAI_API_KEY,
    // Optional.
    baseUrl: process.env.OPENAI_BASE_URL,
    // Optional, set this value if you want to configure multiple identical providers.
    id: "openai",
  },
  {
    provider: PROVIDERS.ANTHROPIC,
    apiKey: process.env.ANTHROPIC_API_KEY,
    // Optional.
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    // Optional, set this value if you want to configure multiple identical providers.
    id: "anthropic",
  }
]);

await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: [{ type: "message", role: "user", content: "Hello" }]
});`,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 7h16M4 12h10M4 17h7"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    ),
  },
  {
    title: "AnyResponses SDK",
    description:
      "Use the official AnyResponses API key and route by model prefix.",
    builtIn: true,
    code: `const { AnyResponses } = require("anyresponses");

const client = new AnyResponses({
  apiKey: process.env.ANYRESPONSES_API_KEY
});

const response = await client.responses.create({
  model: "gpt-4o-mini",
  input: [{ type: "message", role: "user", content: "Hello" }]
});`,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M7 7h10v10H7z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <path
          d="M12 9v6M9 12h6"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    ),
  },
  {
    title: "OpenAI Responses SDK",
    description:
      "Point the OpenAI SDK to AnyResponses and keep responses calls intact.",
    builtIn: true,
    code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.ANYRESPONSES_API_KEY,
  baseURL: "https://api.anyresponses.com/responses"
});

const response = await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Hello"
});`,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 12h6l2-4 2 8 2-4h4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    ),
  },
  {
    title: "Gateway (HTTP)",
    description: "Send raw HTTP requests directly to the hosted gateway.",
    builtIn: true,
    code: `curl https://api.anyresponses.com/responses \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $ANYRESPONSES_API_KEY" \\
  -d '{
    "model": "gpt-4o-mini",
    "input": [{ "type": "message", "role": "user", "content": "Hello" }]
  }'`,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 6h16M4 12h10M4 18h7"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    ),
  },
];

export default function CallModesWithCode() {
  const [activeIndex, setActiveIndex] = useState(0);
  const highlighted = useMemo(
    () => callModes.map((mode) => highlightCode(mode.code)),
    [],
  );
  const activeMode = callModes[activeIndex] ?? callModes[0];

  const handleKeyDown = (
    index: number,
    event: KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setActiveIndex(index);
    }
  };

  return (
    <section className="landing-section" id="call-modes">
      <div className="section-heading section-heading-centered">
        <h2>Four ways to call AnyResponses.</h2>
        <p>
          All open-source. Pick the integration path and keep the same model ID
          routing rules everywhere.
        </p>
      </div>
      <div className="feature-grid feature-grid-call-modes">
        {callModes.map((mode, index) => {
          const isActive = index === activeIndex;
          return (
            <div
              className={`glass-card feature-card call-mode-card${
                isActive ? " active" : ""
              }`}
              key={mode.title}
              onClick={() => setActiveIndex(index)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
            >
              <div className="feature-icon">{mode.icon}</div>
              <h3>{mode.title}</h3>
              {mode.builtIn ? (
                <span className="call-mode-badge">Built-in</span>
              ) : null}
              <p>{mode.description}</p>
            </div>
          );
        })}
      </div>
      <div className="glass-card call-mode-code-card">
        <div className="call-mode-code-header">
          <span className="call-mode-code-label">{activeMode.title}</span>
        </div>
        <pre
          className="code-block call-mode-code language-javascript"
          tabIndex={0}
        >
          <code
            className="language-javascript"
            dangerouslySetInnerHTML={{ __html: highlighted[activeIndex] }}
          />
        </pre>
      </div>
    </section>
  );
}
