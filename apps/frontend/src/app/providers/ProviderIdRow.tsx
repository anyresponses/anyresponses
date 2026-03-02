"use client";

import { useCallback, useState } from "react";

export default function ProviderIdRow({ providerId }: { providerId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(providerId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Ignore clipboard failures (e.g. insecure context).
    }
  }, [providerId]);

  return (
    <div className="provider-id-row">
      <span className="provider-id">{providerId}</span>
      <button
        className="provider-copy"
        type="button"
        onClick={handleCopy}
        aria-label={`Copy provider id ${providerId}`}
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
  );
}
