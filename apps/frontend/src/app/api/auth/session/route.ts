import { NextRequest, NextResponse } from "next/server";

import { requireEnv, verifySessionToken } from "../_helpers";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("ar_session")?.value;
  if (!token) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const payload = await verifySessionToken(token, requireEnv("AUTH_SECRET"));
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const user = {
    id: payload.userId,
    name: payload.name,
    email: payload.email,
    provider: payload.provider,
  };

  return NextResponse.json({ user }, { status: 200 });
}
