import { NextRequest, NextResponse } from "next/server";

import { getDb, requireEnv, verifySessionToken } from "../../auth/_helpers";

type SessionPayload = {
  userId?: string;
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

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ keyId: string }> }
) {
  const { keyId } = await context.params;
  const userId = await getSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!keyId) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  const db = getDb();
  const result = await db
    .prepare("DELETE FROM api_keys WHERE id = ? AND user_id = ?")
    .bind(keyId, userId)
    .run();

  if (!result.meta?.changes) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
