import { NextRequest, NextResponse } from "next/server";

import { buildCookieClear, getBaseUrl } from "../_helpers";

export async function POST(request: NextRequest) {
  const baseUrl = getBaseUrl(request);
  const response = NextResponse.json({ ok: true });
  const clearCookie = buildCookieClear("ar_session", baseUrl);
  response.cookies.set(clearCookie.name, clearCookie.value, clearCookie.options);
  return response;
}
