"use client";

import { useEffect, useState, type FormEvent } from "react";

import SiteHeader from "../components/SiteHeader";
import providersData from "../../data/providers.json";
import { highlightCode } from "../lib/highlight";

type Integration = {
  entryId: string;
  providerId: string;
  integrationId: string;
  options: Record<string, string>;
  alwaysUse: boolean;
  createdAt: number;
  updatedAt?: number;
};

type LoadState = "loading" | "ready" | "unauth";

const providers = providersData.providers;
const providerMap = new Map(
  providers.map((provider) => [provider.id, provider]),
);

const formatDate = (timestamp: number) => {
  if (!Number.isFinite(timestamp)) {
    return "-";
  }
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatOptionLabel = (name: string) => {
  const spaced = name.replace(/([A-Z])/g, " $1").replace(/_/g, " ");
  return spaced.replace(/^./, (char) => char.toUpperCase());
};

const isSensitiveField = (name: string) => /key|token|secret/i.test(name);

const isLongField = (name: string) => /privatekey/i.test(name);

const byokExample = `const { AnyResponses } = require("anyresponses");

const client = new AnyResponses({
  apiKey: process.env.ANYRESPONSES_API_KEY
});

const response = await client.responses.create({
  model: "openai/gpt-4o-mini",
  input: [{ type: "message", role: "user", content: "Hello" }]
});`;

export default function IntegrationsPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [integrationId, setIntegrationId] = useState(providers[0]?.id ?? "");
  const [optionValues, setOptionValues] = useState<Record<string, string>>({});
  const [alwaysUse, setAlwaysUse] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editEntryId, setEditEntryId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fieldVisibility, setFieldVisibility] = useState<
    Record<string, boolean>
  >({});

  const currentProvider = providerMap.get(providerId);
  const requiredOptions = currentProvider?.required_options ?? [];
  const optionalOptions = currentProvider?.optional_options ?? [];
  const hasRequiredValues = requiredOptions.every(
    (option) => (optionValues[option] ?? "").trim().length > 0,
  );
  const canSubmit =
    providerId.trim().length > 0 &&
    integrationId.trim().length > 0 &&
    hasRequiredValues;

  const loadIntegrations = async () => {
    setState("loading");
    setError(null);
    try {
      const response = await fetch("/api/integrations", { cache: "no-store" });
      if (response.status === 401) {
        setState("unauth");
        return;
      }
      if (!response.ok) {
        setError("Failed to load integrations.");
        setState("ready");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as {
        integrations?: Integration[];
      };
      setIntegrations(
        Array.isArray(data.integrations) ? data.integrations : [],
      );
      setState("ready");
    } catch {
      setError("Failed to load integrations.");
      setState("ready");
    }
  };

  useEffect(() => {
    loadIntegrations();
  }, []);

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalError(null);
    if (!canSubmit || saving) {
      setModalError("Fill out the required provider fields.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        providerId,
        integrationId: integrationId.trim(),
        options: optionValues,
        alwaysUse,
      };
      const response = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        setState("unauth");
        setShowCreate(false);
        setEditEntryId(null);
        return;
      }
      if (response.status === 409) {
        setModalError("Integration ID already exists.");
        return;
      }
      if (!response.ok) {
        setModalError("Failed to add integration.");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as {
        integration?: Integration;
      };
      if (data.integration) {
        setIntegrations((current) => [
          data.integration as Integration,
          ...current,
        ]);
        setIntegrationId(providerId);
        setOptionValues({});
        setAlwaysUse(false);
        setShowCreate(false);
        setEditEntryId(null);
      }
    } catch {
      setModalError("Failed to add integration.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingId) {
      return;
    }
    setDeletingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/integrations/${id}`, {
        method: "DELETE",
      });
      if (response.status === 401) {
        setState("unauth");
        return;
      }
      if (!response.ok) {
        setError("Failed to delete integration.");
        return;
      }
      setIntegrations((current) =>
        current.filter((item) => item.entryId !== id),
      );
    } catch {
      setError("Failed to delete integration.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) {
      return;
    }
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    await handleDelete(id);
  };

  const handleProviderChange = (nextProviderId: string) => {
    setProviderId(nextProviderId);
    setOptionValues({});
    setModalError(null);
    setFieldVisibility({});
    setIntegrationId((current) => {
      const trimmed = current.trim();
      if (trimmed === "" || trimmed === providerId) {
        return nextProviderId;
      }
      return current;
    });
  };

  const updateOptionValue = (name: string, value: string) => {
    setOptionValues((current) => ({ ...current, [name]: value }));
    if (modalError) {
      setModalError(null);
    }
  };

  const renderOptionField = (name: string, required: boolean) => {
    const value = optionValues[name] ?? "";
    const labelText = formatOptionLabel(name);
    const isSensitive = isSensitiveField(name);
    const isLong = isLongField(name);
    const isVisible = fieldVisibility[name] ?? false;

    return (
      <label className="field" key={name}>
        <span className="field-label-row">
          <span>{labelText}</span>
          <span className={required ? "field-required" : "field-optional"}>
            {required ? "Required" : "Optional"}
          </span>
        </span>
        <div className="field-input-row">
          {isLong ? (
            <textarea
              className={isSensitive && !isVisible ? "field-secret" : undefined}
              value={value}
              onChange={(event) => updateOptionValue(name, event.target.value)}
              placeholder={required ? `${labelText} value` : "Optional"}
              rows={4}
            />
          ) : (
            <input
              value={value}
              onChange={(event) => updateOptionValue(name, event.target.value)}
              placeholder={required ? `${labelText} value` : "Optional"}
              type={isSensitive && !isVisible ? "password" : "text"}
              autoComplete="off"
            />
          )}
          {isSensitive ? (
            <button
              className="btn btn-ghost btn-small icon-button field-toggle"
              type="button"
              onClick={() =>
                setFieldVisibility((current) => ({
                  ...current,
                  [name]: !isVisible,
                }))
              }
              aria-label={isVisible ? "Hide value" : "Show value"}
            >
              {isVisible ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M3 12s3.8-6 9-6 9 6 9 6-3.8 6-9 6-9-6-9-6z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M4 4l16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="3.2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                </svg>
              )}
            </button>
          ) : null}
        </div>
      </label>
    );
  };

  const openCreateModal = () => {
    setShowCreate(true);
    setEditEntryId(null);
    setModalError(null);
    setFieldVisibility({});
    setOptionValues({});
    setAlwaysUse(false);
    setIntegrationId(providerId);
  };

  const openEditModal = (integration: Integration) => {
    setShowCreate(false);
    setEditEntryId(integration.entryId);
    setModalError(null);
    setFieldVisibility({});
    setProviderId(integration.providerId);
    setIntegrationId(integration.integrationId);
    setOptionValues(integration.options ?? {});
    setAlwaysUse(integration.alwaysUse ?? false);
  };

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalError(null);
    if (!canSubmit || saving) {
      setModalError("Fill out the required provider fields.");
      return;
    }
    if (!editEntryId) {
      return;
    }
    setSaving(true);
    try {
      const payload = {
        providerId,
        integrationId: integrationId.trim(),
        options: optionValues,
        alwaysUse,
      };
      const response = await fetch(`/api/integrations/${editEntryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        setState("unauth");
        setEditEntryId(null);
        setShowCreate(false);
        return;
      }
      if (response.status === 409) {
        setModalError("Integration ID already exists.");
        return;
      }
      if (!response.ok) {
        setModalError("Failed to update integration.");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as {
        integration?: Integration;
      };
      if (data.integration) {
        setIntegrations((current) =>
          current.map((item) =>
            item.entryId === editEntryId ? data.integration! : item,
          ),
        );
        setEditEntryId(null);
        setShowCreate(false);
      }
    } catch {
      setModalError("Failed to update integration.");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyId = async (entryId: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(entryId);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      setError("Copy failed. Please try again.");
    }
  };

  return (
    <div className="page dashboard integrations-page">
      <SiteHeader />

      <main className="dash-main content">
        <section className="dash-header">
          <div className="dash-title">
            <h1>Integrations (BYOK)</h1>
            <p>
              Connect your own provider keys to route traffic. Add multiple keys
              per provider and track them with IDs.
            </p>
          </div>
        </section>

        {state === "unauth" ? (
          <section className="dash-card keys-empty-card">
            <p>Sign in to manage BYOK integrations.</p>
            <a className="btn btn-primary" href="/auth">
              Go to sign in
            </a>
          </section>
        ) : (
          <>
            <section className="integrations-layout">
              <div className="integrations-actions-row">
                <button
                  className="btn btn-primary integrations-add-button"
                  type="button"
                  onClick={openCreateModal}
                >
                  + Add provider key
                </button>
              </div>

              <div className="dash-grid integrations-grid">
                <div className="dash-card integrations-info-card">
                  <h3>How BYOK works</h3>
                  <p className="integrations-note">
                    Keys are encrypted with AES and stored in D1. Edit entries
                    to view decrypted values.
                  </p>
                  <ul className="bullet-list">
                    <li>Multiple keys per provider are supported.</li>
                    <li>Use IDs to track projects or environments.</li>
                    <li>
                      Provider defaults are still available in the catalog.
                    </li>
                  </ul>
                  <a className="section-link" href="/providers">
                    Browse providers
                  </a>
                </div>

                <div className="dash-card integrations-code-card">
                  <div className="dash-card-header">
                    <div>
                      <h3>BYOK example</h3>
                      <p>
                        Save an integration and reference it in your workflow.
                      </p>
                    </div>
                  </div>
                  <pre
                    className="code-block hero-code language-javascript"
                    tabIndex={0}
                  >
                    <code
                      className="language-javascript"
                      dangerouslySetInnerHTML={{
                        __html: highlightCode(byokExample),
                      }}
                    />
                  </pre>
                </div>
              </div>
            </section>

            <section className="dash-card dash-table-card integrations-table-card">
              <div className="dash-card-header">
                <div>
                  <h3>Your integrations</h3>
                  <p>Manage connected providers and keep keys organized.</p>
                </div>
                <span className="dash-pill">{integrations.length} keys</span>
              </div>
              {state === "loading" ? (
                <div className="keys-empty">Loading integrations...</div>
              ) : integrations.length === 0 ? (
                <div className="keys-empty">
                  No integrations yet. Add your first provider key above.
                </div>
              ) : (
                <div className="dash-table-wrapper">
                  <table className="dash-table integrations-table">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>ID</th>
                        <th>Added</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {integrations.map((integration) => {
                        const provider = providerMap.get(
                          integration.providerId,
                        );
                        return (
                          <tr key={integration.entryId}>
                            <td>
                              <div className="integrations-provider">
                                <span className="integrations-provider-name">
                                  {provider?.name ?? integration.providerId}
                                </span>
                                <span className="integrations-provider-id">
                                  {integration.providerId}
                                </span>
                              </div>
                            </td>
                            <td>
                              <div className="integrations-id-row">
                                <span>{integration.integrationId}</span>
                                <button
                                  className="btn btn-ghost btn-small icon-button"
                                  type="button"
                                  onClick={() =>
                                    handleCopyId(
                                      integration.entryId,
                                      integration.integrationId,
                                    )
                                  }
                                  aria-label="Copy integration ID"
                                >
                                  {copiedId === integration.entryId ? (
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                      <path
                                        d="M5 12l4 4 10-10"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="1.8"
                                      />
                                    </svg>
                                  ) : (
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                      <path
                                        d="M9 9h10v10H9z"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="1.8"
                                      />
                                      <path
                                        d="M5 15V5h10"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="1.8"
                                      />
                                    </svg>
                                  )}
                                </button>
                              </div>
                            </td>
                            <td>{formatDate(integration.createdAt)}</td>
                            <td>
                              <div className="integrations-actions">
                                <button
                                  className="btn btn-ghost btn-small icon-button"
                                  type="button"
                                  onClick={() => openEditModal(integration)}
                                  aria-label="Edit"
                                >
                                  <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path
                                      d="M14.5 6.5l3 3M5 19l4.5-1 9-9-3-3-9 9L5 19z"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="1.8"
                                    />
                                  </svg>
                                </button>
                                <button
                                  className="btn btn-ghost btn-small icon-button"
                                  type="button"
                                  onClick={() =>
                                    setConfirmDeleteId(integration.entryId)
                                  }
                                  aria-label="Delete"
                                  disabled={deletingId === integration.entryId}
                                >
                                  <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path
                                      d="M4 7h16M9 7V5h6v2M9 10v7M15 10v7M7 7l1 12h8l1-12"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="1.8"
                                    />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {error ? <div className="keys-error">{error}</div> : null}
            </section>
          </>
        )}
      </main>

      {showCreate || editEntryId ? (
        <div className="keys-modal-backdrop" role="dialog" aria-modal="true">
          <div className="keys-modal integrations-modal">
            <div className="keys-modal-header">
              <div>
                <h3>{editEntryId ? "Edit integration" : "Add provider key"}</h3>
                <p>Fill in required fields and optionally add extras.</p>
              </div>
              <button
                className="btn btn-ghost btn-small icon-button"
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setEditEntryId(null);
                  setModalError(null);
                  setFieldVisibility({});
                }}
                aria-label="Close"
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
            <form
              className="integrations-form"
              onSubmit={editEntryId ? handleUpdate : handleAdd}
            >
              <label className="field">
                <span className="field-label-row">
                  <span>Provider</span>
                  <span className="field-required">Required</span>
                </span>
                <select
                  value={providerId}
                  onChange={(event) => handleProviderChange(event.target.value)}
                >
                  {providers.map((provider) => (
                    <option value={provider.id} key={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label-row">
                  <span>Integration ID</span>
                  <span className="field-required">Required</span>
                </span>
                <input
                  value={integrationId}
                  onChange={(event) => {
                    setIntegrationId(event.target.value);
                    if (modalError) {
                      setModalError(null);
                    }
                  }}
                  placeholder="e.g. openai-prod"
                  type="text"
                />
              </label>
              {requiredOptions.map((option) => renderOptionField(option, true))}
              {optionalOptions.map((option) =>
                renderOptionField(option, false),
              )}
              <label className="toggle-row">
                <span className="toggle-text">
                  <span className="toggle-title">
                    Always use for this provider
                  </span>
                  <span className="toggle-hint">
                    Disable smart-routing fallback when BYOK fails.
                  </span>
                </span>
                <span className="toggle-control">
                  <input
                    className="toggle-input"
                    type="checkbox"
                    checked={alwaysUse}
                    onChange={(event) => setAlwaysUse(event.target.checked)}
                  />
                  <span className="toggle-slider" aria-hidden="true" />
                </span>
              </label>
              {modalError ? (
                <div className="keys-error keys-modal-error">{modalError}</div>
              ) : null}
              <div className="keys-modal-actions">
                <button
                  className="btn btn-ghost keys-modal-button"
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setEditEntryId(null);
                    setModalError(null);
                    setFieldVisibility({});
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary keys-modal-button"
                  type="submit"
                  disabled={!canSubmit || saving}
                >
                  {saving
                    ? "Saving..."
                    : editEntryId
                      ? "Save changes"
                      : "Add integration"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {confirmDeleteId ? (
        <div className="keys-modal-backdrop" role="dialog" aria-modal="true">
          <div className="keys-modal integrations-modal">
            <div className="keys-modal-header">
              <div>
                <h3>Delete integration</h3>
                <p>This action cannot be undone.</p>
              </div>
              <button
                className="btn btn-ghost btn-small icon-button"
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                aria-label="Close"
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
            <div className="keys-modal-actions">
              <button
                className="btn btn-ghost keys-modal-button"
                type="button"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary keys-modal-button"
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingId === confirmDeleteId}
              >
                {deletingId === confirmDeleteId ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
