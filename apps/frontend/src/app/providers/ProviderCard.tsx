"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

type Provider = {
  id: string;
  name: string;
  description: string;
};

const getProviderMonogram = (name: string, fallback: string) => {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  const cleanFallback = fallback.replace(/[^A-Za-z0-9]+/g, "");
  return (cleanFallback || fallback).slice(0, 2).toUpperCase();
};

export default function ProviderCard({ provider }: { provider: Provider }) {
  const [copied, setCopied] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const handleCopy = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        await navigator.clipboard.writeText(provider.id);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      } catch {
        // Ignore clipboard failures (e.g. insecure context).
      }
    },
    [provider.id]
  );

  return (
    <Link className="card glass-card provider-card" href={`/providers/${provider.id}`}>
      <div className="provider-card-header">
        <span className="provider-logo" aria-hidden="true">
          {logoFailed ? (
            getProviderMonogram(provider.name, provider.id)
          ) : (
            <img
              src={`/providers/${provider.id}.webp`}
              alt=""
              loading="lazy"
              onError={() => setLogoFailed(true)}
            />
          )}
        </span>
        <div className="provider-card-title">
          <h3>{provider.name}</h3>
          <div className="provider-id-row">
            <span className="provider-id">{provider.id}</span>
            <button
              className="provider-copy"
              type="button"
              onClick={handleCopy}
              aria-label={`Copy provider id ${provider.id}`}
            >
              {copied ? (
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
      <p>{provider.description}</p>
    </Link>
  );
}
