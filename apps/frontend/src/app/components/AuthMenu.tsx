"use client";

import { useEffect, useRef, useState } from "react";

type SessionUser = {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  provider?: unknown;
};

type UserInfo = {
  name: string;
  email: string;
  provider?: string;
};

export default function AuthMenu() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadSession = async () => {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => ({}))) as {
          user?: SessionUser | null;
        };
        if (cancelled || !data.user || typeof data.user !== "object") {
          return;
        }
        const name =
          typeof data.user.name === "string" ? data.user.name : "Account";
        const email =
          typeof data.user.email === "string" ? data.user.email : "";
        const provider =
          typeof data.user.provider === "string"
            ? data.user.provider
            : undefined;
        setUser({ name, email, provider });
      } catch {
        // Ignore session errors and keep the user unauthenticated.
      }
    };
    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current) {
        return;
      }
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      window.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const handleToggle = () => {
    setOpen((current) => !current);
  };

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      setUser(null);
      setOpen(false);
    }
  };

  if (!user) {
    return (
      <a className="btn btn-primary" href="/auth">
        Get Started
      </a>
    );
  }

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="btn btn-ghost user-menu-button"
        type="button"
        onClick={handleToggle}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="user-menu-name">{user.name}</span>
        <span className="user-menu-chevron" aria-hidden="true">
          v
        </span>
      </button>
      {open ? (
        <div className="user-menu-dropdown" role="menu">
          <a className="user-menu-item" href="/credits" role="menuitem">
            Credits
          </a>
          <a className="user-menu-item" href="/keys" role="menuitem">
            Keys
          </a>
          <a className="user-menu-item" href="/integrations" role="menuitem">
            Integrations (BYOK)
          </a>
          <a className="user-menu-item" href="/activity" role="menuitem">
            Activity
          </a>
          <a className="user-menu-item" href="/enterprise" role="menuitem">
            Enterprise
          </a>
          <div className="user-menu-divider" />
          <button
            className="user-menu-item user-menu-signout"
            type="button"
            role="menuitem"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
