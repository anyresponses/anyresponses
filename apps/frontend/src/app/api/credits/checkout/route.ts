import { NextRequest, NextResponse } from "next/server";

import { getBaseUrl, getDb, getEnv, requireEnv } from "../../auth/_helpers";
import { getSessionUserId } from "../_session";

const MONEY_SCALE = 10n ** 10n;
const MIN_AMOUNT_CENTS = 100;
const MAX_AMOUNT_CENTS = 1000000;
const FEE_BPS = 800;
const USD_TO_CNY_FEN_RATE = 7;
const WECHAT_API_BASE = "https://api.mch.weixin.qq.com";

type CheckoutRequest = {
  amount?: number | string;
  paymentMethod?: string;
};

type WechatNativeResponse = {
  code_url?: string;
};

type WechatOrderQueryResponse = {
  trade_state?: string;
};

type StripeSessionResponse = {
  id: string;
  url?: string | null;
};

const normalizePaymentMethod = (value?: string) => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "stripe") {
    return "stripe" as const;
  }
  return "wechat" as const;
};

const parseDecimal = (value: number | string) => {
  const raw = typeof value === "number" ? value.toString() : value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    return null;
  }
  return raw;
};

const decimalToCents = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  const fractionPadded = fraction.padEnd(2, "0").slice(0, 2);
  return Number(whole) * 100 + Number(fractionPadded);
};

const decimalToUnits = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  const fractionPadded = fraction.padEnd(10, "0").slice(0, 10);
  return BigInt(whole) * MONEY_SCALE + BigInt(fractionPadded);
};

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
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  return base64Decode(body).buffer;
};

const createNonce = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64Encode(bytes).replace(/[+/=]/g, "").slice(0, 24);
};

const signWechatMessage = async (message: string, privateKeyPem: string) => {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(message)
  );
  return base64Encode(new Uint8Array(signature));
};

const buildWechatAuthorization = async (
  method: string,
  canonicalUrl: string,
  body: string
) => {
  const mchid = requireEnv("WECHAT_PAY_MCH_ID");
  const serialNo = requireEnv("WECHAT_PAY_MCH_SERIAL_NO");
  const privateKey = requireEnv("WECHAT_PAY_PRIVATE_KEY");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = createNonce();
  const message = `${method}\n${canonicalUrl}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = await signWechatMessage(message, privateKey);
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`;
};

const callWechatApi = async (
  method: "POST" | "GET",
  canonicalUrl: string,
  body = ""
) => {
  const authorization = await buildWechatAuthorization(method, canonicalUrl, body);
  const response = await fetch(`${WECHAT_API_BASE}${canonicalUrl}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: authorization,
      "Content-Type": "application/json",
      "User-Agent": "anyresponses/credits-wechat-native",
    },
    body: method === "POST" ? body : undefined,
  });
  return response;
};

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CheckoutRequest = {};
  try {
    body = (await request.json()) as CheckoutRequest;
  } catch {
    body = {};
  }

  const decimalAmount =
    body.amount === undefined || body.amount === null
      ? null
      : parseDecimal(body.amount);
  if (!decimalAmount) {
    return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
  }

  const amountCents = decimalToCents(decimalAmount);
  if (
    !Number.isFinite(amountCents) ||
    amountCents < MIN_AMOUNT_CENTS ||
    amountCents > MAX_AMOUNT_CENTS
  ) {
    return NextResponse.json({ error: "Amount out of range." }, { status: 400 });
  }

  const feeCents = Math.round((amountCents * FEE_BPS) / 10000);
  const totalCents = amountCents + feeCents;
  const paymentMethod = normalizePaymentMethod(body.paymentMethod);
  const creditUnits = decimalToUnits(decimalAmount);
  const baseUrl = getBaseUrl(request);
  const now = Date.now();
  const db = getDb();
  if (paymentMethod === "stripe") {
    const payload = new URLSearchParams({
      mode: "payment",
      success_url: `${baseUrl}/credits?status=success`,
      cancel_url: `${baseUrl}/credits?status=cancel`,
      client_reference_id: userId,
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][product_data][name]": "Credits top-up",
      "line_items[0][price_data][unit_amount]": totalCents.toString(),
      "line_items[0][quantity]": "1",
      "metadata[user_id]": userId,
      "metadata[credit_units]": creditUnits.toString(),
      "metadata[amount_decimal]": decimalAmount,
      "metadata[currency]": "USD",
      "metadata[fee_cents]": feeCents.toString(),
    });

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireEnv("STRIPE_SECRET_KEY")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload.toString(),
    });

    if (!stripeResponse.ok) {
      const errorText = await stripeResponse.text().catch(() => "");
      return NextResponse.json(
        { error: "Failed to create Stripe checkout session.", detail: errorText },
        { status: 502 }
      );
    }

    const session = (await stripeResponse.json()) as StripeSessionResponse;
    if (!session?.id || !session.url) {
      return NextResponse.json(
        { error: "Invalid Stripe checkout session response." },
        { status: 502 }
      );
    }

    await db
      .prepare(
        "INSERT INTO credit_topups (id, user_id, amount, currency, method, status, stripe_session_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        crypto.randomUUID(),
        userId,
        Number(creditUnits),
        "USD",
        "Stripe",
        "pending",
        session.id,
        now
      )
      .run();

    return NextResponse.json({ url: session.url }, { status: 200 });
  }

  const totalCnyFen = totalCents * USD_TO_CNY_FEN_RATE;
  const outTradeNo = `ar_${Date.now()}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const notifyUrl = getEnv().WECHAT_PAY_NOTIFY_URL || `${baseUrl}/api/credits/wechat/webhook`;

  const wechatPayload = {
    appid: requireEnv("WECHAT_PAY_APP_ID"),
    mchid: requireEnv("WECHAT_PAY_MCH_ID"),
    description: "Credits top-up",
    out_trade_no: outTradeNo,
    notify_url: notifyUrl,
    amount: {
      total: totalCnyFen,
      currency: "CNY",
    },
  };
  const payloadText = JSON.stringify(wechatPayload);

  const wechatResponse = await callWechatApi(
    "POST",
    "/v3/pay/transactions/native",
    payloadText
  );

  if (!wechatResponse.ok) {
    const errorText = await wechatResponse.text().catch(() => "");
    return NextResponse.json(
      { error: "Failed to create WeChat order.", detail: errorText },
      { status: 502 }
    );
  }

  const order = (await wechatResponse.json()) as WechatNativeResponse;
  if (!order?.code_url) {
    return NextResponse.json(
      { error: "Invalid WeChat order response." },
      { status: 502 }
    );
  }

  await db
    .prepare(
      "INSERT INTO credit_topups (id, user_id, amount, currency, method, status, stripe_session_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      crypto.randomUUID(),
      userId,
      Number(creditUnits),
      "USD",
      "WeChat Pay",
      "pending",
      outTradeNo,
      now
    )
    .run();

  return NextResponse.json(
    { codeUrl: order.code_url, orderId: outTradeNo, totalCnyFen },
    { status: 200 }
  );
}

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orderId = request.nextUrl.searchParams.get("orderId")?.trim();
  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId." }, { status: 400 });
  }

  const db = getDb();
  const topup = await db
    .prepare(
      "SELECT amount, status FROM credit_topups WHERE user_id = ? AND stripe_session_id = ? LIMIT 1"
    )
    .bind(userId, orderId)
    .first<{ amount: number | string; status: string }>();

  if (!topup) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (topup.status === "completed") {
    return NextResponse.json({ status: "completed" }, { status: 200 });
  }

  if (topup.status === "failed") {
    return NextResponse.json({ status: "failed" }, { status: 200 });
  }

  const mchid = requireEnv("WECHAT_PAY_MCH_ID");
  const canonicalUrl = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderId)}?mchid=${encodeURIComponent(mchid)}`;
  const wechatResponse = await callWechatApi("GET", canonicalUrl);

  if (!wechatResponse.ok) {
    const errorText = await wechatResponse.text().catch(() => "");
    return NextResponse.json(
      { error: "Failed to query WeChat order.", detail: errorText },
      { status: 502 }
    );
  }

  const order = (await wechatResponse.json()) as WechatOrderQueryResponse;
  const tradeState = (order.trade_state ?? "").toUpperCase();

  if (tradeState === "SUCCESS") {
    const updateResult = await db
      .prepare(
        "UPDATE credit_topups SET status = ? WHERE user_id = ? AND stripe_session_id = ? AND status != ?"
      )
      .bind("completed", userId, orderId, "completed")
      .run();
    if ((updateResult.meta?.changes ?? 0) > 0) {
      await db
        .prepare("UPDATE users SET credits = credits + ? WHERE id = ?")
        .bind(topup.amount, userId)
        .run();
    }
    return NextResponse.json({ status: "completed" }, { status: 200 });
  }

  if (tradeState === "CLOSED" || tradeState === "PAYERROR" || tradeState === "REVOKED") {
    await db
      .prepare("UPDATE credit_topups SET status = ? WHERE user_id = ? AND stripe_session_id = ?")
      .bind("failed", userId, orderId)
      .run();
    return NextResponse.json({ status: "failed" }, { status: 200 });
  }

  return NextResponse.json({ status: "pending" }, { status: 200 });
}
