"use client";

import { useCallback, useEffect, useState } from "react";

import SiteHeader from "../components/SiteHeader";

const contactEmail = "support@anyresponses.com";
const emailSubject = "Enterprise inquiry: {Company}";
const emailTemplate = `Company:
Website:
Contact name / role / email:
Use case:
Estimated volume:
Compliance / region:
Target timeline:
What else is needed:`;
const mailtoLink = `mailto:${contactEmail}?subject=${encodeURIComponent(
  emailSubject,
)}&body=${encodeURIComponent(emailTemplate)}`;

const infoChecklist = [
  "Company name and website",
  "Contact name / role / email",
  "Use case (1-2 sentences)",
  "Estimated volume (calls / seats / daily requests)",
  "Compliance / region requirements",
  "Target timeline",
  "What else is needed?",
];

export default function EnterprisePage() {
  const [copied, setCopied] = useState(false);

  const handleCopyEmail = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(contactEmail);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, []);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div className="page enterprise-page">
      <div className="bg-orb orb-1" aria-hidden="true" />
      <div className="bg-orb orb-2" aria-hidden="true" />
      <div className="bg-orb orb-3" aria-hidden="true" />

      <SiteHeader />

      <main className="content">
        <section className="section">
          <div className="section-block section-block-plain">
            <div className="section-heading">
              <h2>Enterprise contact</h2>
              <p>Tell us what you need. We reply within 24 hours.</p>
            </div>
            <div className="grid">
              <div className="glass-card card enterprise-card">
                <h3>What we need</h3>
                <p>Share these details so we can respond quickly.</p>
                <ul className="bullet-list">
                  {infoChecklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="glass-card card enterprise-card">
                <h3>Email us</h3>
                <p>Send us a note and we will reply within 24 hours.</p>
                <div className="pill-row">
                  <button
                    className="pill support-pill pill-button"
                    type="button"
                    onClick={handleCopyEmail}
                    aria-live="polite"
                  >
                    {copied ? "Copied to clipboard" : contactEmail}
                  </button>
                  <span className="pill">24-hour response</span>
                </div>
                <a className="btn btn-primary" href={mailtoLink}>
                  Contact via email
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
