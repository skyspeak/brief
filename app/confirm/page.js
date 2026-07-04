"use client";

import { useState, useEffect, useCallback } from "react";
import { parseApiResponse, apiError } from "@/lib/parse-api-response";

const paper = "#faf7f0";
const ink = "#1a1714";
const accent = "#9a2515";
const rule = "#c9bfae";
const muted = "#6b6356";
const green = "#3f7d3f";

function fmtTime(unix) {
  if (!unix) return "";
  return new Date(unix * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function ConfirmCard({ c, keyVal, onConfirmed }) {
  const [marking, setMarking] = useState(false);

  async function markDone() {
    setMarking(true);
    try {
      await fetch("/api/confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: keyVal, id: c.id }),
      });
      onConfirmed();
    } finally {
      setMarking(false);
    }
  }

  const done = c.status === "confirmed";

  return (
    <article
      style={{
        border: `1px solid ${done ? green : rule}`,
        background: done ? "#f6faf6" : "#fff",
        padding: 16,
        marginBottom: 14,
        opacity: done ? 0.85 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontFamily: '"Helvetica Neue", Arial, sans-serif',
            fontSize: 10,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: muted,
          }}
        >
          {fmtTime(c.received_at)} · {c.sender}
        </div>
        {done && (
          <span
            style={{
              fontFamily: '"Helvetica Neue", Arial, sans-serif',
              fontSize: 10,
              fontWeight: 700,
              color: green,
              letterSpacing: ".08em",
              textTransform: "uppercase",
            }}
          >
            ✓ Confirmed
          </span>
        )}
      </div>

      <h2 style={{ fontSize: 18, margin: "0 0 8px", lineHeight: 1.25 }}>{c.subject}</h2>

      {c.snippet && (
        <p style={{ fontSize: 13, color: muted, lineHeight: 1.5, margin: "0 0 12px", fontStyle: "italic" }}>
          {c.snippet}
        </p>
      )}

      {!done && c.primaryLink && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <a
            href={c.primaryLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              fetch("/api/confirmations", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ key: keyVal, id: c.id }),
              }).then(() => onConfirmed()).catch(() => {});
            }}
            style={{
              display: "inline-block",
              fontFamily: '"Helvetica Neue", Arial, sans-serif',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              padding: "10px 20px",
              border: "none",
              background: accent,
              color: "#fff",
              textDecoration: "none",
            }}
          >
            {c.primaryLabel || "Confirm subscription"} ↗
          </a>
          <button
            onClick={() => markDone()}
            disabled={marking}
            style={{
              fontFamily: '"Helvetica Neue", Arial, sans-serif',
              fontSize: 12,
              padding: "10px 14px",
              border: `1px solid ${rule}`,
              background: "#fff",
              color: muted,
              cursor: marking ? "default" : "pointer",
            }}
          >
            Mark done
          </button>
        </div>
      )}

      {!done && !c.primaryLink && (
        <div style={{ color: accent, fontSize: 14, marginBottom: 10 }}>
          Confirmation detected but no link found — try expanding other links below or re-send the
          signup email.
        </div>
      )}

      {c.linkDetails?.length > 0 && (
        <details style={{ fontSize: 13, marginTop: 4 }}>
          <summary style={{ cursor: "pointer", color: muted }}>
            {c.linkDetails.length} link{c.linkDetails.length > 1 ? "s" : ""} extracted
          </summary>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.6 }}>
            {c.linkDetails.map((l) => (
              <li key={l.url} style={{ marginBottom: 6 }}>
                {l.label && (
                  <span style={{ fontWeight: 700, display: "block", fontSize: 12 }}>{l.label}</span>
                )}
                <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: accent, wordBreak: "break-all" }}>
                  {l.url.length > 80 ? l.url.slice(0, 80) + "…" : l.url}
                </a>
                <span style={{ color: muted, fontSize: 11 }}> ({l.source})</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

export default function ConfirmPage() {
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!key.trim()) return;
    setErr("");
    setLoading(true);
    try {
      const r = await fetch(`/api/confirmations?key=${encodeURIComponent(key)}`);
      const parsed = await parseApiResponse(r);
      const d = parsed.data;
      if (!d) throw new Error(apiError(parsed, "request failed"));
      if (!r.ok) throw new Error(apiError(parsed, "request failed"));
      setData(d);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    if (!autoRefresh || !key.trim()) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [autoRefresh, key, load]);

  function copyInbound() {
    if (!data?.inbound_address) return;
    navigator.clipboard.writeText(data.inbound_address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const pending = data?.pending_list || [];
  const confirmed = data?.confirmed_list || [];
  const manual = (data?.confirmations || []).filter((c) => c.status === "manual");

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
            Complete double opt-in — no Gmail forwarding needed
          </div>
        </header>

        <ol style={{ fontSize: 14, lineHeight: 1.65, color: muted, paddingLeft: 20, marginBottom: 20 }}>
          <li>Copy your inbound address below</li>
          <li>Paste it when subscribing on a newsletter site</li>
          <li>Refresh this page — click the confirm button when the email arrives</li>
        </ol>

        {data?.inbound_address && (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              padding: "12px 14px",
              border: `2px solid ${ink}`,
              background: "#fff",
              marginBottom: 20,
            }}
          >
            <code style={{ flex: 1, fontSize: 14, wordBreak: "break-all" }}>{data.inbound_address}</code>
            <button
              onClick={copyInbound}
              style={{
                fontFamily: '"Helvetica Neue", Arial, sans-serif',
                fontSize: 12,
                fontWeight: 700,
                padding: "8px 14px",
                border: "none",
                background: accent,
                color: "#fff",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        )}

        {!data?.inbound_address && (
          <p style={{ fontSize: 13, color: muted, marginBottom: 20 }}>
            Tip: set <code>INBOUND_ADDRESS</code> in Vercel (e.g.{" "}
            <code>brief@yourdomain.com</code>) to show a copy box here.
          </p>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
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
            disabled={loading || !key.trim()}
            style={{
              fontFamily: '"Helvetica Neue", Arial, sans-serif',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              padding: "10px 22px",
              border: "none",
              background: loading || !key.trim() ? "#b9a99f" : accent,
              color: "#fff",
              cursor: loading || !key.trim() ? "default" : "pointer",
            }}
          >
            {loading ? "…" : "Refresh"}
          </button>
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: muted,
            fontFamily: '"Helvetica Neue", Arial, sans-serif',
            marginBottom: 16,
            cursor: "pointer",
          }}
        >
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Auto-refresh every 15s while waiting for confirmation emails
        </label>

        <div style={{ fontSize: 13, marginBottom: 20 }}>
          <a href="/" style={{ color: accent }}>
            ← Ask console
          </a>
          {" · "}
          <a href="/api/status" style={{ color: accent }}>
            Status API
          </a>
        </div>

        {err && (
          <div style={{ color: accent, fontFamily: '"Helvetica Neue", Arial, sans-serif', fontSize: 14, marginBottom: 16 }}>
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
                marginBottom: 20,
              }}
            >
              {data.pending} pending · {data.confirmed} confirmed · {data.needs_manual} need review
            </div>

            {pending.length === 0 && confirmed.length === 0 && manual.length === 0 && (
              <div
                style={{
                  padding: 16,
                  border: `1px solid ${rule}`,
                  background: "#fff",
                  fontSize: 14,
                  lineHeight: 1.55,
                }}
              >
                No confirmation emails yet. Subscribe using your inbound address, then refresh
                (or enable auto-refresh).
              </div>
            )}

            {pending.length > 0 && (
              <>
                <h3
                  style={{
                    fontFamily: '"Helvetica Neue", Arial, sans-serif',
                    fontSize: 11,
                    letterSpacing: ".16em",
                    textTransform: "uppercase",
                    marginBottom: 10,
                  }}
                >
                  Pending ({pending.length})
                </h3>
                {pending.map((c) => (
                  <ConfirmCard key={c.id} c={c} keyVal={key} onConfirmed={load} />
                ))}
              </>
            )}

            {manual.length > 0 && (
              <>
                <h3
                  style={{
                    fontFamily: '"Helvetica Neue", Arial, sans-serif',
                    fontSize: 11,
                    letterSpacing: ".16em",
                    textTransform: "uppercase",
                    margin: "20px 0 10px",
                  }}
                >
                  Needs review ({manual.length})
                </h3>
                {manual.map((c) => (
                  <ConfirmCard key={c.id} c={c} keyVal={key} onConfirmed={load} />
                ))}
              </>
            )}

            {confirmed.length > 0 && (
              <>
                <h3
                  style={{
                    fontFamily: '"Helvetica Neue", Arial, sans-serif',
                    fontSize: 11,
                    letterSpacing: ".16em",
                    textTransform: "uppercase",
                    margin: "20px 0 10px",
                    color: green,
                  }}
                >
                  Confirmed ({confirmed.length})
                </h3>
                {confirmed.map((c) => (
                  <ConfirmCard key={c.id} c={c} keyVal={key} onConfirmed={load} />
                ))}
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
