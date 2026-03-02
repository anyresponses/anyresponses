"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import SiteHeader from "../components/SiteHeader";

type ApiKey = {
  id: string;
  name: string;
  apiKey: string;
  createdAt: number;
};

type LoadState = "loading" | "ready" | "unauth";

export default function KeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [visibleKeyId, setVisibleKeyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const canCreate = useMemo(() => name.trim().length > 0, [name]);

  const loadKeys = async () => {
    setState("loading");
    setError(null);
    try {
      const response = await fetch("/api/keys", { cache: "no-store" });
      if (response.status === 401) {
        setState("unauth");
        return;
      }
      if (!response.ok) {
        setError("Failed to load keys.");
        setState("ready");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as {
        keys?: ApiKey[];
      };
      setKeys(Array.isArray(data.keys) ? data.keys : []);
      setState("ready");
    } catch {
      setError("Failed to load keys.");
      setState("ready");
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate || creating) {
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (response.status === 401) {
        setState("unauth");
        return;
      }
      if (response.status === 409) {
        setCreateError("Name already exists.");
        return;
      }
      if (!response.ok) {
        setCreateError("Failed to create key.");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as {
        key?: ApiKey;
      };
      if (data.key) {
        setKeys((current) => [data.key as ApiKey, ...current]);
        setName("");
        setShowCreate(false);
      }
    } catch {
      setCreateError("Failed to create key.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingId) {
      return;
    }
    setDeletingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/keys/${id}`, { method: "DELETE" });
      if (response.status === 401) {
        setState("unauth");
        return;
      }
      if (!response.ok) {
        setError("Failed to delete key.");
        return;
      }
      setKeys((current) => current.filter((key) => key.id !== id));
    } catch {
      setError("Failed to delete key.");
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

  const handleCopy = async (key: ApiKey) => {
    try {
      await navigator.clipboard.writeText(key.apiKey);
      setCopiedId(key.id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      setError("Copy failed. Please try again.");
    }
  };

  const maskKey = (apiKey: string) => {
    if (apiKey.length <= 12) {
      return `${apiKey.slice(0, 3)}•••${apiKey.slice(-2)}`;
    }
    return `${apiKey.slice(0, 6)}••••••••${apiKey.slice(-4)}`;
  };

  return (
    <div className="page dashboard keys-page">
      <SiteHeader />

      <main className="dash-main content">
        <section className="dash-header">
          <div className="dash-title">
            <h1>Manage your keys</h1>
            <p>Create, copy, and revoke API keys used by your applications.</p>
            {state === "unauth" ? null : (
              <div className="keys-header-row">
                <button
                  className="btn btn-primary keys-modal-button"
                  type="button"
                  onClick={() => setShowCreate(true)}
                >
                  + API Key
                </button>
              </div>
            )}
          </div>
        </section>

        {state === "unauth" ? (
          <section className="dash-card keys-empty-card">
            <p>Sign in to view your API keys.</p>
            <a className="btn btn-primary" href="/auth">
              Go to sign in
            </a>
          </section>
        ) : (
          <>
            <section className="dash-card dash-table-card">
              <div className="dash-card-header">
                <div>
                  <h3>Your keys</h3>
                  <p>Keep these private. Delete keys you no longer use.</p>
                </div>
              </div>
              {state === "loading" ? (
                <div className="keys-empty">Loading keys...</div>
              ) : keys.length === 0 ? (
                <div className="keys-empty">
                  No keys yet. Create your first key above.
                </div>
              ) : (
                <div className="dash-table-wrapper">
                  <table className="dash-table keys-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Key</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((key) => (
                        <tr key={key.id}>
                          <td>{key.name}</td>
                          <td className="keys-key">
                            <div className="keys-key-cell">
                              <span>
                                {visibleKeyId === key.id
                                  ? key.apiKey
                                  : maskKey(key.apiKey)}
                              </span>
                              <div className="keys-inline-actions">
                                <button
                                  className="btn btn-ghost btn-small icon-button"
                                  type="button"
                                  onClick={() =>
                                    setVisibleKeyId((current) =>
                                      current === key.id ? null : key.id,
                                    )
                                  }
                                  aria-label={
                                    visibleKeyId === key.id
                                      ? "Hide key"
                                      : "Show key"
                                  }
                                >
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
                                </button>
                                <button
                                  className="btn btn-ghost btn-small icon-button"
                                  type="button"
                                  onClick={() => handleCopy(key)}
                                  aria-label="Copy key"
                                >
                                  {copiedId === key.id ? (
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
                                        d="M8 8h10v12H8z"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinejoin="round"
                                      />
                                      <path
                                        d="M6 16H4V4h10v2"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  )}
                                </button>
                              </div>
                            </div>
                          </td>
                          <td>
                            {new Date(key.createdAt).toLocaleDateString()}
                          </td>
                          <td>
                            <div className="keys-actions">
                              <button
                                className="btn btn-ghost btn-small icon-button"
                                type="button"
                                onClick={() => setConfirmDeleteId(key.id)}
                                disabled={deletingId === key.id}
                                aria-label="Delete key"
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path
                                    d="M4 7h16"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                  />
                                  <path
                                    d="M9 7V5h6v2"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                  />
                                  <path
                                    d="M7 7l1 12h8l1-12"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {error ? <div className="keys-error">{error}</div> : null}
            </section>
          </>
        )}
      </main>

      {showCreate ? (
        <div className="keys-modal-backdrop" role="dialog" aria-modal="true">
          <div className="keys-modal">
            <div className="keys-modal-header">
              <div>
                <h3>Create API key</h3>
                <p>Name the key so you remember where it is used.</p>
              </div>
              <button
                className="btn btn-ghost btn-small icon-button"
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setCreateError(null);
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
            <form className="keys-form keys-modal-form" onSubmit={handleCreate}>
              <div className="keys-form-field">
                <label className="models-search-field keys-field">
                  <span className="models-search-label">Key name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Production backend"
                  />
                </label>
                {createError ? (
                  <div className="keys-error keys-modal-error">{createError}</div>
                ) : null}
              </div>
              <div className="keys-modal-actions">
                <button
                  className="btn btn-ghost keys-modal-button"
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setCreateError(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary keys-modal-button"
                  type="submit"
                  disabled={!canCreate || creating}
                >
                  {creating ? "Creating..." : "Create key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {confirmDeleteId ? (
        <div className="keys-modal-backdrop" role="dialog" aria-modal="true">
          <div className="keys-modal">
            <div className="keys-modal-header">
              <div>
                <h3>Delete API key</h3>
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
                {deletingId === confirmDeleteId ? "Deleting..." : "Delete key"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
