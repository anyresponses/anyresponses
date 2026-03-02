import { NextRequest, NextResponse } from "next/server";

import { getDb, requireEnv, verifySessionToken } from "../../auth/_helpers";

type SessionPayload = {
  userId?: string;
};

type KeyRecord = {
  id: string;
  name: string;
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

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const result = await db
    .prepare("SELECT id, name FROM api_keys WHERE user_id = ? ORDER BY name")
    .bind(userId)
    .all<KeyRecord>();

  return NextResponse.json({ keys: result.results ?? [] }, { status: 200 });
}
