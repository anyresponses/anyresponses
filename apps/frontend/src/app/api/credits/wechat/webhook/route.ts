import { NextRequest, NextResponse } from "next/server";

import { getDb, getEnv, requireEnv } from "../../../auth/_helpers";

const MONEY_SCALE = 10n ** 10n;
const FEE_BPS = 800;
const USD_TO_CNY_FEN_RATE = 7;

type WechatEncryptedResource = {
  algorithm?: string;
  ciphertext?: string;
  nonce?: string;
  associated_data?: string;
};

type WechatNotifyPayload = {
  id?: string;
  create_time?: string;
  event_type?: string;
  resource_type?: string;
  resource?: WechatEncryptedResource;
  summary?: string;
};

type WechatTransaction = {
  mchid?: string;
  appid?: string;
  out_trade_no?: string;
  transaction_id?: string;
  trade_state?: string;
  amount?: {
    total?: number;
    currency?: string;
  };
};

type TopupRecord = {
  user_id: string;
  amount: string | number;
  status: string;
};

const textEncoder = new TextEncoder();

const base64Encode = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64Decode = (value: string) => {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const pemToArrayBuffer = (pem: string) => {
  const normalized = pem.replace(/\\n/g, "\n");
  const body = normalized
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s+/g, "");
  return base64Decode(body).buffer;
};

const verifyWechatSignature = async (
  payloadText: string,
  timestamp: string,
  nonce: string,
  signature: string
) => {
  const publicKey = requireEnv("WECHAT_PAY_PLATFORM_PUBLIC_KEY");
  const message = `${timestamp}\n${nonce}\n${payloadText}\n`;
  const key = await crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(publicKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64Decode(signature),
    textEncoder.encode(message)
  );
};

const decryptWechatResource = async (resource: WechatEncryptedResource) => {
  const apiKeyV3 = requireEnv("WECHAT_API_KEY_V3");
  if (apiKeyV3.length !== 32) {
    throw new Error("WECHAT_API_KEY_V3 must be exactly 32 characters.");
  }
  if (resource.algorithm !== "AEAD_AES_256_GCM") {
    throw new Error("Unsupported WeChat encryption algorithm.");
  }
  if (!resource.ciphertext || !resource.nonce) {
    throw new Error("Invalid encrypted resource payload.");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(apiKeyV3),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: textEncoder.encode(resource.nonce),
      additionalData: textEncoder.encode(resource.associated_data ?? ""),
      tagLength: 128,
    },
    key,
    base64Decode(resource.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(new Uint8Array(plaintext))) as WechatTransaction;
};

const parseBigInt = (value: string | number) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  return null;
};

const computeExpectedTotalFen = (creditUnits: string | number) => {
  const units = parseBigInt(creditUnits);
  if (units === null || units < 0n) {
    return null;
  }
  const amountCents = Number(units / (MONEY_SCALE / 100n));
  if (!Number.isFinite(amountCents)) {
    return null;
  }
  const feeCents = Math.round((amountCents * FEE_BPS) / 10000);
  return (amountCents + feeCents) * USD_TO_CNY_FEN_RATE;
};

const successResponse = () =>
  NextResponse.json({ code: "SUCCESS", message: "成功" }, { status: 200 });

const failResponse = (message: string, status = 500) =>
  NextResponse.json({ code: "FAIL", message }, { status });

export async function POST(request: NextRequest) {
  const timestamp = request.headers.get("wechatpay-timestamp");
  const nonce = request.headers.get("wechatpay-nonce");
  const signature = request.headers.get("wechatpay-signature");
  const serial = request.headers.get("wechatpay-serial");
  const expectedSerial = getEnv().WECHAT_PAY_PLATFORM_SERIAL?.trim();

  if (!timestamp || !nonce || !signature || !serial) {
    return failResponse("Missing WeChat signature headers.", 400);
  }

  if (expectedSerial && serial !== expectedSerial) {
    return failResponse("Invalid WeChat platform serial.", 401);
  }

  const payloadText = await request.text();
  if (!payloadText) {
    return failResponse("Empty webhook payload.", 400);
  }

  let verified = false;
  try {
    verified = await verifyWechatSignature(payloadText, timestamp, nonce, signature);
  } catch (error) {
    return failResponse(
      error instanceof Error ? error.message : "Failed to verify WeChat signature.",
      500
    );
  }
  if (!verified) {
    return failResponse("Invalid WeChat signature.", 401);
  }

  let payload: WechatNotifyPayload | null = null;
  try {
    payload = JSON.parse(payloadText) as WechatNotifyPayload;
  } catch {
    payload = null;
  }
  if (!payload?.resource) {
    return failResponse("Invalid webhook payload.", 400);
  }

  if (payload.event_type !== "TRANSACTION.SUCCESS") {
    return successResponse();
  }

  let transaction: WechatTransaction;
  try {
    transaction = await decryptWechatResource(payload.resource);
  } catch (error) {
    return failResponse(
      error instanceof Error ? error.message : "Failed to decrypt WeChat resource.",
      500
    );
  }

  const mchid = requireEnv("WECHAT_PAY_MCH_ID");
  const appid = requireEnv("WECHAT_PAY_APP_ID");
  if (transaction.mchid !== mchid || transaction.appid !== appid) {
    return failResponse("Mismatched mchid or appid.", 400);
  }

  const outTradeNo = transaction.out_trade_no?.trim();
  if (!outTradeNo) {
    return failResponse("Missing out_trade_no.", 400);
  }
  if (transaction.trade_state && transaction.trade_state !== "SUCCESS") {
    return successResponse();
  }
  if ((transaction.amount?.currency ?? "").toUpperCase() !== "CNY") {
    return failResponse("Unexpected transaction currency.", 400);
  }

  const db = getDb();
  const topup = await db
    .prepare(
      "SELECT user_id, amount, status FROM credit_topups WHERE stripe_session_id = ? LIMIT 1"
    )
    .bind(outTradeNo)
    .first<TopupRecord>();
  if (!topup) {
    return failResponse("Top-up order not found.");
  }

  const expectedFen = computeExpectedTotalFen(topup.amount);
  const paidFen = transaction.amount?.total;
  if (
    expectedFen === null ||
    typeof paidFen !== "number" ||
    !Number.isFinite(paidFen) ||
    expectedFen !== paidFen
  ) {
    return failResponse("Amount mismatch.");
  }

  if (topup.status === "completed") {
    return successResponse();
  }

  const updateResult = await db
    .prepare(
      "UPDATE credit_topups SET status = ?, stripe_payment_intent = ? WHERE stripe_session_id = ? AND status != ?"
    )
    .bind("completed", transaction.transaction_id ?? null, outTradeNo, "completed")
    .run();

  if ((updateResult.meta?.changes ?? 0) > 0) {
    await db
      .prepare("UPDATE users SET credits = credits + ? WHERE id = ?")
      .bind(topup.amount, topup.user_id)
      .run();
  }

  return successResponse();
}
