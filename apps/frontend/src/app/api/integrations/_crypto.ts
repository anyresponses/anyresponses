import { requireEnv } from "../auth/_helpers";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ENCRYPTION_PREFIX = "enc:v1:";
const IV_LENGTH = 12;

let cachedKey: CryptoKey | null = null;
let cachedKeyValue: string | null = null;

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getEncryptionKey() {
  const raw = requireEnv("BYOK_ENCRYPTION_KEY").trim();
  if (cachedKey && cachedKeyValue === raw) {
    return cachedKey;
  }
  const bytes = base64UrlDecode(raw);
  if (bytes.length !== 32) {
    throw new Error("BYOK_ENCRYPTION_KEY must be a base64 encoded 32-byte key.");
  }
  cachedKeyValue = raw;
  cachedKey = await crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  return cachedKey;
}

function shouldEncrypt(providerId: string, name: string) {
  if (/apikey/i.test(name)) {
    return true;
  }
  return providerId === "vertex" && /privatekey/i.test(name);
}

export async function encryptValue(value: string) {
  if (value.startsWith(ENCRYPTION_PREFIX)) {
    return value;
  }
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(value)
  );
  return `${ENCRYPTION_PREFIX}${base64UrlEncode(iv)}.${base64UrlEncode(
    new Uint8Array(cipher)
  )}`;
}

export async function decryptValue(value: string) {
  if (!value.startsWith(ENCRYPTION_PREFIX)) {
    return value;
  }
  const payload = value.slice(ENCRYPTION_PREFIX.length);
  const [ivEncoded, cipherEncoded] = payload.split(".");
  if (!ivEncoded || !cipherEncoded) {
    throw new Error("Invalid encrypted payload.");
  }
  const iv = base64UrlDecode(ivEncoded);
  const cipher = base64UrlDecode(cipherEncoded);
  const key = await getEncryptionKey();
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return decoder.decode(plaintext);
}

export async function encryptOptions(
  providerId: string,
  options: Record<string, string>
) {
  const entries = await Promise.all(
    Object.entries(options).map(async ([name, value]) => {
      if (shouldEncrypt(providerId, name)) {
        return [name, await encryptValue(value)] as const;
      }
      return [name, value] as const;
    })
  );
  return Object.fromEntries(entries);
}

export async function decryptOptions(
  providerId: string,
  options: Record<string, string>
) {
  const entries = await Promise.all(
    Object.entries(options).map(async ([name, value]) => {
      if (typeof value !== "string") {
        return null;
      }
      if (value.startsWith(ENCRYPTION_PREFIX)) {
        return [name, await decryptValue(value)] as const;
      }
      if (shouldEncrypt(providerId, name)) {
        return [name, value] as const;
      }
      return [name, value] as const;
    })
  );
  return Object.fromEntries(entries.filter((entry) => entry !== null));
}
