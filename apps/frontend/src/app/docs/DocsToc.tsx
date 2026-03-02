"use client";

import { useEffect, useMemo, useState } from "react";

type TocItem = {
  label: string;
  href: string;
};

type DocsTocProps = {
  items: TocItem[];
};

function getIdFromHref(href: string) {
  return href.startsWith("#") ? href.slice(1) : href;
}

export default function DocsToc({ items }: DocsTocProps) {
  const ids = useMemo(() => items.map((item) => getIdFromHref(item.href)), [
    items,
  ]);
  const [activeId, setActiveId] = useState(ids[0] ?? "");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleHash = () => {
      const hash = window.location.hash.slice(1);
      if (hash && ids.includes(hash)) {
        setActiveId(hash);
      }
    };

    handleHash();
    window.addEventListener("hashchange", handleHash);

    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (!elements.length) {
      return () => window.removeEventListener("hashchange", handleHash);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: "0px 0px -65% 0px",
        threshold: [0, 0.2, 0.5, 1],
      }
    );

    elements.forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", handleHash);
    };
  }, [ids]);

  return (
    <aside className="docs-toc" aria-label="On this page">
      <span className="docs-toc-title">On this page</span>
      <div className="docs-toc-list">
        {items.map((item) => {
          const id = getIdFromHref(item.href);
          const isActive = id === activeId;
          return (
            <a
              href={item.href}
              key={item.href}
              aria-current={isActive ? "location" : undefined}
              className={isActive ? "active" : undefined}
            >
              {item.label}
            </a>
          );
        })}
      </div>
    </aside>
  );
}
