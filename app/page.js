"use client";

import { useState } from "react";
import { parseApiResponse, apiError } from "@/lib/parse-api-response";
import { useAccessKey } from "./components/useAccessKey";
import AccessKeyField from "./components/AccessKeyField";

const PERSONAS = [
  { id: "neutral", label: "Neutral — balanced overview" },
  { id: "general", label: "General Manager" },
  { id: "sales", label: "Sales (CRO)" },
  { id: "marketing", label: "Marketing (CMO)" },
  { id: "engineering", label: "Engineering (CTO)" },
  { id: "product", label: "Product (CPO)" },
];

export default function Home() {
  const { key, setKey } = useAccessKey();
  const [persona, setPersona] = useState("neutral");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [briefing, setBriefing] = useState(false);
  const [progress, setProgress] = useState("");
  const [pendingCount, setPendingCount] = useState(null);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [showAsk, setShowAsk] = useState(false);

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

  function requireKey() {
    if (!key.trim()) {
      setErr("Add your access key below first — it's the same as CRON_SECRET in Vercel.");
      return false;
    }
    return true;
  }

  async function generateBriefing() {
    if (!requireKey()) return;
    setErr("");
    setRes(null);
    setProgress("Starting…");
    setBriefing(true);

    try {
      setProgress("Cleaning newsletter HTML…");
      const cleanRes = await fetch("/api/clean", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const cleanParsed = await parseApiResponse(cleanRes);
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
            ? `Reading newsletters… ${extracted} done, ${remaining} left`
            : `Reading newsletters… ${extracted} done`
        );

        if (remaining === 0) break;

        if ((d.summarized ?? 0) > 0) {
          extracted += d.summarized;
          stalls = 0;
        } else {
          stalls++;
          const firstErr = d.results?.find((r) => r.error)?.error;
          if (firstErr && d.rate_limited) {
            setProgress("Rate limited — pausing 15 seconds…");
            await new Promise((r) => setTimeout(r, 15000));
            continue;
          }
          if (firstErr) throw new Error(firstErr);
          if (stalls >= 5) {
            throw new Error("Stuck — check GEMINI_API_KEY in Vercel, then try again.");
          }
        }

        if (d.rate_limited) {
          setProgress("Rate limited — pausing 15 seconds…");
          await new Promise((r) => setTimeout(r, 15000));
        }
      }

      setProgress("Writing your briefing…");
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
      setProgress("");
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
    if (!requireKey()) return;
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
    <>
      <header className="page-header">
        <h1 className="page-title">Your briefing, ready when you are</h1>
        <p className="page-subtitle">
          Turn every newsletter in your inbox into one clear digest — top themes, stories, and what to
          watch next.
        </p>
      </header>

      <div className="card">
        <h2 className="card-title">How it works</h2>
        <ol className="steps">
          <li className="step">
            <span className="step-num">1</span>
            <span>Forward newsletters to your inbound address (set up on Subscribe)</span>
          </li>
          <li className="step">
            <span className="step-num">2</span>
            <span>Tap Generate briefing — we clean, read, and synthesize everything</span>
          </li>
          <li className="step">
            <span className="step-num">3</span>
            <span>Get Top 3 Themes, 3 Stories, 3 Emerging signals, and 3 Follow-ups</span>
          </li>
        </ol>
      </div>

      <div className="card">
        <AccessKeyField value={key} onChange={setKey} onBlur={refreshPending} />

        <div className="field">
          <label className="field-label" htmlFor="persona">
            Who is this for?
          </label>
          <select
            id="persona"
            className="select"
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
          >
            {PERSONAS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="field-hint">Filters the briefing to what matters for that role.</span>
        </div>

        {pendingCount !== null && pendingCount > 0 && (
          <div className="alert alert-info">
            {pendingCount} newsletter{pendingCount === 1 ? "" : "s"} still need to be read — briefing
            will process them automatically.
          </div>
        )}

        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={generateBriefing}
          disabled={briefing}
        >
          {briefing ? (
            <>
              <span className="spinner" aria-hidden /> Working…
            </>
          ) : (
            "Generate briefing"
          )}
        </button>

        {progress && <div className="alert alert-info" style={{ marginTop: "1rem", marginBottom: 0 }}>{progress}</div>}
      </div>

      <div className="card">
        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={() => setShowAsk(!showAsk)}
          aria-expanded={showAsk}
        >
          {showAsk ? "Hide ask a question" : "Ask a specific question instead"}
        </button>

        {showAsk && (
          <div style={{ marginTop: "1rem" }}>
            <div className="field">
              <label className="field-label" htmlFor="question">
                Your question
              </label>
              <textarea
                id="question"
                className="textarea"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="e.g. What should a GM know about AI infrastructure this week?"
                rows={3}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={ask}
              disabled={loading || briefing || !q.trim()}
            >
              {loading ? "Thinking…" : "Ask"}
            </button>
          </div>
        )}
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      {res && (
        <div className="result">
          {res.source_count && (
            <div className="alert alert-success" style={{ marginBottom: "1rem" }}>
              Briefing from {res.source_count} newsletter{res.source_count === 1 ? "" : "s"}
            </div>
          )}
          <div className="result-body">{res.answer}</div>
          {res.sources?.length > 0 && (
            <div className="result-sources">
              <h3>Sources</h3>
              <ol>
                {res.sources.map((s) => (
                  <li key={s.n}>
                    {s.subject}
                    {s.sender && <span> — {s.sender}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </>
  );
}
