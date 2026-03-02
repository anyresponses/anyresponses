"use client";

import { useEffect, useState } from "react";

import SiteHeader from "../components/SiteHeader";
import { formatDecimalString } from "../lib/money";

type ActivityRecord = {
  id: string;
  modelId: string;
  modelName?: string | null;
  keyName?: string | null;
  integrationId?: string | null;
  stream?: number | null;
  status: number;
  responseStatus?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: string | null;
  durationMs?: number | null;
  createdAt: number;
};

type ActivityDetail = {
  id: string;
  apiKeyId: string;
  keyName: string | null;
  integrationId: string | null;
  userId: string;
  provider: string;
  model: string;
  modelName: string | null;
  stream: number;
  status: number;
  responseStatus: string | null;
  finishReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: string | null;
  feedback: number | null;
  feedbackText: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: number;
  durationMs: number;
};

type ActivityResponse = {
  records?: ActivityRecord[];
  hasMore?: boolean;
};

type LoadState = "loading" | "ready" | "unauth";

type KeyOption = {
  id: string;
  name: string;
};

type ModelOption = {
  id: string;
  name: string;
};

type AppliedFilters = {
  keyId: string;
  modelId: string;
  startDate: string;
  endDate: string;
};

const formatCost = (value: string | null | undefined) =>
  formatDecimalString(value ?? null);

const formatDateTime = (timestamp: number) => {
  if (!Number.isFinite(timestamp)) {
    return "-";
  }
  return new Date(timestamp).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDuration = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }
  return `${(value / 1000).toFixed(2)} s`;
};

const formatTokens = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return value.toLocaleString("en-US");
};

const formatStream = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return value ? "Yes" : "No";
};

const formatResponseStatus = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const isSuccessStatus = (status: number) => status >= 200 && status < 300;

const normalizeKeyLabel = (keyName?: string | null) => {
  if (typeof keyName === "string" && keyName.trim().length > 0) {
    return keyName.trim();
  }
  return "Unknown key";
};

const normalizeIntegrationId = (value?: string | null) => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return "anyresponses";
};

const formatDetailValue = (value: unknown) => {
  if (value == null || value === "") {
    return "-";
  }
  return String(value);
};

export default function ActivityPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [keys, setKeys] = useState<KeyOption[]>([]);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [selectedKey, setSelectedKey] = useState("all");
  const [selectedModel, setSelectedModel] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>({
    keyId: "all",
    modelId: "all",
    startDate: "",
    endDate: "",
  });

  const loadActivity = async () => {
    setState("loading");
    setError(null);
    try {
      const {
        keyId,
        modelId,
        startDate: appliedStartDate,
        endDate: appliedEndDate,
      } = appliedFilters;
      const params = new URLSearchParams();
      params.set("limit", pageSize.toString());
      params.set("offset", ((page - 1) * pageSize).toString());
      if (keyId !== "all") {
        params.set("keyId", keyId);
      }
      if (modelId !== "all") {
        params.set("modelId", modelId);
      }
      if (appliedStartDate) {
        params.set("startDate", appliedStartDate);
      }
      if (appliedEndDate) {
        params.set("endDate", appliedEndDate);
      }
      const response = await fetch(`/api/activity?${params.toString()}`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        setState("unauth");
        return;
      }
      if (!response.ok) {
        setState("ready");
        setError("Failed to load activity.");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as ActivityResponse;
      const nextRecords = Array.isArray(data.records)
        ? (data.records as ActivityRecord[])
        : [];
      setRecords(nextRecords);
      setHasMore(Boolean(data.hasMore));
      setState("ready");
    } catch {
      setState("ready");
      setError("Failed to load activity.");
    }
  };

  const loadKeys = async () => {
    try {
      const response = await fetch("/api/activity/keys", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const data = (await response.json().catch(() => ({}))) as {
        keys?: KeyOption[];
      };
      const nextKeys = Array.isArray(data.keys)
        ? (data.keys as KeyOption[])
        : [];
      setKeys(nextKeys);
    } catch {
      // Ignore filter load failures.
    }
  };

  const loadModels = async () => {
    try {
      const response = await fetch(
        "/api/activity/models",
        { cache: "no-store" }
      );
      if (!response.ok) {
        return;
      }
      const data = (await response.json().catch(() => ({}))) as {
        models?: ModelOption[];
      };
      const nextModels = Array.isArray(data.models)
        ? (data.models as ModelOption[])
        : [];
      if (
        selectedModel !== "all" &&
        !nextModels.some((model) => model.id === selectedModel)
      ) {
        nextModels.unshift({ id: selectedModel, name: selectedModel });
      }
      const sortedModels = [...nextModels].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      setModelOptions(sortedModels);
    } catch {
      // Ignore model lookup failures.
    }
  };

  useEffect(() => {
    loadKeys();
    loadModels();
  }, []);

  useEffect(() => {
    loadActivity();
  }, [appliedFilters, page]);

  const hasActiveFilters =
    selectedKey !== "all" ||
    selectedModel !== "all" ||
    startDate !== "" ||
    endDate !== "";

  const handleClearFilters = () => {
    setSelectedKey("all");
    setSelectedModel("all");
    setStartDate("");
    setEndDate("");
  };

  const handleSearch = () => {
    setPage(1);
    setAppliedFilters({
      keyId: selectedKey,
      modelId: selectedModel,
      startDate,
      endDate,
    });
  };

  const handleCloseDetail = () => {
    setActiveRecordId(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  };

  useEffect(() => {
    if (!activeRecordId) {
      return;
    }
    let cancelled = false;
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    const loadDetail = async () => {
      try {
        const response = await fetch(
          `/api/activity/${encodeURIComponent(activeRecordId)}`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          if (!cancelled) {
            setDetailError("Failed to load request details.");
          }
          return;
        }
        const data = (await response.json().catch(() => ({}))) as {
          record?: ActivityDetail;
        };
        if (!cancelled) {
          setDetail(data.record ?? null);
        }
      } catch {
        if (!cancelled) {
          setDetailError("Failed to load request details.");
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    };
    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [activeRecordId]);

  useEffect(() => {
    if (!activeRecordId) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleCloseDetail();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeRecordId]);

  const detailFields = detail
    ? (() => {
        const resolvedIntegrationId = normalizeIntegrationId(
          detail.integrationId
        );
        return [
          { label: "ID", value: detail.id },
          { label: "API key ID", value: detail.apiKeyId },
          { label: "Key name", value: detail.keyName },
          { label: "Integration ID", value: resolvedIntegrationId },
          { label: "User ID", value: detail.userId },
          ...(resolvedIntegrationId !== "anyresponses"
            ? [{ label: "Provider", value: detail.provider }]
            : []),
          { label: "Model ID", value: detail.model },
          { label: "Model name", value: detail.modelName },
          { label: "Stream", value: detail.stream },
          { label: "Status", value: detail.status },
          { label: "Response status", value: detail.responseStatus },
          { label: "Finish reason", value: detail.finishReason },
          { label: "Input tokens", value: detail.inputTokens },
          { label: "Output tokens", value: detail.outputTokens },
          { label: "Total tokens", value: detail.totalTokens },
          { label: "Cost USD", value: detail.costUsd },
          { label: "Feedback", value: detail.feedback },
          { label: "Feedback text", value: detail.feedbackText },
          { label: "Error code", value: detail.errorCode },
          { label: "Error message", value: detail.errorMessage },
          { label: "Created at", value: detail.createdAt },
          { label: "Duration ms", value: detail.durationMs },
        ];
      })()
    : [];

  return (
    <div className="page dashboard activity-page">
      <SiteHeader />

      <main className="dash-main content">
        <section className="dash-header">
          <div className="dash-title">
            <span className="dash-eyebrow">Analytics</span>
            <h1>Activity</h1>
            <p>Review recent requests, latency, and usage spend.</p>
          </div>
        </section>

        {state === "unauth" ? (
          <section className="dash-card keys-empty-card">
            <p>Sign in to view your request activity.</p>
            <a className="btn btn-primary" href="/auth">
              Go to sign in
            </a>
          </section>
        ) : (
          <>
            <section className="dash-card activity-filters-card activity-card">
              <div className="activity-filters-grid">
                <label className="activity-filter-field">
                  <span>Key</span>
                  <select
                    value={selectedKey}
                    onChange={(event) => setSelectedKey(event.target.value)}
                  >
                    <option value="all">All keys</option>
                    {keys.map((key) => (
                      <option key={key.id} value={key.id}>
                        {key.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="activity-filter-field">
                  <span>Model</span>
                  <select
                    value={selectedModel}
                    onChange={(event) => setSelectedModel(event.target.value)}
                  >
                    <option value="all">All models</option>
                    {modelOptions.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="activity-filter-field">
                  <span>From</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                </label>
                <label className="activity-filter-field">
                  <span>To</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                  />
                </label>
              </div>
              <div className="activity-filter-actions">
                <span>Showing {records.length} results</span>
                <div className="activity-filter-buttons">
                  <button
                    className="btn btn-ghost btn-small"
                    type="button"
                    onClick={handleClearFilters}
                    disabled={!hasActiveFilters}
                  >
                    Clear filters
                  </button>
                  <button
                    className="btn btn-primary btn-small activity-search-button"
                    type="button"
                    onClick={handleSearch}
                    disabled={state === "loading"}
                  >
                    Search
                  </button>
                </div>
              </div>
            </section>

            <section className="dash-card dash-table-card activity-table-card activity-card">
              <div className="dash-card-header">
                <div>
                  <h3>Request history</h3>
                  <p>Latest request logs across your API keys.</p>
                </div>
                <span className="dash-pill">{records.length} records</span>
              </div>
              {state === "loading" ? (
                <div className="dash-empty">Loading activity...</div>
              ) : error ? (
                <div className="dash-empty">
                  <span className="dash-error">{error}</span>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={loadActivity}
                  >
                    Retry
                  </button>
                </div>
              ) : records.length === 0 ? (
                <div className="dash-empty">No requests match your filters.</div>
              ) : (
                <>
                  <div className="dash-table-wrapper">
                    <table className="dash-table activity-table">
                      <thead>
                        <tr>
                          <th>Key</th>
                          <th>Time</th>
                          <th>Model</th>
                          <th>Stream</th>
                          <th>Tokens</th>
                          <th>Cost</th>
                          <th>Latency</th>
                          <th>Status</th>
                          <th aria-label="Details" />
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((record) => {
                          const isSuccess = isSuccessStatus(record.status);
                          const responseStatus =
                            formatResponseStatus(record.responseStatus) ??
                            (isSuccess ? "Success" : "Failed");
                          const statusClass = isSuccess
                            ? "dash-status"
                            : "dash-status down";
                          const inputLabel = formatTokens(record.inputTokens);
                          const outputLabel = formatTokens(record.outputTokens);
                          const hasTokens =
                            inputLabel !== "-" || outputLabel !== "-";
                          const integrationId = normalizeIntegrationId(
                            record.integrationId
                          );
                          return (
                            <tr key={record.id}>
                              <td className="activity-mono">
                                {normalizeKeyLabel(record.keyName)}
                              </td>
                              <td>{formatDateTime(record.createdAt)}</td>
                              <td>
                                <div className="activity-model">
                                  <strong>
                                    {record.modelName || record.modelId}
                                  </strong>
                                  <span className="activity-integration">
                                    {integrationId}
                                  </span>
                                </div>
                              </td>
                              <td className="activity-mono">
                                {formatStream(record.stream)}
                              </td>
                              <td className="activity-mono">
                                {hasTokens ? (
                                  <div className="activity-tokens">
                                    <span className="activity-token">
                                      {inputLabel}
                                    </span>
                                    <span className="activity-token-sep">{">"}</span>
                                    <span className="activity-token">
                                      {outputLabel}
                                    </span>
                                  </div>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td className="activity-mono">
                                {record.costUsd != null
                                  ? formatCost(record.costUsd)
                                  : "-"}
                              </td>
                              <td className="activity-mono">
                                {formatDuration(record.durationMs)}
                              </td>
                              <td>
                                <span className={statusClass}>
                                  {responseStatus}
                                </span>
                              </td>
                              <td className="activity-action-cell">
                                <button
                                  className="icon-button activity-detail-button"
                                  type="button"
                                  onClick={() => {
                                    setActiveRecordId(record.id);
                                    setDetail(null);
                                    setDetailError(null);
                                  }}
                                  aria-label="View request details"
                                >
                                  <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path
                                      d="M9 6l6 6-6 6"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                    />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="activity-pagination">
                    <span>Page {page}</span>
                    <div className="activity-pagination-actions">
                      <button
                        className="btn btn-ghost btn-small"
                        type="button"
                        onClick={() => setPage((value) => Math.max(1, value - 1))}
                        disabled={page <= 1}
                      >
                        Prev
                      </button>
                      <button
                        className="btn btn-ghost btn-small"
                        type="button"
                        onClick={() => setPage((value) => value + 1)}
                        disabled={!hasMore}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </main>
      {activeRecordId ? (
        <div
          className="keys-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={handleCloseDetail}
        >
          <div
            className="keys-modal activity-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="keys-modal-header">
              <div>
                <h3>Request details</h3>
              </div>
              <button
                className="icon-button activity-modal-close"
                type="button"
                onClick={handleCloseDetail}
                aria-label="Close details"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6l-12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </button>
            </div>
            {detailLoading ? (
              <div className="dash-empty">Loading details...</div>
            ) : detailError ? (
              <div className="dash-empty">
                <span className="dash-error">{detailError}</span>
              </div>
            ) : detail ? (
              <div className="activity-detail-grid">
                {detailFields.map((field) => (
                  <div className="activity-detail-row" key={field.label}>
                    <span className="activity-detail-label">{field.label}</span>
                    <span className="activity-detail-value">
                      {formatDetailValue(field.value)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dash-empty">No details found.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
