import { getCloudflareContext } from "@opennextjs/cloudflare";

type CloudflareEnv = {
  MY_DB?: D1Database;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  AUTH_BASE_URL?: string;
  AUTH_SECRET?: string;
  AUTH_SESSION_MAX_AGE?: string;
  BYOK_ENCRYPTION_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  WECHAT_PAY_APP_ID?: string;
  WECHAT_PAY_MCH_ID?: string;
  WECHAT_PAY_MCH_SERIAL_NO?: string;
  WECHAT_PAY_PRIVATE_KEY?: string;
  WECHAT_PAY_NOTIFY_URL?: string;
  WECHAT_API_KEY_V3?: string;
  WECHAT_PAY_PLATFORM_PUBLIC_KEY?: string;
  WECHAT_PAY_PLATFORM_SERIAL?: string;
};

const encoder = new TextEncoder();
const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type OAuthProvider = "google" | "github";

export type OAuthProfile = {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string;
  name: string;
};

export function getEnv(): CloudflareEnv {
  let cfEnv: CloudflareEnv = {};
  try {
    cfEnv = getCloudflareContext().env as CloudflareEnv;
  } catch {
    // Ignore when running outside Cloudflare.
  }
  return {
    ...process.env,
    ...cfEnv,
  } as CloudflareEnv;
}

export function requireEnv<K extends keyof CloudflareEnv>(
  key: K
): NonNullable<CloudflareEnv[K]> {
  const env = getEnv();
  const value = env[key];
  if (!value) {
    throw new Error(`${String(key)} is not configured.`);
  }
  return value as NonNullable<CloudflareEnv[K]>;
}

export function getDb(): D1Database {
  const env = getEnv();
  if (!env.MY_DB) {
    throw new Error("MY_DB is not configured.");
  }
  return env.MY_DB;
}

export function getBaseUrl(request: Request) {
  const env = getEnv();
  if (env.AUTH_BASE_URL) {
    return env.AUTH_BASE_URL.replace(/\/$/, "");
  }
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (request.url.startsWith("https") ? "https" : "http");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) {
    throw new Error("Unable to determine request host.");
  }
  return `${proto}://${host}`;
}

export function getRedirectUri(request: Request, provider: OAuthProvider) {
  return `${getBaseUrl(request)}/api/auth/${provider}/callback`;
}

export function createOAuthState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64UrlEncodeBytes(bytes);
}

export function getSessionMaxAgeSeconds() {
  const env = getEnv();
  const raw = env.AUTH_SESSION_MAX_AGE;
  if (!raw) {
    return DEFAULT_SESSION_MAX_AGE_SECONDS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SESSION_MAX_AGE_SECONDS;
  }
  return parsed;
}

export function buildStateCookie(provider: OAuthProvider, state: string, baseUrl: string) {
  return {
    name: `oauth_state_${provider}`,
    value: state,
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: baseUrl.startsWith("https://"),
      path: `/api/auth/${provider}/callback`,
      maxAge: 600,
    },
  };
}

export function buildSessionCookie(token: string, baseUrl: string, maxAgeSeconds: number) {
  return {
    name: "ar_session",
    value: token,
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: baseUrl.startsWith("https://"),
      path: "/",
      maxAge: maxAgeSeconds,
    },
  };
}

export function buildCookieClear(name: string, baseUrl: string, path = "/") {
  return {
    name,
    value: "",
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: baseUrl.startsWith("https://"),
      path,
      maxAge: 0,
    },
  };
}

export async function createSessionToken(payload: Record<string, unknown>, secret: string) {
  const encodedPayload = base64UrlEncodeString(JSON.stringify(payload));
  const signature = await hmacSign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(token: string, secret: string) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = await hmacSign(encodedPayload, secret);
  if (!timingSafeEqual(expectedSignature, signature)) {
    return null;
  }

  const payloadJson = base64UrlDecodeToString(encodedPayload);
  try {
    return JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function upsertOAuthUser(profile: OAuthProfile) {
  const db = getDb();
  const now = Date.now();
  const account = await db
    .prepare(
      "SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_account_id = ?"
    )
    .bind(profile.provider, profile.providerAccountId)
    .first<{ user_id: string }>();

  if (account?.user_id) {
    await db
      .prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?")
      .bind(profile.name, now, account.user_id)
      .run();
    return { userId: account.user_id };
  }

  const existingUser = await db
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(profile.email)
    .first<{ id: string }>();

  const userId = existingUser?.id ?? crypto.randomUUID();
  const statements: D1PreparedStatement[] = [];

  if (!existingUser) {
    statements.push(
      db
        .prepare(
          "INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(userId, profile.email, profile.name, now, now)
    );
  } else {
    statements.push(
      db
        .prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?")
        .bind(profile.name, now, userId)
    );
  }

  statements.push(
    db
      .prepare(
        "INSERT INTO oauth_accounts (id, user_id, provider, provider_account_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(
        crypto.randomUUID(),
        userId,
        profile.provider,
        profile.providerAccountId,
        now,
        now
      )
  );

  await db.batch(statements);
  return { userId };
}

function base64UrlEncodeString(value: string) {
  return base64UrlEncodeBytes(encoder.encode(value));
}

function base64UrlDecodeToString(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function base64UrlEncodeBytes(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacSign(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
}
