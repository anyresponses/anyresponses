import Link from "next/link";

import CallModesWithCode from "./components/CallModesWithCode";
import SiteHeader from "./components/SiteHeader";
import { highlightCode } from "./lib/highlight";

import providersData from "../data/providers.json";

const acceptanceTests = [
  {
    title: "Basic Text Response",
    description: "Simple user message, validates ResponseResource schema.",
  },
  {
    title: "Streaming Response",
    description: "Validates SSE streaming events and final response.",
  },
  {
    title: "System Prompt",
    description: "Include system role message in input.",
  },
  {
    title: "Tool Calling",
    description: "Define a function tool and verify function_call output.",
  },
  {
    title: "Image Input",
    description: "Send image URL in user content.",
  },
  {
    title: "Multi-turn Conversation",
    description: "Send assistant + user messages as conversation history.",
  },
];

const usageCode = `const { AnyResponses } = require("anyresponses");

const client = new AnyResponses({
  apiKey: process.env.ANYRESPONSES_API_KEY,
});

const response = await client.responses.create({
  model: "gpt-4o-mini",
  input: [{ type: "message", role: "user", content: "Hello" }],
  stream: true,
});`;

export default function Home() {
  return (
    <div className="page landing">
      <div className="bg-orb orb-1" />
      <div className="bg-orb orb-2" />
      <div className="bg-orb orb-3" />

      <SiteHeader />

      <main className="content landing-main">
        <section className="landing-hero">
          <div className="hero-content">
            <span className="eyebrow">Open Responses routing</span>
            <h1>Configure once, switch models freely.</h1>
            <p>
              AnyResponses is open-source and stays aligned with the latest Open
              Responses /responses interface. Configure OpenAI, Anthropic, or
              Gemini once, then switch by editing the model ID.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary" href="/docs">
                Read the docs
              </Link>
              <a className="btn btn-ghost" href="#providers">
                See providers
              </a>
            </div>
          </div>

          <div className="hero-visual">
            <div className="glass-card hero-visual-card">
              <div className="hero-visual-header">
                <div>
                  <span className="hero-visual-label">
                    AnyResponses request
                  </span>
                  <h3>Unified call, model ID switch</h3>
                </div>
                <span className="status-pill">Open Responses</span>
              </div>
              <pre className="code-block hero-code language-javascript">
                <code
                  className="language-javascript"
                  dangerouslySetInnerHTML={{ __html: highlightCode(usageCode) }}
                />
              </pre>
            </div>
          </div>
        </section>

        <CallModesWithCode />

        <section className="landing-section" id="providers">
          <div className="section-heading section-heading-centered">
            <h2>Supported providers.</h2>
            <p>
              Open-source routing across providers with one model ID format.
            </p>
          </div>
          <ul className="trust-list trust-list-centered">
            {providersData.providers.map((provider) => (
              <li className="trust-badge glass-card" key={provider.id}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M12 3l7 4v5c0 4.4-3 7.9-7 9-4-1.1-7-4.6-7-9V7l7-4z"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
                <div>
                  <strong>{provider.name}</strong>
                </div>
              </li>
            ))}
          </ul>
          <div className="section-actions section-actions-centered">
            <Link className="section-link" href="/providers">
              View all providers
            </Link>
          </div>
        </section>

        <section className="landing-section" id="acceptance-tests">
          <div className="section-heading section-heading-centered">
            <h2>Open Responses acceptance tests.</h2>
            <p>Official suite: 6/6 passing for AnyResponses.</p>
          </div>
          <div className="acceptance-grid">
            {acceptanceTests.map((test) => (
              <div className="glass-card acceptance-card" key={test.title}>
                <div className="acceptance-badge">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M5 12l4 4L19 6"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                  Passed
                </div>
                <h3>{test.title}</h3>
                <p>{test.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="cta">
          <div className="glass-card cta-banner">
            <div>
              <h2>Ready to build on open-source AnyResponses?</h2>
              <p>
                Use the SDK or gateway and stay aligned with the latest Open
                Responses interface.
              </p>
            </div>
            <div className="cta-actions">
              <Link className="btn btn-primary" href="/docs">
                View docs
              </Link>
              <a
                className="btn btn-ghost"
                href="https://github.com/anyresponses/anyresponses"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="content">
          <div>
            <strong>AnyResponses</strong>
            <span className="footer-sub">
              Open-source Open Responses routing for multi-provider stacks.
            </span>
          </div>
          <div className="footer-links">
            <a href="#call-modes">How to use</a>
            <a href="#providers">Providers</a>
            <a
              className="icon-link"
              href="https://github.com/anyresponses/anyresponses"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.11 3.29 9.44 7.86 10.97.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2.01-3.2.7-3.88-1.54-3.88-1.54-.53-1.36-1.29-1.72-1.29-1.72-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.56-.29-5.26-1.28-5.26-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.07 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.6.23 2.78.11 3.07.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.28 5.68.41.36.77 1.08.77 2.18 0 1.58-.02 2.86-.02 3.25 0 .31.21.67.8.56 4.57-1.53 7.86-5.86 7.86-10.97C23.5 5.74 18.27.5 12 .5Z"
                />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
