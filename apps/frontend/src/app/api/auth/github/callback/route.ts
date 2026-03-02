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

type GithubTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GithubUser = {
  id?: number;
  name?: string | null;
  login?: string;
  email?: string | null;
};

type GithubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const baseUrl = getBaseUrl(request);
  const redirectUri = getRedirectUri(request, "github");
  const stateCookieName = "oauth_state_github";
  const storedState = request.cookies.get(stateCookieName)?.value;

  if (!code || !state || !storedState || storedState !== state) {
    const response = NextResponse.redirect(new URL("/auth?error=oauth_state", request.url));
    const clearCookie = buildCookieClear(
      stateCookieName,
      baseUrl,
      "/api/auth/github/callback"
    );
    response.cookies.set(clearCookie.name, clearCookie.value, clearCookie.options);
    return response;
  }

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GITHUB_CLIENT_ID"),
      client_secret: requireEnv("GITHUB_CLIENT_SECRET"),
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = (await tokenResponse.json()) as GithubTokenResponse;
  if (!tokenResponse.ok || !tokenData.access_token) {
    console.error("GitHub token exchange failed", tokenData);
    return NextResponse.redirect(new URL("/auth?error=github_token", request.url));
  }

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "User-Agent": "AnyResponses",
    },
  });
  const userData = (await userResponse.json()) as GithubUser;
  if (!userResponse.ok || !userData.id) {
    console.error("GitHub user fetch failed", userData);
    return NextResponse.redirect(new URL("/auth?error=github_user", request.url));
  }

  let email = userData.email || "";
  if (!email) {
    const emailsResponse = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "User-Agent": "AnyResponses",
      },
    });
    const emailsData = (await emailsResponse.json()) as GithubEmail[];
    if (emailsResponse.ok && Array.isArray(emailsData)) {
      const primaryEmail =
        emailsData.find((entry) => entry.primary && entry.verified) ||
        emailsData.find((entry) => entry.primary) ||
        emailsData.find((entry) => entry.verified);
      email = primaryEmail?.email || "";
    }
  }

  if (!email) {
    return NextResponse.redirect(new URL("/auth?error=github_email", request.url));
  }

  const name = userData.name || userData.login || email;

  const profile = {
    provider: "github" as const,
    providerAccountId: String(userData.id),
    email,
    name,
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
    "/api/auth/github/callback"
  );
  response.cookies.set(clearCookie.name, clearCookie.value, clearCookie.options);
  return response;
}
