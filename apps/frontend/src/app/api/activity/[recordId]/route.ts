import { NextRequest, NextResponse } from "next/server";

import { unitsToDecimalString } from "../../../lib/money";
import { getDb, requireEnv, verifySessionToken } from "../../auth/_helpers";

type SessionPayload = {
  userId?: string;
};

type ActivityDetail = {
  id: string;
  apiKeyId: string;
  keyName: string | null;
  integrationId: string | null;
  userId: string;
  provider: string;
  model: string;
  modelName: string | null;
  stream: number;
  status: number;
  responseStatus: string | null;
  finishReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: string | null;
  feedback: number | null;
  feedbackText: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: number;
  durationMs: number;
};

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ recordId: string }> }
) {
  const userId = await getSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { recordId } = await context.params;
  if (!recordId) {
    return NextResponse.json({ error: "Missing record id" }, { status: 400 });
  }

  const db = getDb();
  const record = await db
    .prepare(
      `SELECT request_logs.id as id,
        request_logs.api_key_id as apiKeyId,
        api_keys.name as keyName,
        COALESCE(request_logs.integration_id, 'anyresponses') as integrationId,
        request_logs.user_id as userId,
        request_logs.provider as provider,
        request_logs.model as model,
        models.name as modelName,
        request_logs.stream as stream,
        request_logs.status as status,
        request_logs.response_status as responseStatus,
        request_logs.finish_reason as finishReason,
        request_logs.input_tokens as inputTokens,
        request_logs.output_tokens as outputTokens,
        request_logs.total_tokens as totalTokens,
        CAST(request_logs.cost_usd AS TEXT) as costUsd,
        request_logs.feedback as feedback,
        request_logs.feedback_text as feedbackText,
        request_logs.error_code as errorCode,
        request_logs.error_message as errorMessage,
        request_logs.created_at as createdAt,
        request_logs.duration_ms as durationMs
      FROM request_logs
      LEFT JOIN api_keys ON api_keys.id = request_logs.api_key_id
      LEFT JOIN models ON models.id = request_logs.model
      WHERE request_logs.id = ? AND request_logs.user_id = ?
      LIMIT 1`
    )
    .bind(recordId, userId)
    .first<ActivityDetail>();

  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      record: {
        ...record,
        costUsd: unitsToDecimalString(record.costUsd),
      },
    },
    { status: 200 }
  );
}
