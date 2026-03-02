import fs from "node:fs";
import path from "node:path";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export type DocsPageMeta = {
  slug: string;
  title: string;
  description: string;
  group: string;
};

export const docsPages: DocsPageMeta[] = [
  {
    slug: "quickstart",
    title: "Quickstart",
    description: "Install and send your first request in minutes.",
    group: "Quickstart",
  },
  {
    slug: "custom-provider-keys",
    title: "Custom provider keys",
    description: "Route requests by prefix using your own provider API keys.",
    group: "Usage",
  },
  {
    slug: "gateway-anyresponses-key",
    title: "Official gateway key",
    description: "Use a single AnyResponses key to access hosted models.",
    group: "Usage",
  },
  {
    slug: "gateway-byok",
    title: "Gateway BYOK",
    description: "Use the official gateway with Integration ID prefixes.",
    group: "Usage",
  },
  {
    slug: "api-parameters",
    title: "API parameters",
    description: "Request shape, supported fields, streaming, and output format.",
    group: "API details",
  },
  {
    slug: "official-tests",
    title: "Official acceptance tests",
    description: "Six Open Responses tests with runnable examples.",
    group: "Official tests",
  },
  {
    slug: "providers",
    title: "Providers",
    description: "Provider prefixes, config options, and catalog links.",
    group: "Reference",
  },
  {
    slug: "models",
    title: "Models",
    description: "Gateway model ids and how to select them.",
    group: "Reference",
  },
  {
    slug: "compatibility",
    title: "Compatibility",
    description: "Prefix rules, gateway behavior, and normalization notes.",
    group: "Reference",
  },
];

const workspaceRoot = process.cwd();
const contentCandidates = [
  path.join(workspaceRoot, "apps/frontend/public/docs"),
  path.join(workspaceRoot, "public/docs"),
  path.join(workspaceRoot, "apps/frontend/src/app/docs/content"),
  path.join(workspaceRoot, "src/app/docs/content"),
];
const contentRoot =
  contentCandidates.find((candidate) => fs.existsSync(candidate)) ??
  contentCandidates[0];

async function readFromAssets(slug: string) {
  try {
    const { env } = getCloudflareContext();
    if (!env?.ASSETS) {
      return null;
    }
    const assetUrl = new URL(`/docs/${slug}.md`, "http://assets.local");
    const response = await env.ASSETS.fetch(assetUrl);
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

export async function getDocsMarkdown(slug: string) {
  const assetText = await readFromAssets(slug);
  if (assetText) {
    return assetText;
  }
  const filePath = path.join(contentRoot, `${slug}.md`);
  return fs.readFileSync(filePath, "utf8");
}
