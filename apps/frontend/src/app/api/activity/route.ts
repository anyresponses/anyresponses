import { NextRequest, NextResponse } from "next/server";

import { unitsToDecimalString } from "../../lib/money";
import { getDb, requireEnv, verifySessionToken } from "../auth/_helpers";

type SessionPayload = {
  userId?: string;
};

type ActivityRecord = {
  id: string;
  modelId: string;
  modelName: string | null;
  keyName: string | null;
  integrationId: string | null;
  stream: number | null;
  status: number;
  responseStatus: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: string | null;
  durationMs: number | null;
  createdAt: number;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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

const stripNamePrefix = (value: string) => value.replace(/^[^:]+:\s*/, "");

const normalizeModelName = (name: string | null, modelId: string) => {
  if (typeof name === "string" && name.trim().length > 0) {
    return stripNamePrefix(name.trim());
  }
  return modelId;
};

const parseDateParam = (value: string | null, endOfDay: boolean) => {
  if (!value) {
    return null;
  }
  const suffix = endOfDay ? "T23:59:59.999" : "T00:00:00";
  const parsed = new Date(`${value}${suffix}`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.getTime();
};

const parseLimit = (value: string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(parsed), MAX_LIMIT);
};

const parseOffset = (value: string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
};

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  const offset = parseOffset(searchParams.get("offset"));
  const keyId = searchParams.get("keyId")?.trim();
  const modelId = searchParams.get("modelId")?.trim();
  const startDate = parseDateParam(searchParams.get("startDate"), false);
  const endDate = parseDateParam(searchParams.get("endDate"), true);

  const conditions: string[] = ["request_logs.user_id = ?"];
  const bindings: unknown[] = [userId];

  if (keyId) {
    conditions.push("request_logs.api_key_id = ?");
    bindings.push(keyId);
  }

  if (modelId) {
    conditions.push("request_logs.model = ?");
    bindings.push(modelId);
  }

  if (startDate != null) {
    conditions.push("request_logs.created_at >= ?");
    bindings.push(startDate);
  }

  if (endDate != null) {
    conditions.push("request_logs.created_at <= ?");
    bindings.push(endDate);
  }

  const db = getDb();
  const result = await db
    .prepare(
      `SELECT request_logs.id as id,
        request_logs.model as modelId,
        models.name as modelName,
        api_keys.name as keyName,
        COALESCE(request_logs.integration_id, 'anyresponses') as integrationId,
        request_logs.stream as stream,
        request_logs.status as status,
        request_logs.response_status as responseStatus,
        request_logs.input_tokens as inputTokens,
        request_logs.output_tokens as outputTokens,
        CAST(request_logs.cost_usd AS TEXT) as costUsd,
        request_logs.duration_ms as durationMs,
        request_logs.created_at as createdAt
      FROM request_logs
      LEFT JOIN api_keys ON api_keys.id = request_logs.api_key_id
      LEFT JOIN models ON models.id = request_logs.model
      WHERE ${conditions.join(" AND ")}
      ORDER BY request_logs.created_at DESC
      LIMIT ? OFFSET ?`
    )
    .bind(...bindings, limit + 1, offset)
    .all<ActivityRecord>();

  const results = result.results ?? [];
  const hasMore = results.length > limit;
  const trimmed = hasMore ? results.slice(0, limit) : results;
  const records = trimmed.map((record) => ({
    ...record,
    modelName: normalizeModelName(record.modelName, record.modelId),
    costUsd: unitsToDecimalString(record.costUsd),
  }));

  return NextResponse.json({ records, hasMore }, { status: 200 });
}
