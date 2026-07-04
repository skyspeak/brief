"use client";

import { useState } from "react";

const paper = "#faf7f0";
const ink = "#1a1714";
const accent = "#9a2515";
const rule = "#c9bfae";
const muted = "#6b6356";

function fmtTime(unix) {
  if (!unix) return "";
  return new Date(unix * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ConfirmPage() {
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    setData(null);
    setLoading(true);
    try {
      const r = await fetch(`/api/confirmations?key=${encodeURIComponent(key)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "request failed");
      setData(d);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        background: paper,
        color: ink,
        minHeight: "100vh",
        fontFamily: 'Georgia, "Times New Roman", serif',
        padding: "48px 20px",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <header style={{ borderBottom: `3px double ${ink}`, paddingBottom: 10, marginBottom: 22 }}>
          <div
            style={{
              fontFamily: '"Helvetica Neue", Arial, sans-serif',
              fontSize: 11,
              letterSpacing: ".18em",
              textTransform: "uppercase",
              color: muted,
            }}
          >
            Newsletter subscriptions
          </div>
          <h1
            style={{
              fontFamily: '"Helvetica Neue", Arial, sans-serif',
              fontSize: 40,
              margin: "4px 0 0",
              letterSpacing: ".04em",
            }}
          >
            CONFIRM
          </h1>
          <div style={{ fontStyle: "italic", color: accent, fontSize: 14, marginTop: 4 }}>
            Complete double opt-in for newsletters sent to your inbound address
          </div>
        </header>

        <p style={{ fontSize: 15, lineHeight: 1.55, color: muted, marginBottom: 20 }}>
          Subscribe on a newsletter site using your <strong>Resend inbound address</strong>. When
          they send a confirmation email, it appears here — click the link to activate the
          subscription.
        </p>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="access key (CRON_SECRET)"
            style={{
              flex: 1,
              fontFamily: '"Helvetica Neue", Arial, sans-serif',
              fontSize: 13,
              padding: "9px 12px",
              border: `1px solid ${rule}`,
              background: "#fff",
              color: ink,
            }}
          />
          <button
            onClick={load}
            disabled={loading}
            style={{
              fontFamily: '"Helvetica Neue", Arial, sans-serif',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              padding: "10px 22px",
              border: "none",
              background: loading ? "#b9a99f" : accent,
              color: "#fff",
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        <div style={{ fontSize: 13, marginBottom: 20 }}>
          <a href="/" style={{ color: accent }}>
            ← Ask console
          </a>
        </div>

        {err && (
          <div style={{ color: accent, fontFamily: '"Helvetica Neue", Arial, sans-serif', fontSize: 14 }}>
            {err}
          </div>
        )}

        {data && (
          <section>
            <div
              style={{
                fontFamily: '"Helvetica Neue", Arial, sans-serif',
                fontSize: 12,
                color: muted,
                marginBottom: 16,
              }}
            >
              {data.count === 0
                ? "No confirmation emails detected yet."
                : `${data.pending} ready to confirm · ${data.needs_manual} need manual review`}
            </div>

            {data.confirmations?.length === 0 && (
              <div
                style={{
                  padding: 16,
                  border: `1px solid ${rule}`,
                  background: "#fff",
                  fontSize: 14,
                  lineHeight: 1.55,
                }}
              >
                Sign up for a newsletter using your inbound address, wait a few seconds, then
                refresh. Confirmation emails usually arrive within a minute.
              </div>
            )}

            {data.confirmations?.map((c) => (
              <article
                key={c.id}
                style={{
                  border: `1px solid ${rule}`,
                  background: "#fff",
                  padding: 16,
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    fontFamily: '"Helvetica Neue", Arial, sans-serif',
                    fontSize: 10,
                    letterSpacing: ".14em",
                    textTransform: "uppercase",
                    color: muted,
                    marginBottom: 6,
                  }}
                >
                  {fmtTime(c.received_at)} · {c.sender}
                </div>
                <h2 style={{ fontSize: 18, margin: "0 0 12px", lineHeight: 1.25 }}>{c.subject}</h2>

                {c.primaryLink ? (
                  <a
                    href={c.primaryLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-block",
                      fontFamily: '"Helvetica Neue", Arial, sans-serif',
                      fontSize: 13,
                      fontWeight: 700,
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                      padding: "10px 20px",
                      background: accent,
                      color: "#fff",
                      textDecoration: "none",
                      marginBottom: 10,
                    }}
                  >
                    Confirm subscription ↗
                  </a>
                ) : (
                  <div style={{ color: accent, fontSize: 14, marginBottom: 10 }}>
                    Looks like a confirmation email but no link was found. Check Turso or Resend
                    receiving logs.
                  </div>
                )}

                {c.links?.length > 1 && (
                  <details style={{ fontSize: 13, marginTop: 8 }}>
                    <summary style={{ cursor: "pointer", color: muted }}>
                      {c.links.length - 1} other link{c.links.length > 2 ? "s" : ""}
                    </summary>
                    <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.6 }}>
                      {c.links.slice(1).map((url) => (
                        <li key={url}>
                          <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: accent }}>
                            {url.length > 72 ? url.slice(0, 72) + "…" : url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
