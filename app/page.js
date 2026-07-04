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
  const [briefing, setBriefing] = useState(false);
  const [progress, setProgress] = useState("");
  const [pendingCount, setPendingCount] = useState(null);
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

  async function generateBriefing() {
    if (!key.trim()) {
      setErr("Enter your access key (CRON_SECRET) in the field above, then try again.");
      return;
    }
    setErr("");
    setRes(null);
    setProgress("Starting…");
    setBriefing(true);

    try {
      setProgress("Cleaning HTML on all newsletters…");
      const cleanRes = await fetch("/api/clean", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const cleanParsed = await parseApiResponse(cleanRes);
      if (!cleanParsed.data && !cleanRes.ok) {
        throw new Error(apiError(cleanParsed, "clean failed"));
      }
      if (!cleanRes.ok) throw new Error(apiError(cleanParsed, "clean failed"));

      let extracted = 0;
      let stalls = 0;
      for (let guard = 0; guard < 200; guard++) {
        const sumRes = await fetch("/api/summarize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key, limit: 1 }),
        });
        const sumParsed = await parseApiResponse(sumRes);
        const d = sumParsed.data;
        if (!d) throw new Error(apiError(sumParsed, "summarize failed"));
        if (!sumRes.ok) throw new Error(apiError(sumParsed, "summarize failed"));

        const remaining = d.remaining ?? 0;
        setProgress(
          remaining > 0
            ? `Extracting facts… ${extracted} done, ${remaining} remaining`
            : `Extracting facts… ${extracted} done`
        );

        if (remaining === 0) break;

        if ((d.summarized ?? 0) > 0) {
          extracted += d.summarized;
          stalls = 0;
        } else {
          stalls++;
          const firstErr = d.results?.find((r) => r.error)?.error;
          if (firstErr && d.rate_limited) {
            setProgress("Rate limited — waiting 15s…");
            await new Promise((r) => setTimeout(r, 15000));
            continue;
          }
          if (firstErr) throw new Error(firstErr);
          if (stalls >= 5) {
            throw new Error("Stuck — no progress after several attempts. Check GEMINI_API_KEY in Vercel.");
          }
        }

        if (d.rate_limited) {
          setProgress("Rate limited — waiting 15s…");
          await new Promise((r) => setTimeout(r, 15000));
        }
      }

      setProgress(`Synthesizing briefing across all newsletters (${persona} lens)…`);
      const briefRes = await fetch("/api/briefing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, persona, clean: false }),
      });
      const briefParsed = await parseApiResponse(briefRes);
      const b = briefParsed.data;
      if (!b) throw new Error(apiError(briefParsed, "briefing failed"));
      if (!briefRes.ok) throw new Error(apiError(briefParsed, "briefing failed"));

      setRes({
        answer: b.markdown,
        sources: b.sources,
        persona: b.persona,
        source_count: b.source_count,
      });
      setProgress(`Done — ${b.source_count} newsletters → Top 3 Themes, Stories, Emerging, Follow-Ups.`);
      await refreshPending();
    } catch (e) {
      setErr(e.message);
      setProgress("");
    } finally {
      setBriefing(false);
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
            disabled={loading || briefing}
            style={{
              fontFamily: '"Helvetica Neue", Arial, sans-serif',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              padding: "10px 22px",
              border: "none",
              background: loading || briefing ? "#b9a99f" : accent,
              color: "#fff",
              cursor: loading || briefing ? "default" : "pointer",
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
            Ingest & Brief
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 12px", color: "#6b6356" }}>
            Cleans HTML on <strong>all</strong> newsletters, extracts per-issue facts, then synthesizes one
            briefing: <strong>Top 3 Themes · 3 Notable Stories · 3 Emerging Themes · 3 Follow-Ups</strong> (your digest prompt).
            {pendingCount !== null && pendingCount > 0 && (
              <strong style={{ color: ink }}> {pendingCount} still need extraction.</strong>
            )}
          </p>
          <button
            type="button"
            onClick={generateBriefing}
            disabled={briefing}
            style={{
              fontFamily: '"Helvetica Neue", Arial, sans-serif',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              padding: "12px 24px",
              border: "none",
              background: briefing ? "#b9a99f" : ink,
              color: "#fff",
              cursor: briefing ? "default" : "pointer",
            }}
          >
            {briefing ? "Working…" : "Generate briefing (all newsletters)"}
          </button>
          {!key.trim() && (
            <div style={{ marginTop: 8, fontSize: 13, color: accent }}>
              Enter your access key above to run this.
            </div>
          )}
          {progress && (
            <div style={{ marginTop: 10, fontSize: 14, color: "#3f7d3f" }}>{progress}</div>
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
