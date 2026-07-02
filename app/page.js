"use client";

import { useState } from "react";

const paper = "#faf7f0";
const ink = "#1a1714";
const accent = "#9a2515";
const rule = "#c9bfae";

export default function Home() {
  const [key, setKey] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");

  async function ask() {
    if (!q.trim()) return;
    setErr("");
    setRes(null);
    setLoading(true);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, key }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "request failed");
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
          placeholder="e.g. What shifts in payer contracting should a healthcare seller watch this quarter?"
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

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
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
        <div style={{ fontSize: 12, color: "#6b6356", marginTop: 6, fontFamily: '"Helvetica Neue", Arial, sans-serif' }}>
          ⌘/Ctrl + Enter to submit
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
