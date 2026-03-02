import Link from "next/link";

import AuthMenu from "./AuthMenu";

export default function SiteHeader() {
  return (
    <header className="site-header landing-header">
      <div className="content">
        <Link className="logo" href="/">
          <div className="logo-mark logo-image">
            <img
              src="/logo.png"
              alt="AnyResponses logo"
              width="44"
              height="44"
            />
          </div>
          <div className="logo-text">
            <span>AnyResponses</span>
            <span className="logo-sub">Open Responses routing</span>
          </div>
        </Link>
        <nav className="nav-links landing-nav" aria-label="Primary">
          <Link href="/#call-modes">How to use</Link>
          <Link href="/providers">Providers</Link>
          <Link href="/docs">Docs</Link>
          <Link href="/models" className="nav-link-with-badge">
            <span className="nav-label">Models</span>
            <span className="nav-badge">Built-in</span>
          </Link>
        </nav>
        <div className="nav-actions landing-actions">
          <a
            className="icon-link"
            href="https://github.com/anyresponses/anyresponses"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.11 3.29 9.44 7.86 10.97.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2.01-3.2.7-3.88-1.54-3.88-1.54-.53-1.36-1.29-1.72-1.29-1.72-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.56-.29-5.26-1.28-5.26-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.07 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.6.23 2.78.11 3.07.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.28 5.68.41.36.77 1.08.77 2.18 0 1.58-.02 2.86-.02 3.25 0 .31.21.67.8.56 4.57-1.53 7.86-5.86 7.86-10.97C23.5 5.74 18.27.5 12 .5Z"
              />
            </svg>
          </a>
          <AuthMenu />
        </div>
      </div>
    </header>
  );
}
