import { NextRequest, NextResponse } from "next/server";

import { unitsToDecimalString } from "../../lib/money";
import { getDb } from "../auth/_helpers";
import { getSessionUserId } from "./_session";

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const limitRaw = searchParams.get("limit");
  const offsetRaw = searchParams.get("offset");
  const limit = Math.min(
    50,
    Math.max(1, Number.parseInt(limitRaw ?? "10", 10) || 10)
  );
  const offset = Math.max(0, Number.parseInt(offsetRaw ?? "0", 10) || 0);

  const db = getDb();
  const user = await db
    .prepare("SELECT CAST(credits AS TEXT) as credits FROM users WHERE id = ?")
    .bind(userId)
    .first<{ credits: string | number }>();

  const credits = unitsToDecimalString(user?.credits) ?? "0";

  const topups = await db
    .prepare(
      "SELECT id, amount, currency, method, status, created_at as createdAt FROM credit_topups WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
    )
    .bind(userId, limit + 1, offset)
    .all<{
      id: string;
      amount: number;
      currency: string;
      method: string;
      status: string;
      createdAt: number;
    }>();

  const results = topups.results ?? [];
  const hasMore = results.length > limit;
  const normalizedTopups = results.slice(0, limit).map((record) => ({
    id: record.id,
    amount: unitsToDecimalString(record.amount) ?? "0",
    currency: record.currency,
    method: record.method,
    status: record.status,
    createdAt: record.createdAt,
  }));

  return NextResponse.json(
    { credits, topups: normalizedTopups, hasMore },
    { status: 200 }
  );
}
