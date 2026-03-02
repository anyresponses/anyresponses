import { NextRequest, NextResponse } from "next/server";

import { getDb, requireEnv, verifySessionToken } from "../auth/_helpers";

type SessionPayload = {
  userId?: string;
};

type ApiKeyRecord = {
  id: string;
  name: string;
  apiKey: string;
  createdAt: number;
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

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const result = await db
    .prepare(
      "SELECT id, name, api_key as apiKey, created_at as createdAt FROM api_keys WHERE user_id = ? ORDER BY created_at DESC"
    )
    .bind(userId)
    .all<ApiKeyRecord>();

  const keys = result.results ?? [];

  return NextResponse.json({ keys }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: "Name is too long" }, { status: 400 });
  }

  const apiKey = `ar_${base64UrlEncode(
    crypto.getRandomValues(new Uint8Array(24))
  )}`;
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const db = getDb();
  const existing = await db
    .prepare("SELECT id FROM api_keys WHERE user_id = ? AND name = ?")
    .bind(userId, name)
    .first<{ id: string }>();
  if (existing?.id) {
    return NextResponse.json({ error: "Name already exists" }, { status: 409 });
  }
  await db
    .prepare(
      "INSERT INTO api_keys (id, user_id, name, api_key, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id, userId, name, apiKey, createdAt)
    .run();

  const key: ApiKeyRecord = { id, name, apiKey, createdAt };
  return NextResponse.json({ key }, { status: 201 });
}
