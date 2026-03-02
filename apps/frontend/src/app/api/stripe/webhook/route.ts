import { NextRequest, NextResponse } from "next/server";

import { getDb, requireEnv } from "../../auth/_helpers";

const encoder = new TextEncoder();
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;
const MONEY_SCALE = 10n ** 10n;

type StripeEvent = {
  type: string;
  data?: {
    object?: {
      id?: string;
      amount_total?: number | null;
      currency?: string | null;
      payment_intent?: string | null;
      metadata?: Record<string, string | undefined> | null;
      client_reference_id?: string | null;
    };
  };
};

const parseStripeSignature = (header: string | null) => {
  if (!header) {
    return null;
  }
  const parts = header.split(",");
  const timestamp = parts
    .find((part) => part.startsWith("t="))
    ?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .filter(Boolean);
  if (!timestamp || signatures.length === 0) {
    return null;
  }
  return { timestamp, signatures };
};

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
};

const verifyStripeSignature = async (
  payload: string,
  signatureHeader: string | null,
  secret: string
) => {
  const parsed = parseStripeSignature(signatureHeader);
  if (!parsed) {
    return false;
  }
  const timestamp = Number(parsed.timestamp);
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  const now = Date.now();
  if (Math.abs(now - timestamp * 1000) > SIGNATURE_TOLERANCE_MS) {
    return false;
  }
  const signedPayload = `${parsed.timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signedPayload)
  );
  const expected = toHex(new Uint8Array(signature));
  return parsed.signatures.some((candidate) => timingSafeEqual(candidate, expected));
};

const decimalToUnits = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  const fractionPadded = fraction.padEnd(10, "0").slice(0, 10);
  return BigInt(whole) * MONEY_SCALE + BigInt(fractionPadded);
};

const centsToDecimal = (amountCents: number) => {
  const whole = Math.floor(amountCents / 100);
  const fraction = Math.abs(amountCents % 100)
    .toString()
    .padStart(2, "0");
  return `${whole}.${fraction}`;
};

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signatureHeader = request.headers.get("stripe-signature");
  const secret = requireEnv("STRIPE_WEBHOOK_SECRET");

  const isValid = await verifyStripeSignature(payload, signatureHeader, secret);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let event: StripeEvent | null = null;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    event = null;
  }

  if (!event?.type) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const session = event.data?.object;
  const sessionId = session?.id;
  if (!sessionId) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const db = getDb();

  if (
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    await db
      .prepare("UPDATE credit_topups SET status = ? WHERE stripe_session_id = ?")
      .bind("failed", sessionId)
      .run();
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const metadata = session?.metadata ?? {};
  const userId = metadata.user_id || session?.client_reference_id || null;
  if (!userId) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const amountCents = session?.amount_total ?? 0;
  const amountDecimal =
    typeof amountCents === "number" && Number.isFinite(amountCents)
      ? centsToDecimal(amountCents)
      : metadata.amount_decimal || "0";
  const creditUnitsValue =
    metadata.credit_units && /^[0-9]+$/.test(metadata.credit_units)
      ? BigInt(metadata.credit_units)
      : decimalToUnits(amountDecimal);
  const creditUnits =
    creditUnitsValue <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(creditUnitsValue)
      : creditUnitsValue.toString();

  const existing = await db
    .prepare(
      "SELECT id, status FROM credit_topups WHERE stripe_session_id = ? LIMIT 1"
    )
    .bind(sessionId)
    .first<{ id: string; status: string }>();

  if (existing?.status === "completed") {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const now = Date.now();
  const statements: D1PreparedStatement[] = [];

  if (existing?.id) {
    statements.push(
      db
        .prepare(
          "UPDATE credit_topups SET status = ?, stripe_payment_intent = ? WHERE stripe_session_id = ?"
        )
        .bind("completed", session?.payment_intent ?? null, sessionId)
    );
  } else {
    statements.push(
      db
        .prepare(
          "INSERT INTO credit_topups (id, user_id, amount, currency, method, status, stripe_session_id, stripe_payment_intent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          crypto.randomUUID(),
          userId,
          creditUnits,
          (session?.currency ?? "usd").toUpperCase(),
          "Stripe",
          "completed",
          sessionId,
          session?.payment_intent ?? null,
          now
        )
    );
  }

  statements.push(
    db
      .prepare("UPDATE users SET credits = credits + ? WHERE id = ?")
      .bind(creditUnits, userId)
  );

  await db.batch(statements);

  return NextResponse.json({ received: true }, { status: 200 });
}
