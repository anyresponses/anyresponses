import { NextRequest, NextResponse } from "next/server";

import {
  buildCookieClear,
  buildSessionCookie,
  createSessionToken,
  getBaseUrl,
  getRedirectUri,
  getSessionMaxAgeSeconds,
  requireEnv,
  upsertOAuthUser,
} from "../../_helpers";

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  name?: string;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const baseUrl = getBaseUrl(request);
  const redirectUri = getRedirectUri(request, "google");
  const stateCookieName = "oauth_state_google";
  const storedState = request.cookies.get(stateCookieName)?.value;

  if (!code || !state || !storedState || storedState !== state) {
    const response = NextResponse.redirect(new URL("/auth?error=oauth_state", request.url));
    const clearCookie = buildCookieClear(
      stateCookieName,
      baseUrl,
      "/api/auth/google/callback"
    );
    response.cookies.set(clearCookie.name, clearCookie.value, clearCookie.options);
    return response;
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokenData.access_token) {
    console.error("Google token exchange failed", tokenData);
    return NextResponse.redirect(new URL("/auth?error=google_token", request.url));
  }

  const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });
  const userData = (await userResponse.json()) as GoogleUserInfo;
  if (!userResponse.ok || !userData.sub || !userData.email) {
    console.error("Google userinfo failed", userData);
    return NextResponse.redirect(new URL("/auth?error=google_userinfo", request.url));
  }

  const profile = {
    provider: "google" as const,
    providerAccountId: userData.sub,
    email: userData.email,
    name: userData.name || userData.email,
  };

  const { userId } = await upsertOAuthUser(profile);
  const sessionToken = await createSessionToken(
    {
      userId,
      email: profile.email,
      name: profile.name,
      provider: profile.provider,
      issuedAt: Date.now(),
    },
    requireEnv("AUTH_SECRET")
  );

  const response = NextResponse.redirect(new URL("/", request.url));
  const sessionCookie = buildSessionCookie(
    sessionToken,
    baseUrl,
    getSessionMaxAgeSeconds()
  );
  response.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.options);

  const clearCookie = buildCookieClear(
    stateCookieName,
    baseUrl,
    "/api/auth/google/callback"
  );
  response.cookies.set(clearCookie.name, clearCookie.value, clearCookie.options);
  return response;
}
