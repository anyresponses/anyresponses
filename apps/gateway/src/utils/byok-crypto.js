const ENCRYPTION_PREFIX = "enc:v1:";
const IV_LENGTH = 12;

let cachedKey = null;
let cachedKeyValue = null;

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getEncryptionKey(secret) {
  const raw = typeof secret === "string" ? secret.trim() : "";
  if (!raw) {
    return null;
  }
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
    ["decrypt"],
  );
  return cachedKey;
}

function hasEncryptedValue(options) {
  if (!options || typeof options !== "object") {
    return false;
  }
  return Object.values(options).some(
    (value) => typeof value === "string" && value.startsWith(ENCRYPTION_PREFIX),
  );
}

async function decryptValue(value, key) {
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
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipher,
  );
  return new TextDecoder().decode(plaintext);
}

async function decryptOptions(options, secret) {
  const key = await getEncryptionKey(secret);
  if (!key) {
    if (hasEncryptedValue(options)) {
      throw new Error("BYOK_ENCRYPTION_KEY is not configured.");
    }
    return options;
  }
  const entries = await Promise.all(
    Object.entries(options).map(async ([name, value]) => {
      if (typeof value !== "string") {
        return null;
      }
      const resolved = value.startsWith(ENCRYPTION_PREFIX)
        ? await decryptValue(value, key)
        : value;
      return [name, resolved];
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== null));
}

export { decryptOptions };
