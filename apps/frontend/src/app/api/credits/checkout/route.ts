import { NextRequest, NextResponse } from "next/server";

import { getBaseUrl, getDb, requireEnv } from "../../auth/_helpers";
import { getSessionUserId } from "../_session";

const MONEY_SCALE = 10n ** 10n;
const MIN_AMOUNT_CENTS = 100;
const MAX_AMOUNT_CENTS = 1000000;
const FEE_BPS = 800;

type CheckoutRequest = {
  amount?: number | string;
  currency?: string;
};

type StripeSessionResponse = {
  id: string;
  url?: string | null;
};

const normalizeCurrency = (value?: string) => {
  const upper = value?.toUpperCase() ?? "USD";
  return /^[A-Z]{3}$/.test(upper) ? upper : "USD";
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

  const decimalAmount = body.amount ? parseDecimal(body.amount) : null;
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
  const currency = normalizeCurrency(body.currency);
  const creditUnits = decimalToUnits(decimalAmount);
  const baseUrl = getBaseUrl(request);

  const payload = new URLSearchParams({
    mode: "payment",
    success_url: `${baseUrl}/credits?status=success`,
    cancel_url: `${baseUrl}/credits?status=cancel`,
    client_reference_id: userId,
    "line_items[0][price_data][currency]": currency.toLowerCase(),
    "line_items[0][price_data][product_data][name]": "Credits top-up",
    "line_items[0][price_data][unit_amount]": totalCents.toString(),
    "line_items[0][quantity]": "1",
    "metadata[user_id]": userId,
    "metadata[credit_units]": creditUnits.toString(),
    "metadata[amount_decimal]": decimalAmount,
    "metadata[currency]": currency,
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
      { error: "Failed to create checkout session.", detail: errorText },
      { status: 502 }
    );
  }

  const session = (await stripeResponse.json()) as StripeSessionResponse;
  if (!session?.id || !session.url) {
    return NextResponse.json(
      { error: "Invalid checkout session response." },
      { status: 502 }
    );
  }

  const now = Date.now();
  const db = getDb();
  await db
    .prepare(
      "INSERT INTO credit_topups (id, user_id, amount, currency, method, status, stripe_session_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      crypto.randomUUID(),
      userId,
      Number(creditUnits),
      currency,
      "Stripe",
      "pending",
      session.id,
      now
    )
    .run();

  return NextResponse.json({ url: session.url }, { status: 200 });
}
