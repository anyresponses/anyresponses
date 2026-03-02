"use client";

import { useEffect, useState } from "react";

import SiteHeader from "../components/SiteHeader";
import { formatCurrencyString } from "../lib/money";

type TopUpRecord = {
  id: string;
  amount: number | string;
  currency?: string;
  method?: string;
  status?: string;
  createdAt: number;
};

type CreditsResponse = {
  credits?: string | number;
  topups?: TopUpRecord[];
  hasMore?: boolean;
};

type LoadState = "loading" | "ready" | "unauth";

const normalizeCurrency = (currency?: string) => {
  const upper = currency?.toUpperCase();
  if (upper && /^[A-Z]{3}$/.test(upper)) {
    return upper;
  }
  return "USD";
};

const formatCurrency = (value: string | number | null | undefined, currency?: string) => {
  const normalized = normalizeCurrency(currency);
  if (typeof value === "number" && Number.isFinite(value)) {
    return formatCurrencyString(value.toString(), normalized);
  }
  if (typeof value === "string") {
    return formatCurrencyString(value, normalized);
  }
  return formatCurrencyString(null, normalized);
};

const formatDate = (timestamp: number) => {
  if (!Number.isFinite(timestamp)) {
    return "-";
  }
  return new Date(timestamp).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const getTopupStatus = (status?: string | null) => {
  const normalized = status?.toLowerCase() ?? "completed";
  if (normalized === "pending") {
    return { label: "Pending", className: "dash-status warn" };
  }
  if (normalized === "failed") {
    return { label: "Failed", className: "dash-status down" };
  }
  return { label: "Completed", className: "dash-status" };
};

export default function CreditsPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [balance, setBalance] = useState("0");
  const [topups, setTopups] = useState<TopUpRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState("100");
  const [rechargeError, setRechargeError] = useState<string | null>(null);
  const [rechargeLoading, setRechargeLoading] = useState(false);
  const feeRate = 0.08;
  const minAmount = 1;
  const pageSize = 10;
  const [page, setPage] = useState(0);

  const loadCredits = async (nextPage = page) => {
    setState("loading");
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (nextPage * pageSize).toString(),
      });
      const response = await fetch(`/api/credits?${params.toString()}`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        setState("unauth");
        return;
      }
      if (!response.ok) {
        setState("ready");
        setError("Failed to load credits.");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as CreditsResponse;
      const nextBalance =
        typeof data.credits === "string" && data.credits.trim().length > 0
          ? data.credits
        : typeof data.credits === "number" && Number.isFinite(data.credits)
            ? data.credits.toString()
            : "0";
      const nextTopups = Array.isArray(data.topups)
        ? (data.topups as TopUpRecord[])
        : [];
      setBalance(nextBalance);
      setTopups(nextTopups);
      setHasMore(Boolean(data.hasMore));
      setPage(nextPage);
      setState("ready");
    } catch {
      setState("ready");
      setError("Failed to load credits.");
    }
  };

  useEffect(() => {
    loadCredits();
  }, []);

  const startCheckout = async (amount: string) => {
    const parsedAmount = parseDecimalAmount(amount);
    if (!amount || parsedAmount === null) {
      setRechargeError("Please enter a valid amount.");
      return;
    }
    if (parsedAmount < minAmount * 100) {
      setRechargeError(`Minimum recharge is ${formatCurrency(minAmount.toString())}.`);
      return;
    }
    setRechargeLoading(true);
    setRechargeError(null);
    try {
      const response = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency: "USD" }),
      });
      if (response.status === 401) {
        window.location.href = "/auth";
        return;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setRechargeError(payload.error ?? "Failed to start checkout.");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setRechargeError("Stripe did not return a checkout URL.");
    } catch {
      setRechargeError("Failed to start checkout.");
    } finally {
      setRechargeLoading(false);
    }
  };

  const parseDecimalAmount = (value: string) => {
    const trimmed = value.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      return null;
    }
    const [whole, fraction = ""] = trimmed.split(".");
    const fractionPadded = fraction.padEnd(2, "0").slice(0, 2);
    return Number(whole) * 100 + Number(fractionPadded);
  };

  const formatCents = (cents: number) => {
    const absolute = Math.abs(cents);
    const whole = Math.floor(absolute / 100);
    const fraction = String(absolute % 100).padStart(2, "0");
    return formatCurrency(`${whole}.${fraction}`);
  };

  const amountCents = parseDecimalAmount(rechargeAmount) ?? 0;
  const feeCents = Math.round(amountCents * feeRate);
  const totalCents = amountCents + feeCents;

  return (
    <div className="page dashboard credits-page">
      <SiteHeader />

      <main className="dash-main content">
        <section className="dash-header">
          <div className="dash-title">
            <span className="dash-eyebrow">Billing</span>
            <h1>Credits</h1>
            <p>Monitor balance, recharge, and recent credit activity.</p>
          </div>
        </section>

        {state === "unauth" ? (
          <section className="dash-card keys-empty-card">
            <p>Sign in to view your credits balance.</p>
            <a className="btn btn-primary" href="/auth">
              Go to sign in
            </a>
          </section>
        ) : (
          <>
            <section className="dash-kpis">
              <div className="dash-card credits-card credits-balance-card">
                <span className="dash-kpi-label">Available balance</span>
                <div className="dash-kpi-value">{formatCurrency(balance)}</div>
                <span className="dash-kpi-note">Updated in real time</span>
                <button
                  className="btn btn-primary credits-recharge-button"
                  type="button"
                  onClick={() => setRechargeOpen(true)}
                >
                  Recharge
                </button>
              </div>
            </section>

            <section className="dash-card dash-table-card credits-table-card credits-card">
              <div className="dash-card-header">
                <div>
                  <h3>Recharge history</h3>
                  <p>Recent top-ups and balance adjustments.</p>
                </div>
                <span className="dash-pill">{topups.length} records</span>
              </div>
              {state === "loading" ? (
                <div className="dash-empty">Loading credits...</div>
              ) : error ? (
                <div className="dash-empty">
                  <span className="dash-error">{error}</span>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => loadCredits()}
                  >
                    Retry
                  </button>
                </div>
              ) : topups.length === 0 ? (
                <div className="dash-empty">No recharge records yet.</div>
              ) : (
                <div className="dash-table-wrapper">
                  <table className="dash-table credits-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Method</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topups.map((record, index) => {
                        const status = getTopupStatus(record.status);
                        return (
                          <tr key={record.id ?? `${record.createdAt}-${index}`}>
                            <td>{formatDate(record.createdAt)}</td>
                            <td className="activity-mono">
                              {formatCurrency(
                                record.amount,
                                record.currency
                              )}
                            </td>
                            <td>{record.method ?? "-"}</td>
                            <td>
                              <span className={status.className}>
                                {status.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {page > 0 || hasMore ? (
                <div className="activity-pagination">
                  <span>Page {page + 1}</span>
                  <div className="activity-pagination-actions">
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => loadCredits(Math.max(0, page - 1))}
                      disabled={page === 0 || state === "loading"}
                    >
                      Previous
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => loadCredits(page + 1)}
                      disabled={state === "loading" || !hasMore}
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          </>
        )}
      </main>
      {rechargeOpen ? (
        <div className="credits-recharge-overlay" role="dialog" aria-modal="true">
          <div className="credits-recharge-modal">
            <div className="credits-recharge-header">
              <div>
                <h3>Recharge credits</h3>
                <p>Top up your balance securely with Stripe.</p>
              </div>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setRechargeOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="credits-recharge-body">
              <div className="field">
                <label htmlFor="credits-recharge-amount">
                  Recharge amount (USD)
                </label>
                <input
                  id="credits-recharge-amount"
                  inputMode="decimal"
                  value={rechargeAmount}
                  onChange={(event) => setRechargeAmount(event.target.value)}
                  placeholder="100"
                />
                <span className="credits-recharge-note">
                  Minimum {formatCurrency(minAmount.toString())}.
                </span>
              </div>
              <div className="credits-recharge-summary">
                <div>
                  <span>Service fee (8%)</span>
                  <strong>{formatCents(feeCents)}</strong>
                </div>
                <div>
                  <span>Total charge</span>
                  <strong>{formatCents(totalCents)}</strong>
                </div>
              </div>
              {rechargeError ? <span className="dash-error">{rechargeError}</span> : null}
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => startCheckout(rechargeAmount)}
                disabled={rechargeLoading}
              >
                {rechargeLoading ? "Redirecting..." : "Continue to Stripe"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
