"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type ModelEntry = {
  id: string;
  name: string;
  summary: string;
  author: string;
  contextLength: number | null;
  promptPrice: number | null;
  completionPrice: number | null;
};

type AuthorOption = {
  id: string;
  label: string;
};

type LoadState = "loading" | "ready" | "error";

type ModelsResponse = {
  models?: ModelEntry[];
};

const getAuthorLabel = (author: string) =>
  author && author.trim().length > 0 ? author : "Unknown";

const formatContextLength = (value: number | null) => {
  if (!value || !Number.isFinite(value)) {
    return null;
  }
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    return `${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
  }
  return value.toString();
};

const formatPricePerMillion = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  const perMillion = value * 1_000_000;
  return perMillion.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

export default function ModelsExplorer() {
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);

  const loadModels = async () => {
    setState("loading");
    setError(null);
    try {
      const response = await fetch("/api/models", { cache: "no-store" });
      if (!response.ok) {
        setState("error");
        setError("Failed to load models.");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as ModelsResponse;
      setModels(Array.isArray(data.models) ? data.models : []);
      setState("ready");
    } catch {
      setState("error");
      setError("Failed to load models.");
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const authorOptions = useMemo<AuthorOption[]>(() => {
    const map = new Map<string, string>();
    models.forEach((model) => {
      if (!model.author) {
        return;
      }
      map.set(model.author, getAuthorLabel(model.author));
    });
    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [models]);

  const filteredModels = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return models.filter((model) => {
      if (
        selectedAuthors.length > 0 &&
        !selectedAuthors.includes(model.author)
      ) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      const authorLabel = getAuthorLabel(model.author);
      const haystack = `${model.id} ${model.name} ${model.summary} ${authorLabel}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [models, search, selectedAuthors]);

  const hasActiveFilters =
    selectedAuthors.length > 0 || search.trim().length > 0;

  const handleAuthorToggle = (authorId: string) => {
    setSelectedAuthors((current) =>
      current.includes(authorId)
        ? current.filter((value) => value !== authorId)
        : [...current, authorId]
    );
  };

  const handleClearFilters = () => {
    setSearch("");
    setSelectedAuthors([]);
  };

  const handleCopy = async (
    event: React.MouseEvent<HTMLButtonElement>,
    modelId: string
  ) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(modelId);
      setCopiedId(modelId);
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopiedId(null);
      }, 2000);
    } catch {
      // Ignore clipboard failures (e.g. insecure context).
    }
  };

  const totalCount = models.length;
  const visibleCount = hasActiveFilters ? filteredModels.length : totalCount;

  return (
    <div className="models-explorer">
      <div className="models-search">
        <label className="models-search-field">
          <span className="models-search-label">Search models</span>
          <input
            type="search"
            placeholder="Search models, descriptions, or authors"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search models"
          />
        </label>
        <div className="models-search-meta">
          <span>
            {state === "loading" ? "Loading models..." : `${visibleCount} models`}
          </span>
          <button
            className="btn btn-ghost models-clear"
            type="button"
            onClick={handleClearFilters}
            disabled={!hasActiveFilters}
          >
            Clear filters
          </button>
        </div>
      </div>
      <div className="models-layout">
        <aside className="models-filters glass-card">
          <div className="filter-group">
            <div className="filter-heading">Authors</div>
            <div className="filter-options">
              {authorOptions.length === 0 ? (
                <div className="filter-option">
                  <span className="filter-option-text">
                    <span className="filter-option-title">
                      {state === "loading"
                        ? "Loading authors..."
                        : "No authors available"}
                    </span>
                  </span>
                </div>
              ) : (
                authorOptions.map((author) => (
                  <label className="filter-option" key={author.id}>
                    <input
                      type="checkbox"
                      checked={selectedAuthors.includes(author.id)}
                      onChange={() => handleAuthorToggle(author.id)}
                    />
                    <span className="filter-option-text">
                      <span className="filter-option-title">{author.label}</span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
        </aside>
        <div className="models-results">
          {state === "loading" ? (
            <div className="models-empty glass-card">
              <h3>Loading models...</h3>
              <p>Fetching catalog data from D1.</p>
            </div>
          ) : error ? (
            <div className="models-empty glass-card">
              <h3>Unable to load models.</h3>
              <p>{error}</p>
              <button className="btn btn-ghost" type="button" onClick={loadModels}>
                Retry
              </button>
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="models-empty glass-card">
              <h3>No models matched your filters.</h3>
              <p>Try removing a filter or broadening the search query.</p>
            </div>
          ) : (
            <div className="models-grid">
              {filteredModels.map((model) => {
                const contextLabel = formatContextLength(model.contextLength);
                const promptLabel = formatPricePerMillion(model.promptPrice);
                const completionLabel = formatPricePerMillion(model.completionPrice);
                const hasPills = Boolean(
                  contextLabel || promptLabel || completionLabel
                );

                return (
                  <Link
                    className="model-card glass-card model-card-link"
                    key={model.id}
                    href={`/models/${encodeURIComponent(model.id)}`}
                  >
                    <div className="model-card-header">
                      <div>
                        <span className="model-provider">
                          {getAuthorLabel(model.author)}
                        </span>
                        <h3>{model.name}</h3>
                        <div className="model-id-row">
                          <span className="model-id">{model.id}</span>
                          <button
                            className="model-id-copy"
                            type="button"
                            onClick={(event) => handleCopy(event, model.id)}
                            aria-label={`Copy model id ${model.id}`}
                          >
                            {copiedId === model.id ? (
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                  d="M5 12l4 4L19 6"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                  d="M9 9h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <path
                                  d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                    <p>{model.summary}</p>
                    {hasPills ? (
                      <div className="pill-row">
                        {contextLabel ? (
                          <span className="pill">{`${contextLabel} context`}</span>
                        ) : null}
                        {promptLabel ? (
                          <span className="pill">{`$${promptLabel}/M input tokens`}</span>
                        ) : null}
                        {completionLabel ? (
                          <span className="pill">
                            {`$${completionLabel}/M output tokens`}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
