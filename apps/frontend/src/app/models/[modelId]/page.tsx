import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "../../components/SiteHeader";
import { getDb } from "../../api/auth/_helpers";
import { highlightCode } from "../../lib/highlight";
import ModelIdRow from "../ModelIdRow";

type ModelRecord = {
  id: string;
  author: string | null;
  name: string | null;
  summary: string | null;
  contextLength: number | null;
  promptPrice: number | null;
  completionPrice: number | null;
  acceptanceTests: string | null;
};

type ModelDetail = {
  id: string;
  author: string;
  name: string;
  summary: string;
  contextLength: number | null;
  promptPrice: number | null;
  completionPrice: number | null;
  acceptanceTests: string | null;
};

type AcceptanceTest = {
  title: string;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const stripNamePrefix = (value: string) => value.replace(/^[^:]+:\s*/, "");

const buildSummary = (summary: string | null, fallback: string) => {
  const normalized = (summary ?? "").trim();
  return normalized || fallback;
};

const getAuthorLabel = (author: string) =>
  author && author.trim().length > 0 ? author : "Unknown";

const formatContextLength = (value: number | null) => {
  if (!value || !Number.isFinite(value)) {
    return null;
  }
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    return `${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
  }
  return value.toString();
};

const formatPricePerMillion = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  const perMillion = value * 1_000_000;
  return perMillion.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const parseAcceptanceTests = (value: string | null): AcceptanceTest[] => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .map((item) => ({ title: item }));
    }
  } catch {
    return [];
  }
  return [];
};

const getModelDetail = async (modelId: string): Promise<ModelDetail | null> => {
  const db = getDb();
  const record = await db
    .prepare(
      "SELECT id, author, name, summary, context_length as contextLength, prompt_price as promptPrice, completion_price as completionPrice, acceptance_tests as acceptanceTests FROM models WHERE id = ?",
    )
    .bind(modelId)
    .first<ModelRecord>();

  if (!record) {
    return null;
  }

  const author = record.author ?? "";
  const rawName = record.name ?? record.id;
  const name = stripNamePrefix(rawName);
  const summary = buildSummary(record.summary, name);

  return {
    id: record.id,
    author,
    name,
    summary,
    contextLength: toNumber(record.contextLength),
    promptPrice: toNumber(record.promptPrice),
    completionPrice: toNumber(record.completionPrice),
    acceptanceTests: record.acceptanceTests,
  };
};

export const dynamic = "force-dynamic";

export default async function ModelDetailPage({
  params,
}: {
  params: Promise<{ modelId: string }>;
}) {
  const { modelId } = await params;
  const model = await getModelDetail(modelId);

  if (!model) {
    notFound();
  }

  const contextLabel = formatContextLength(model.contextLength);
  const promptLabel = formatPricePerMillion(model.promptPrice);
  const completionLabel = formatPricePerMillion(model.completionPrice);
  const authorLabel = getAuthorLabel(model.author);
  const acceptanceResults = parseAcceptanceTests(model.acceptanceTests).map(
    (test, index) => ({
      ...test,
      key: `${test.title}-${index}`,
    }),
  );
  const exampleCode = `const { AnyResponses } = require("anyresponses");

const client = new AnyResponses({
  apiKey: process.env.ANYRESPONSES_API_KEY
});

await client.responses.create({
  model: "${model.id}",
  input: [{ type: "message", role: "user", content: "Hello" }]
});`;

  return (
    <div className="page">
      <div className="bg-orb orb-1" aria-hidden="true" />
      <div className="bg-orb orb-2" aria-hidden="true" />
      <div className="bg-orb orb-3" aria-hidden="true" />

      <SiteHeader />

      <main className="content">
        <section className="section model-detail">
          <div className="section-block model-detail-block">
            <div className="model-detail-header">
              <Link className="section-link" href="/models">
                Back to models
              </Link>
              <span className="model-provider">{authorLabel}</span>
              <h1>{model.name}</h1>
              <p className="model-detail-summary">{model.summary}</p>
            </div>

            <div className="grid model-detail-grid">
              <div className="glass-card model-detail-card">
                <h3>Model overview</h3>
                <dl className="model-detail-meta">
                  <div className="model-detail-meta-row">
                    <dt>Model ID</dt>
                    <dd>
                      <ModelIdRow modelId={model.id} />
                    </dd>
                  </div>
                  <div className="model-detail-meta-row">
                    <dt>Author</dt>
                    <dd>{authorLabel}</dd>
                  </div>
                  <div className="model-detail-meta-row">
                    <dt>Context length</dt>
                    <dd>
                      {contextLabel ? (
                        `${contextLabel} tokens`
                      ) : (
                        <span className="model-detail-empty">Not listed</span>
                      )}
                    </dd>
                  </div>
                  <div className="model-detail-meta-row">
                    <dt>Input price (per 1M tokens)</dt>
                    <dd>
                      {promptLabel ? (
                        `$${promptLabel}`
                      ) : (
                        <span className="model-detail-empty">Not listed</span>
                      )}
                    </dd>
                  </div>
                  <div className="model-detail-meta-row">
                    <dt>Output price (per 1M tokens)</dt>
                    <dd>
                      {completionLabel ? (
                        `$${completionLabel}`
                      ) : (
                        <span className="model-detail-empty">Not listed</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="glass-card model-detail-card model-detail-acceptance">
              <h3>OpenResponses acceptance tests</h3>
              {acceptanceResults.length > 0 ? (
                <ul className="acceptance-list">
                  {acceptanceResults.map((item) => (
                    <li className="acceptance-item" key={item.key}>
                      <span className="acceptance-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24">
                          <path
                            d="M5 12l4 4L19 6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span className="acceptance-title">{item.title}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="model-detail-empty">Not listed</span>
              )}
            </div>

            <div className="glass-card model-detail-example">
              <div className="model-detail-example-header">Example code</div>
              <pre className="code-block hero-code language-javascript">
                <code
                  className="language-javascript"
                  dangerouslySetInnerHTML={{
                    __html: highlightCode(exampleCode),
                  }}
                />
              </pre>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
