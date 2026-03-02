import Link from "next/link";
import { notFound } from "next/navigation";

import SiteHeader from "../../components/SiteHeader";
import providersData from "../../../data/providers.json";
import ProviderIdRow from "../ProviderIdRow";
import { highlightCode } from "../../lib/highlight";

const providers = providersData.providers;

type Provider = (typeof providers)[number];

const renderPills = (items?: string[]) => {
  if (!items || items.length === 0) {
    return <span className="provider-empty">None</span>;
  }

  return (
    <div className="pill-row">
      {items.map((item) => (
        <span className="pill support-pill" key={item}>
          {item}
        </span>
      ))}
    </div>
  );
};

const renderOptionGroups = (groups?: string[][]) => {
  if (!groups || groups.length === 0) {
    return <span className="provider-empty">None</span>;
  }

  return (
    <div className="pill-row">
      {groups.map((group, index) => (
        <span className="pill support-pill" key={`${group.join("+")}-${index}`}>
          {group.join(" + ")}
        </span>
      ))}
    </div>
  );
};

const OPTION_ENV_SUFFIX: Record<string, string> = {
  apiKey: "API_KEY",
  baseUrl: "BASE_URL",
  clientEmail: "CLIENT_EMAIL",
  privateKey: "PRIVATE_KEY",
  project: "PROJECT",
  location: "LOCATION",
  region: "REGION",
  version: "VERSION",
  scopes: "SCOPES",
};

const toProviderKey = (provider: Provider) =>
  provider.key || provider.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_");

const toEnvVarName = (provider: Provider, option: string) => {
  const suffix = OPTION_ENV_SUFFIX[option];
  if (!suffix) {
    return null;
  }
  if (provider.env_prefix) {
    return `${provider.env_prefix}_${suffix}`;
  }
  const candidates = [
    ...(provider.env?.required ?? []),
    ...(provider.env?.optional ?? []),
  ];
  return candidates.find((name) => name.endsWith(`_${suffix}`)) ?? null;
};

const buildOptionsCode = (provider: Provider) => {
  const providerKey = toProviderKey(provider);
  const requiredOptions = Array.isArray(provider.required_options)
    ? [...provider.required_options]
    : [];
  const optionalOptions = Array.isArray(provider.optional_options)
    ? [...provider.optional_options]
    : [];
  const requiredOneOf =
    (provider as { required_one_of?: string[][] }).required_one_of ?? [];
  const requiredGroup = requiredOneOf.find((group) =>
    Array.isArray(group) && group.length > 0
  );

  const lines = [
    'const { AnyResponses, PROVIDERS } = require("anyresponses");',
    "",
    "const client = new AnyResponses({",
    `  provider: PROVIDERS.${providerKey},`,
  ];

  const formatOptionValue = (option: string) => {
    const envVar = toEnvVarName(provider, option);
    return envVar ? `process.env.${envVar}` : '"..."';
  };

  const seen = new Set<string>();
  for (const option of requiredOptions) {
    if (seen.has(option)) {
      continue;
    }
    seen.add(option);
    lines.push(`  ${option}: ${formatOptionValue(option)},`);
  }

  if (requiredGroup && requiredGroup.length > 0) {
    lines.push("  // Choose one of the following options.");
    for (const option of requiredGroup) {
      if (seen.has(option)) {
        continue;
      }
      seen.add(option);
      lines.push(`  ${option}: ${formatOptionValue(option)},`);
    }
  }

  if (optionalOptions.length > 0) {
    lines.push("  // Optional.");
    for (const option of optionalOptions) {
      if (seen.has(option)) {
        continue;
      }
      seen.add(option);
      lines.push(`  ${option}: ${formatOptionValue(option)},`);
    }
  }

  lines.push("});");
  lines.push("");
  lines.push("const response = await client.responses.create({");
  lines.push(`  model: "${provider.id}/model-id",`);
  lines.push('  input: [{ type: "message", role: "user", content: "Hello" }]');
  lines.push("});");
  return lines.join("\n");
};

const buildEnvCode = (provider: Provider) => {
  const required = provider.env?.required ?? [];
  const optional = provider.env?.optional ?? [];
  const aliases = provider.env?.aliases ?? [];
  const lines: string[] = [];

  lines.push("// .env");
  if (required.length === 0 && optional.length === 0 && aliases.length === 0) {
    lines.push("// No environment variables available.");
  } else {
    for (const name of required) {
      lines.push(`// ${name}=...`);
    }

    if (aliases.length > 0) {
      lines.push("// Alias");
      for (const name of aliases) {
        lines.push(`// ${name}=...`);
      }
    }

    if (optional.length > 0) {
      lines.push("// Optional");
      for (const name of optional) {
        lines.push(`// ${name}=...`);
      }
    }
  }

  lines.push("");
  lines.push('const { AnyResponses } = require("anyresponses");');
  lines.push("");
  lines.push("const client = new AnyResponses();");
  lines.push("");
  lines.push("const response = await client.responses.create({");
  lines.push(`  model: "${provider.id}/model-id",`);
  lines.push('  input: [{ type: "message", role: "user", content: "Hello" }]');
  lines.push("});");

  return lines.join("\n");
};

export function generateStaticParams() {
  return providers.map((provider) => ({
    providerId: provider.id,
  }));
}

export default async function ProviderDetailPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  const provider = providers.find((item) => item.id === providerId);

  if (!provider) {
    notFound();
  }

  const notes = provider.notes ?? [];
  const optionsCode = buildOptionsCode(provider);
  const envCode = buildEnvCode(provider);

  return (
    <div className="page">
      <div className="bg-orb orb-1" aria-hidden="true" />
      <div className="bg-orb orb-2" aria-hidden="true" />
      <div className="bg-orb orb-3" aria-hidden="true" />

      <SiteHeader />

      <main className="content">
        <section className="section provider-detail">
          <div className="section-block provider-detail-block">
            <div className="provider-detail-header">
              <Link className="section-link" href="/providers">
                Back to providers
              </Link>
              <h1>{provider.name}</h1>
              <p>{provider.description}</p>
            </div>

            <div className="grid provider-detail-grid">
              <div className="glass-card provider-detail-card">
                <h3>Core settings</h3>
                <dl className="provider-meta">
                  <div className="provider-meta-row">
                    <dt>Provider ID</dt>
                    <dd>
                      <ProviderIdRow providerId={provider.id} />
                    </dd>
                  </div>
                  <div className="provider-meta-row">
                    <dt>Default base URL</dt>
                    <dd>{provider.default_base_url}</dd>
                  </div>
                  {provider.default_region ? (
                    <div className="provider-meta-row">
                      <dt>Default region</dt>
                      <dd>{provider.default_region}</dd>
                    </div>
                  ) : null}
                </dl>
                {notes.length > 0 ? (
                  <div className="provider-notes">
                    <h4>Notes</h4>
                    <ul className="bullet-list">
                      {notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              <div className="glass-card provider-detail-card">
                <h3>Options</h3>
                <p className="provider-hint">
                  Configure this provider using either options or environment
                  variables; only one method is required.
                </p>
                <dl className="provider-meta">
                  <div className="provider-meta-row">
                    <dt>Required options</dt>
                    <dd>{renderPills(provider.required_options)}</dd>
                  </div>
                  <div className="provider-meta-row">
                    <dt>Optional options</dt>
                    <dd>{renderPills(provider.optional_options)}</dd>
                  </div>
                </dl>
                <pre className="code-block hero-code language-javascript provider-code">
                  <code
                    className="language-javascript"
                    dangerouslySetInnerHTML={{
                      __html: highlightCode(optionsCode),
                    }}
                  />
                </pre>
              </div>

              <div className="glass-card provider-detail-card">
                <h3>Environment variables</h3>
                <p className="provider-hint">
                  Configure this provider using either options or environment
                  variables; only one method is required.
                </p>
                <dl className="provider-meta">
                  <div className="provider-meta-row">
                    <dt>Env prefix</dt>
                    <dd>
                      {provider.env_prefix ? (
                        renderPills([provider.env_prefix])
                      ) : (
                        <span className="provider-empty">None</span>
                      )}
                    </dd>
                  </div>
                  <div className="provider-meta-row">
                    <dt>Required</dt>
                    <dd>{renderPills(provider.env?.required)}</dd>
                  </div>
                  <div className="provider-meta-row">
                    <dt>Optional</dt>
                    <dd>{renderPills(provider.env?.optional)}</dd>
                  </div>
                </dl>
                <pre className="code-block hero-code language-javascript provider-code">
                  <code
                    className="language-javascript"
                    dangerouslySetInnerHTML={{
                      __html: highlightCode(envCode),
                    }}
                  />
                </pre>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
