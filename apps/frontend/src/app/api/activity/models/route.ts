import { NextRequest, NextResponse } from "next/server";

import { getDb, requireEnv, verifySessionToken } from "../../auth/_helpers";

type SessionPayload = {
  userId?: string;
};

type ModelRecord = {
  id: string;
  name: string | null;
};

type ModelOption = {
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

const stripNamePrefix = (value: string) => value.replace(/^[^:]+:\s*/, "");

const normalizeModelName = (name: string | null, modelId: string) => {
  if (typeof name === "string" && name.trim().length > 0) {
    return stripNamePrefix(name.trim());
  }
  return modelId;
};

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim() ?? "";
  const db = getDb();

  let result;
  if (query) {
    const like = `%${query}%`;
    result = await db
      .prepare(
        "SELECT id, name FROM models WHERE id LIKE ? OR name LIKE ? ORDER BY name"
      )
      .bind(like, like)
      .all<ModelRecord>();
  } else {
    result = await db
      .prepare("SELECT id, name FROM models ORDER BY name")
      .all<ModelRecord>();
  }

  const models: ModelOption[] = (result.results ?? []).map((record) => ({
    id: record.id,
    name: normalizeModelName(record.name, record.id),
  }));

  return NextResponse.json({ models }, { status: 200 });
}
