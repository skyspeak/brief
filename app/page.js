"use client";

import { useState } from "react";
import { parseApiResponse, apiError } from "@/lib/parse-api-response";

const paper = "#faf7f0";
const ink = "#1a1714";
const accent = "#9a2515";
const rule = "#c9bfae";

const PERSONAS = [
  { id: "neutral", label: "Neutral (no persona)" },
  { id: "general", label: "General Manager" },
  { id: "sales", label: "Sales (CRO)" },
  { id: "marketing", label: "Marketing (CMO)" },
  { id: "engineering", label: "Engineering (CTO)" },
  { id: "product", label: "Product (CPO)" },
];

export default function Home() {
  const [key, setKey] = useState("");
  const [persona, setPersona] = useState("neutral");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [pendingCount, setPendingCount] = useState(null);
  const [summarizeMsg, setSummarizeMsg] = useState("");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");

  async function refreshPending() {
    if (!key.trim()) return;
    try {
      const r = await fetch(`/api/newsletters?key=${encodeURIComponent(key)}`);
      const parsed = await parseApiResponse(r);
      if (parsed.data && r.ok) setPendingCount(parsed.data.pending_count);
    } catch {
      setPendingCount(null);
    }
  }

  async function summarizePending() {
    if (!key.trim()) {
      setErr("Enter your access key first");
      return;
    }
    setErr("");
    setSummarizeMsg("");
    setSummarizing(true);
    try {
      const r = await fetch("/api/summarize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const parsed = await parseApiResponse(r);
      const d = parsed.data;
      if (!d) throw new Error(apiError(parsed, "summarize failed"));
      if (!r.ok) throw new Error(apiError(parsed, "summarize failed"));
      const firstErr = d.results?.find((r) => r.error)?.error;
      if ((d.summarized ?? 0) === 0 && firstErr) throw new Error(firstErr);
      if (d.rate_limited) {
        setSummarizeMsg(
          `Summarized ${d.summarized ?? 0} of ${d.processed ?? 0}. OpenRouter rate limited — wait ~30s and click again.`
        );
      } else {
        const more = (pendingCount ?? 0) > (d.summarized ?? 0) ? " Click again if more are pending." : "";
        setSummarizeMsg(`Summarized ${d.summarized ?? 0} of ${d.processed ?? 0} newsletters.${more}`);
      }
      await refreshPending();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSummarizing(false);
    }
  }

  async function ask() {
    if (!q.trim()) return;
    setErr("");
    setRes(null);
    setLoading(true);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, key, persona }),
      });
      const parsed = await parseApiResponse(r);
      const d = parsed.data;
      if (!d) throw new Error(apiError(parsed, "request failed"));
      if (!r.ok) throw new Error(apiError(parsed, "request failed"));
      setRes(d);
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
              color: "#6b6356",
            }}
          >
            Ask the corpus
          </div>
          <h1 style={{ fontFamily: '"Helvetica Neue", Arial, sans-serif', fontSize: 40, margin: "4px 0 0", letterSpacing: ".04em" }}>
            THE BRIEF
          </h1>
          <div style={{ fontStyle: "italic", color: accent, fontSize: 14, marginTop: 4 }}>
            What's relevant in your industry, on demand
          </div>
        </header>

        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") ask();
          }}
          placeholder="e.g. What's relevant in business and AI this week?"
          rows={3}
          style={{
            width: "100%",
            boxSizing: "border-box",
            fontFamily: "inherit",
            fontSize: 16,
            padding: 12,
            border: `1px solid ${rule}`,
            background: "#fff",
            color: ink,
            resize: "vertical",
          }}
        />

        <div style={{ marginTop: 10 }}>
          <label
            style={{
              display: "block",
              fontFamily: '"Helvetica Neue", Arial, sans-serif',
              fontSize: 10,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "#6b6356",
              marginBottom: 4,
            }}
          >
            Reader lens
          </label>
          <select
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            style={{
              width: "100%",
              fontFamily: '"Helvetica Neue", Arial, sans-serif',
              fontSize: 13,
              padding: "9px 12px",
              border: `1px solid ${rule}`,
              background: "#fff",
              color: ink,
            }}
          >
            {PERSONAS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
          <input
            type="password"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setPendingCount(null);
            }}
            onBlur={refreshPending}
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
            onClick={ask}
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
            {loading ? "Reading…" : "Ask"}
          </button>
        </div>

        <section
          style={{
            marginTop: 20,
            padding: 16,
            border: `2px solid ${ink}`,
            background: "#fff",
          }}
        >
          <div
            style={{
              fontFamily: '"Helvetica Neue", Arial, sans-serif',
              fontSize: 10,
              letterSpacing: ".16em",
              textTransform: "uppercase",
              color: "#6b6356",
              marginBottom: 8,
            }}
          >
            Ingest
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 12px", color: "#6b6356" }}>
            Run the map-step summarizer on newsletters that arrived without a summary.
            Processes <strong>1 at a time</strong> to stay within Vercel&apos;s 60s limit — click again until pending hits 0.
            {pendingCount !== null && (
              <strong style={{ color: ink }}> {pendingCount} pending right now.</strong>
            )}
          </p>
          <button
            onClick={summarizePending}
            disabled={summarizing || !key.trim()}
            style={{
              fontFamily: '"Helvetica Neue", Arial, sans-serif',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              padding: "12px 24px",
              border: "none",
              background: summarizing || !key.trim() ? "#b9a99f" : ink,
              color: "#fff",
              cursor: summarizing || !key.trim() ? "default" : "pointer",
            }}
          >
            {summarizing ? "Summarizing…" : "Summarize this"}
          </button>
          {summarizeMsg && (
            <div style={{ marginTop: 10, fontSize: 14, color: "#3f7d3f" }}>{summarizeMsg}</div>
          )}
        </section>

        <div style={{ fontSize: 13, color: "#6b6356", marginTop: 12, fontFamily: '"Helvetica Neue", Arial, sans-serif' }}>
          ⌘/Ctrl + Enter to submit ·{" "}
          <a href="/newsletters" style={{ color: accent }}>
            Browse newsletters
          </a>
          {" · "}
          <a href="/confirm" style={{ color: accent }}>
            Confirm subscriptions
          </a>
        </div>

        {err && (
          <div style={{ marginTop: 20, color: accent, fontFamily: '"Helvetica Neue", Arial, sans-serif', fontSize: 14 }}>
            {err}
          </div>
        )}

        {res && (
          <article style={{ marginTop: 28 }}>
            <div
              style={{
                fontSize: 16.5,
                lineHeight: 1.65,
                whiteSpace: "pre-wrap",
                borderTop: `2px solid ${ink}`,
                paddingTop: 16,
              }}
            >
              {res.answer}
            </div>

            {res.sources?.length > 0 && (
              <section style={{ marginTop: 24 }}>
                <div
                  style={{
                    fontFamily: '"Helvetica Neue", Arial, sans-serif',
                    fontSize: 10,
                    letterSpacing: ".16em",
                    textTransform: "uppercase",
                    color: "#6b6356",
                    borderBottom: `1px solid ${rule}`,
                    paddingBottom: 4,
                    marginBottom: 8,
                  }}
                >
                  Sources
                </div>
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.5 }}>
                  {res.sources.map((s) => (
                    <li key={s.n}>
                      {s.subject} <em style={{ color: "#6b6356" }}>— {s.sender}</em>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </article>
        )}
      </div>
    </main>
  );
}
