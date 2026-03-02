import { NextResponse } from "next/server";

import {
  buildStateCookie,
  createOAuthState,
  getBaseUrl,
  getRedirectUri,
  requireEnv,
} from "../_helpers";

export async function GET(request: Request) {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const state = createOAuthState();
  const redirectUri = getRedirectUri(request, "google");
  const baseUrl = getBaseUrl(request);

  const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid email profile");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("access_type", "online");

  const response = NextResponse.redirect(authorizeUrl);
  const stateCookie = buildStateCookie("google", state, baseUrl);
  response.cookies.set(stateCookie.name, stateCookie.value, stateCookie.options);
  return response;
}
