import { NextRequest, NextResponse } from "next/server";

import providersData from "../../../data/providers.json";
import { getDb, requireEnv, verifySessionToken } from "../auth/_helpers";
import { decryptOptions, encryptOptions } from "./_crypto";

type SessionPayload = {
  userId?: string;
};

type IntegrationRecord = {
  id: string;
  providerId: string;
  integrationId: string;
  optionsJson: string;
  alwaysUse: number;
  createdAt: number;
  updatedAt?: number | null;
};

type IntegrationResponse = {
  entryId: string;
  providerId: string;
  integrationId: string;
  options: Record<string, string>;
  alwaysUse: boolean;
  createdAt: number;
  updatedAt?: number;
};

const providers = providersData.providers;
const providerMap = new Map(
  providers.map((provider) => [provider.id, provider])
);

async function getSessionUserId(request: NextRequest) {
  const token = request.cookies.get("ar_session")?.value;
  if (!token) {
    return null;
  }
  const payload = (await verifySessionToken(
    token,
    requireEnv("AUTH_SECRET")
  )) as SessionPayload | null;
  if (!payload?.userId || typeof payload.userId !== "string") {
    return null;
  }
  return payload.userId;
}

function normalizeOptions(
  providerId: string,
  rawOptions: Record<string, unknown>
) {
  const provider = providerMap.get(providerId);
  if (!provider) {
    return { provider: null, options: {}, missing: [] as string[] };
  }
  const required = provider.required_options ?? [];
  const optional = provider.optional_options ?? [];
  const allowed = new Set([...required, ...optional]);
  const options: Record<string, string> = {};

  allowed.forEach((name) => {
    const value = rawOptions[name];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        options[name] = trimmed;
      }
    }
  });

  const missing = required.filter((name) => !(name in options));
  return { provider, options, missing };
}

function parseBody(body: unknown) {
  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const providerId =
    typeof payload.providerId === "string" ? payload.providerId.trim() : "";
  const integrationId =
    typeof payload.integrationId === "string" ? payload.integrationId.trim() : "";
  const options =
    payload.options && typeof payload.options === "object"
      ? (payload.options as Record<string, unknown>)
      : {};
  const alwaysUse =
    payload.alwaysUse === true ||
    payload.alwaysUse === "true" ||
    payload.alwaysUse === 1 ||
    payload.alwaysUse === "1";
  return { providerId, integrationId, options, alwaysUse };
}

async function buildResponse(record: IntegrationRecord) {
  let parsed: Record<string, string> = {};
  if (record.optionsJson) {
    try {
      parsed = JSON.parse(record.optionsJson) as Record<string, string>;
    } catch {
      parsed = {};
    }
  }
  const options = await decryptOptions(record.providerId, parsed);
  return {
    entryId: record.id,
    providerId: record.providerId,
    integrationId: record.integrationId,
    options,
    alwaysUse: record.alwaysUse === 1,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt ?? undefined,
  } satisfies IntegrationResponse;
}

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const result = await db
    .prepare(
      "SELECT id, provider_id as providerId, integration_id as integrationId, options_json as optionsJson, always_use as alwaysUse, created_at as createdAt, updated_at as updatedAt FROM integrations WHERE user_id = ? ORDER BY created_at DESC"
    )
    .bind(userId)
    .all<IntegrationRecord>();

  const integrations = await Promise.all(
    (result.results ?? []).map((record) => buildResponse(record))
  );

  return NextResponse.json({ integrations }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { providerId, integrationId, options: rawOptions, alwaysUse } = parseBody(body);

  if (!providerId || !integrationId) {
    return NextResponse.json(
      { error: "Provider and integration ID are required." },
      { status: 400 }
    );
  }
  if (integrationId.length > 80) {
    return NextResponse.json({ error: "Integration ID is too long." }, { status: 400 });
  }

  const { provider, options, missing } = normalizeOptions(providerId, rawOptions);
  if (!provider) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  }
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Missing required fields.", missing },
      { status: 400 }
    );
  }

  const db = getDb();
  const existing = await db
    .prepare("SELECT id FROM integrations WHERE user_id = ? AND integration_id = ?")
    .bind(userId, integrationId)
    .first<{ id: string }>();
  if (existing?.id) {
    return NextResponse.json({ error: "Integration ID already exists." }, { status: 409 });
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const encryptedOptions = await encryptOptions(providerId, options);
  if (alwaysUse) {
    await db
      .prepare("UPDATE integrations SET always_use = 0 WHERE user_id = ? AND provider_id = ?")
      .bind(userId, providerId)
      .run();
  }
  await db
    .prepare(
      "INSERT INTO integrations (id, user_id, provider_id, integration_id, options_json, always_use, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      id,
      userId,
      providerId,
      integrationId,
      JSON.stringify(encryptedOptions),
      alwaysUse ? 1 : 0,
      now,
      now
    )
    .run();

  const integration: IntegrationResponse = {
    entryId: id,
    providerId,
    integrationId,
    options,
    alwaysUse,
    createdAt: now,
    updatedAt: now,
  };

  return NextResponse.json({ integration }, { status: 201 });
}
