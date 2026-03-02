import { NextResponse } from "next/server";

import { getDb } from "../auth/_helpers";

type ModelRecord = {
  id: string;
  author: string | null;
  name: string | null;
  summary: string | null;
  contextLength: number | null;
  created: number | null;
  promptPrice: number | null;
  completionPrice: number | null;
};

type ModelEntry = {
  id: string;
  name: string;
  summary: string;
  author: string;
  contextLength: number | null;
  promptPrice: number | null;
  completionPrice: number | null;
};

const MAX_SUMMARY_LENGTH = 220;

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

const buildSummary = (description: string | undefined, fallback: string) => {
  const normalized = (description ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return fallback;
  }
  if (normalized.length <= MAX_SUMMARY_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_SUMMARY_LENGTH - 3).trimEnd()}...`;
};

const stripNamePrefix = (value: string) => value.replace(/^[^:]+:\s*/, "");

const buildModelEntry = (record: ModelRecord): ModelEntry => {
  const author = record.author ?? "";
  const rawName = record.name ?? record.id;
  const name = stripNamePrefix(rawName);
  const summary = buildSummary(record.summary ?? "", name);
  const contextLength = toNumber(record.contextLength);
  const promptPrice = toNumber(record.promptPrice);
  const completionPrice = toNumber(record.completionPrice);

  return {
    id: record.id,
    name,
    summary,
    author,
    contextLength,
    promptPrice,
    completionPrice,
  };
};

export async function GET() {
  try {
    const db = getDb();
    const result = await db
      .prepare(
        "SELECT id, author, name, summary, context_length as contextLength, created, prompt_price as promptPrice, completion_price as completionPrice FROM models ORDER BY author, name"
      )
      .all<ModelRecord>();
    const models = (result.results ?? []).map((record) => buildModelEntry(record));
    return NextResponse.json({ models }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to load models." },
      { status: 500 }
    );
  }
}
