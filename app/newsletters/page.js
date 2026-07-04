"use client";

import { useState, useCallback } from "react";

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

export default function NewslettersPage() {
  const [key, setKey] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(null);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    if (!key.trim()) return;
    setErr("");
    setLoading(true);
    try {
      const r = await fetch(`/api/newsletters?key=${encodeURIComponent(key)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "request failed");
      setData(d);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [key]);

  async function summarize(id) {
    setSummarizing(id || "all");
    setErr("");
    try {
      const r = await fetch("/api/summarize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, id: id || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "summarize failed");
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSummarizing(null);
    }
  }

  async function summarizeAll() {
    setSummarizing("all");
    setErr("");
    try {
      const r = await fetch("/api/summarize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "summarize failed");
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSummarizing(null);
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
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
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
            Neutral view
          </div>
          <h1
            style={{
              fontFamily: '"Helvetica Neue", Arial, sans-serif',
              fontSize: 40,
              margin: "4px 0 0",
              letterSpacing: ".04em",
            }}
          >
            NEWSLETTERS
          </h1>
          <div style={{ fontStyle: "italic", color: accent, fontSize: 14, marginTop: 4 }}>
            Raw corpus — no persona filter
          </div>
        </header>

        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
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
            }}
          />
          <button
            onClick={load}
            disabled={loading || !key.trim()}
            style={btnStyle(loading || !key.trim())}
          >
            {loading ? "…" : "Load"}
          </button>
        </div>

        {data && data.pending_count > 0 && (
          <button
            onClick={summarizeAll}
            disabled={summarizing === "all"}
            style={{ ...btnStyle(summarizing === "all"), marginBottom: 16 }}
          >
            {summarizing === "all"
              ? "Summarizing…"
              : `Summarize this — all pending (${data.pending_count})`}
          </button>
        )}

        <div style={{ fontSize: 13, marginBottom: 20, color: muted, fontFamily: '"Helvetica Neue", Arial, sans-serif' }}>
          <a href="/" style={{ color: accent }}>
            ← Ask console
          </a>
          {" · "}
          <a href="/confirm" style={{ color: accent }}>
            Confirm subscriptions
          </a>
        </div>

        {err && <div style={{ color: accent, marginBottom: 16, fontSize: 14 }}>{err}</div>}

        {data && (
          <div
            style={{
              fontFamily: '"Helvetica Neue", Arial, sans-serif',
              fontSize: 12,
              color: muted,
              marginBottom: 16,
            }}
          >
            {data.count} newsletters · {data.with_summary} summarized · {data.pending_count} pending
          </div>
        )}

        {data?.newsletters?.map((n) => (
          <article
            key={n.id}
            style={{
              border: `1px solid ${rule}`,
              background: "#fff",
              padding: 14,
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: muted }}>
                  {fmtTime(n.received_at)} · {n.sender}
                </div>
                <h2 style={{ fontSize: 17, margin: "4px 0 8px", lineHeight: 1.25 }}>{n.subject}</h2>
                <div style={{ fontSize: 11, fontFamily: '"Helvetica Neue", Arial, sans-serif', color: muted }}>
                  body {n.body_len} chars
                  {n.has_summary ? (
                    <span style={{ color: green }}> · summarized</span>
                  ) : n.body_len > 120 ? (
                    <span style={{ color: accent }}> · needs summarize</span>
                  ) : (
                    <span> · no body</span>
                  )}
                  {n.confirmed_at && <span> · confirmed</span>}
                </div>
              </div>
              {!n.has_summary && n.body_len > 120 && (
                <button
                  onClick={() => summarize(n.id)}
                  disabled={!!summarizing}
                  style={{
                    ...btnStyle(!!summarizing),
                    fontSize: 11,
                    padding: "8px 12px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {summarizing === n.id ? "…" : "Summarize this"}
                </button>
              )}
            </div>

            {n.has_summary && (
              <>
                <button
                  onClick={() => setExpanded(expanded === n.id ? null : n.id)}
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    fontFamily: '"Helvetica Neue", Arial, sans-serif',
                    background: "none",
                    border: "none",
                    color: accent,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {expanded === n.id ? "Hide extract" : "Show extract"}
                </button>
                {expanded === n.id && (
                  <pre
                    style={{
                      marginTop: 10,
                      fontSize: 13,
                      lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                      background: paper,
                      padding: 12,
                      border: `1px solid ${rule}`,
                      fontFamily: "inherit",
                    }}
                  >
                    {n.summary}
                  </pre>
                )}
              </>
            )}
          </article>
        ))}

        {data?.newsletters?.length === 0 && (
          <p style={{ color: muted, fontSize: 14 }}>No newsletters yet — send some to your inbound address.</p>
        )}
      </div>
    </main>
  );
}

function btnStyle(disabled) {
  return {
    fontFamily: '"Helvetica Neue", Arial, sans-serif',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: ".06em",
    textTransform: "uppercase",
    padding: "10px 18px",
    border: "none",
    background: disabled ? "#b9a99f" : accent,
    color: "#fff",
    cursor: disabled ? "default" : "pointer",
  };
}
