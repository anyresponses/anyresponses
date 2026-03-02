import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import SiteHeader from "../../components/SiteHeader";
import DocsToc from "../DocsToc";
import { highlightCode } from "../../lib/highlight";
import { docsPages, getDocsMarkdown } from "../docsData";
import { parseMarkdown } from "../markdown";

type DocsPageProps = {
  params: Promise<{ slug: string }>;
};

function renderInline(text: string, keyPrefix: string) {
  const tokens: ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let partIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("`")) {
      tokens.push(
        <code key={`${keyPrefix}-code-${partIndex}`}>{token.slice(1, -1)}</code>
      );
    } else if (token.startsWith("**")) {
      tokens.push(
        <strong key={`${keyPrefix}-strong-${partIndex}`}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("[")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const href = linkMatch[2];
        const isExternal = /^https?:\/\//.test(href);
        tokens.push(
          <a
            key={`${keyPrefix}-link-${partIndex}`}
            href={href}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noreferrer" : undefined}
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        tokens.push(token);
      }
    } else {
      tokens.push(token);
    }

    lastIndex = match.index + token.length;
    partIndex += 1;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }

  return tokens.length > 0 ? tokens : text;
}

export async function generateStaticParams() {
  return docsPages.map((page) => ({ slug: page.slug }));
}

export default async function DocsPage({ params }: DocsPageProps) {
  const { slug } = await params;
  const pageMeta = docsPages.find((page) => page.slug === slug);
  if (!pageMeta) {
    notFound();
  }

  const markdown = await getDocsMarkdown(slug);
  const docsContent = parseMarkdown(markdown);
  const navGroups = docsPages.reduce<Record<string, typeof docsPages>>(
    (groups, page) => {
      if (!groups[page.group]) {
        groups[page.group] = [];
      }
      groups[page.group].push(page);
      return groups;
    },
    {}
  );
  const currentIndex = docsPages.findIndex((page) => page.slug === slug);
  const prevPage = currentIndex > 0 ? docsPages[currentIndex - 1] : null;
  const nextPage =
    currentIndex >= 0 && currentIndex < docsPages.length - 1
      ? docsPages[currentIndex + 1]
      : null;

  return (
    <div className="page docs">
      <div className="bg-orb orb-1" aria-hidden="true" />
      <div className="bg-orb orb-2" aria-hidden="true" />
      <div className="bg-orb orb-3" aria-hidden="true" />

      <SiteHeader />

      <main className="content docs-main">
        <section className="section docs-section">
          <div className="docs-shell">
            <div className="docs-sidebar-slot">
              <aside className="docs-sidebar" aria-label="Docs navigation">
                <div className="docs-sidebar-header">
                  <span className="docs-sidebar-title">Docs</span>
                  <span className="docs-sidebar-sub">
                    Technical wiki for AnyResponses.
                  </span>
                </div>
                <nav className="docs-nav">
                  {Object.entries(navGroups).map(([group, pages]) => (
                    <div className="docs-nav-section" key={group}>
                      <details className="docs-nav-group" open>
                        <summary className="docs-nav-link has-children">
                          {group}
                        </summary>
                        <div className="docs-nav-sub-links">
                          {pages.map((page) => (
                            <Link
                              className="docs-nav-sub-link"
                              href={`/docs/${page.slug}`}
                              key={page.slug}
                            >
                              {page.title}
                            </Link>
                          ))}
                        </div>
                      </details>
                    </div>
                  ))}
                </nav>
                <div className="docs-resource">
                  <span className="docs-nav-section-title">Resources</span>
                  <div className="docs-nav-links">
                    <Link className="docs-nav-link" href="/providers">
                      Provider catalog
                    </Link>
                    <Link className="docs-nav-link" href="/models">
                      Model catalog
                    </Link>
                    <a
                      className="docs-nav-link"
                      href="https://github.com/anyresponses/anyresponses"
                      target="_blank"
                      rel="noreferrer"
                    >
                      GitHub repository
                    </a>
                  </div>
                </div>
              </aside>
            </div>

            <div className="docs-article-wrap">
              <article className="docs-article">
                <header className="docs-hero">
                  <span className="docs-eyebrow">Documentation</span>
                  <h1>{pageMeta.title}</h1>
                  <p>{pageMeta.description}</p>
                </header>

                {docsContent.sections.map((section) => {
                  const Heading = section.level === 2 ? "h2" : "h3";
                  return (
                    <section
                      className="docs-content-section"
                      id={section.id}
                      key={section.id}
                    >
                      <Heading>{section.title}</Heading>
                      {section.blocks.map((block, blockIndex) => {
                        if (block.type === "paragraph") {
                          return (
                            <p key={`${section.id}-p-${blockIndex}`}>
                              {renderInline(
                                block.text,
                                `${section.id}-p-${blockIndex}`
                              )}
                            </p>
                          );
                        }
                        if (block.type === "list") {
                          return (
                            <ul
                              className="docs-list"
                              key={`${section.id}-ul-${blockIndex}`}
                            >
                              {block.items.map((item, itemIndex) => (
                                <li
                                  key={`${section.id}-li-${blockIndex}-${itemIndex}`}
                                >
                                  {renderInline(
                                    item,
                                    `${section.id}-li-${blockIndex}-${itemIndex}`
                                  )}
                                </li>
                              ))}
                            </ul>
                          );
                        }
                        if (block.type === "code") {
                          return (
                            <pre
                              className={`code-block docs-code language-${block.language}`}
                              key={`${section.id}-code-${blockIndex}`}
                            >
                              <code
                                className={`language-${block.language}`}
                                dangerouslySetInnerHTML={{
                                  __html: highlightCode(block.code),
                                }}
                              />
                            </pre>
                          );
                        }
                        if (block.type === "callout") {
                          return (
                            <div
                              className="docs-callout"
                              key={`${section.id}-callout-${blockIndex}`}
                            >
                              {renderInline(
                                block.text,
                                `${section.id}-callout-${blockIndex}`
                              )}
                            </div>
                          );
                        }
                        return null;
                      })}
                    </section>
                  );
                })}
              </article>
              {(prevPage || nextPage) && (
                <footer className="docs-article-footer">
                  <div className="docs-pagination">
                    {prevPage ? (
                      <Link
                        className="docs-pagination-link prev"
                        href={`/docs/${prevPage.slug}`}
                      >
                        <span className="docs-pagination-label">Previous</span>
                        <span className="docs-pagination-title">
                          {prevPage.title}
                        </span>
                      </Link>
                    ) : (
                      <span className="docs-pagination-spacer" />
                    )}
                    {nextPage ? (
                      <Link
                        className="docs-pagination-link next"
                        href={`/docs/${nextPage.slug}`}
                      >
                        <span className="docs-pagination-label">Next</span>
                        <span className="docs-pagination-title">
                          {nextPage.title}
                        </span>
                      </Link>
                    ) : (
                      <span className="docs-pagination-spacer" />
                    )}
                  </div>
                </footer>
              )}
            </div>

            <div className="docs-toc-slot">
              <DocsToc items={docsContent.tocItems} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
