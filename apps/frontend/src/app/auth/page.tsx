import Link from "next/link";

export default function AuthPage() {
  return (
    <div className="page auth-page">
      <div className="bg-orb orb-1" aria-hidden="true" />
      <div className="bg-orb orb-2" aria-hidden="true" />
      <div className="bg-orb orb-3" aria-hidden="true" />

      <header className="site-header landing-header">
        <div className="content">
          <Link href="/" className="logo" aria-label="Go to homepage">
            <div className="logo-mark logo-image">
              <img src="/logo.png" alt="AnyResponses logo" width="44" height="44" />
            </div>
            <div className="logo-text">
              <span>AnyResponses</span>
            </div>
          </Link>
        </div>
      </header>

      <main className="content auth-main auth-main-single">
        <section className="auth-forms auth-forms-single">
          <div className="auth-card glass" id="login">
            <div className="auth-card-header">
              <h2>Welcome</h2>
              <span className="auth-tag">Sign in / Sign up</span>
            </div>
            <p className="auth-card-sub">
              Continue with Google or GitHub to access your account.
            </p>
            <div className="auth-social">
              <a className="auth-provider provider-google" href="/api/auth/google">
                <span className="provider-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M23.49 12.27c0-.81-.07-1.59-.2-2.34H12v4.43h6.48a5.54 5.54 0 0 1-2.4 3.64v3.02h3.89c2.28-2.1 3.52-5.2 3.52-8.75Z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 24c3.24 0 5.95-1.07 7.94-2.9l-3.89-3.02c-1.08.72-2.46 1.15-4.05 1.15-3.12 0-5.77-2.1-6.72-4.92H1.27v3.09A12 12 0 0 0 12 24Z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.28 14.31a7.22 7.22 0 0 1 0-4.62V6.6H1.27a12 12 0 0 0 0 10.8l4.01-3.09Z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 4.77c1.76 0 3.34.6 4.58 1.78l3.43-3.43C17.94 1.19 15.23 0 12 0A12 12 0 0 0 1.27 6.6l4.01 3.09c.95-2.82 3.6-4.92 6.72-4.92Z"
                      fill="#EA4335"
                    />
                  </svg>
                </span>
                <span>Continue with Google</span>
              </a>
              <a className="auth-provider provider-github" href="/api/auth/github">
                <span className="provider-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.11 3.29 9.44 7.86 10.97.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2.01-3.2.7-3.88-1.54-3.88-1.54-.53-1.36-1.29-1.72-1.29-1.72-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.56-.29-5.26-1.28-5.26-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.07 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.6.23 2.78.11 3.07.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.28 5.68.41.36.77 1.08.77 2.18 0 1.58-.02 2.86-.02 3.25 0 .31.21.67.8.56 4.57-1.53 7.86-5.86 7.86-10.97C23.5 5.74 18.27.5 12 .5Z" />
                  </svg>
                </span>
                <span>Continue with GitHub</span>
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
