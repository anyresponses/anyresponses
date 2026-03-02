import { NextResponse } from "next/server";

import {
  buildStateCookie,
  createOAuthState,
  getBaseUrl,
  getRedirectUri,
  requireEnv,
} from "../_helpers";

export async function GET(request: Request) {
  const clientId = requireEnv("GITHUB_CLIENT_ID");
  const state = createOAuthState();
  const redirectUri = getRedirectUri(request, "github");
  const baseUrl = getBaseUrl(request);

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "read:user user:email");
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);
  const stateCookie = buildStateCookie("github", state, baseUrl);
  response.cookies.set(stateCookie.name, stateCookie.value, stateCookie.options);
  return response;
}
