"use client";

import Link from "next/link";
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
  const [windowCount, setWindowCount] = useState(null);
  const [windowDays, setWindowDays] = useState(3);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [showAsk, setShowAsk] = useState(false);
  const [digestSending, setDigestSending] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [digestRes, setDigestRes] = useState(null);
  const [digestErr, setDigestErr] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  async function refreshWindowCount() {
    if (!key.trim()) return;
    try {
      const r = await fetch(`/api/newsletters?key=${encodeURIComponent(key)}`);
      const parsed = await parseApiResponse(r);
      if (parsed.data && r.ok) {
        setWindowCount(parsed.data.in_digest_window);
        if (parsed.data.window_days) setWindowDays(parsed.data.window_days);
      }
    } catch {
      setWindowCount(null);
    }
  }

  function requireKey() {
    if (!key.trim()) {
      setErr("Add your access key below first — it's the same as CRON_SECRET in Vercel.");
      return false;
    }
    return true;
  }

  async function runBatchedExtract(endpoint, extraBody = {}, onProgress) {
    const planRes = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, action: "plan", ...extraBody }),
    });
    const planParsed = await parseApiResponse(planRes);
    const plan = planParsed.data;
    if (!plan) throw new Error(apiError(planParsed, "request failed"));
    if (!planRes.ok) throw new Error(apiError(planParsed, plan.error || "request failed"));
    if (plan.skipped) {
      throw new Error(
        plan.reason === "empty window"
          ? "No newsletters in the digest window yet — sync inbox first."
          : plan.reason || "nothing to process"
      );
    }
    if (plan.error) throw new Error(plan.error);

    const parts = [];
    for (let i = 0; i < plan.batchCount; i++) {
      onProgress?.(`Analyzing newsletters (${i + 1}/${plan.batchCount})…`);
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, action: "extract", batchIndex: i, ...extraBody }),
      });
      const parsed = await parseApiResponse(r);
      const d = parsed.data;
      if (!d) throw new Error(apiError(parsed, "extract failed"));
      if (!r.ok) throw new Error(apiError(parsed, d.error || "extract failed"));
      parts.push(d.partial);
    }
    return { parts, plan };
  }

  async function generateBriefing() {
    if (!requireKey()) return;
    setErr("");
    setRes(null);
    setProgress("Starting…");
    setBriefing(true);

    try {
      const { parts, plan } = await runBatchedExtract("/api/briefing", {}, setProgress);
      setProgress("Formatting briefing…");
      const briefRes = await fetch("/api/briefing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, action: "finish", parts, persona }),
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
        window_days: b.window_days ?? plan.window_days,
        ignored: b.ignored ?? plan.ignored,
      });
      setProgress("");
      await refreshWindowCount();
    } catch (e) {
      setErr(e.message);
      setProgress("");
    } finally {
      setBriefing(false);
    }
  }

  async function syncInbox() {
    if (!requireKey()) return;
    setSyncMsg("");
    setErr("");
    setSyncing(true);
    try {
      const r = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const parsed = await parseApiResponse(r);
      const d = parsed.data;
      if (!d) throw new Error(apiError(parsed, "sync failed"));
      if (!r.ok) throw new Error(apiError(parsed, "sync failed"));
      const trashed = d.trashed ? `, ${d.trashed} moved to Gmail Trash` : "";
      setSyncMsg(`Synced ${d.ingested} new newsletter${d.ingested === 1 ? "" : "s"}${trashed}.`);
      await refreshWindowCount();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function sendDigestRequest({ test = false } = {}) {
    if (!requireKey()) return;
    setDigestErr("");
    setDigestRes(null);
    if (test) setTestSending(true);
    else setDigestSending(true);
    try {
      setProgress(test ? "Starting test digest…" : "Starting digest…");
      const { parts } = await runBatchedExtract(
        "/api/digest",
        { force: true, test },
        setProgress
      );
      setProgress("Sending email…");
      const r = await fetch("/api/digest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, action: "send", parts, force: true, test }),
      });
      const parsed = await parseApiResponse(r);
      const d = parsed.data;
      if (!d) throw new Error(apiError(parsed, "digest failed"));
      if (d.error) throw new Error(d.error);
      if (!r.ok) throw new Error(apiError(parsed, "digest failed"));
      if (d.skipped) {
        throw new Error(
          d.reason === "empty window"
            ? "No newsletters in the digest window yet — sync inbox first."
            : d.reason === "interval"
              ? "Digest interval not elapsed — use Send test digest or force send."
              : `Digest skipped (${d.reason || "unknown"}).`
        );
      }
      setDigestRes(d);
    } catch (e) {
      setDigestErr(e.message);
    } finally {
      setDigestSending(false);
      setTestSending(false);
      setProgress("");
    }
  }

  async function forceSendDigest() {
    return sendDigestRequest({ test: false });
  }

  async function sendTestDigest() {
    return sendDigestRequest({ test: true });
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
        <h2 className="card-title">Connect Gmail first</h2>
        <p className="field-hint" style={{ marginTop: 0 }}>
          One-time setup — connect your inbox so we can sync newsletters and send digests.
        </p>
        <Link href="/confirm" className="btn btn-primary btn-block">
          Open Setup
        </Link>
      </div>

      <div className="card">
        <h2 className="card-title">How it works</h2>
        <ol className="steps">
          <li className="step">
            <span className="step-num">1</span>
            <span>Connect Gmail on Setup and subscribe newsletters to that address</span>
          </li>
          <li className="step">
            <span className="step-num">2</span>
            <span>Sync inbox, then send digest or generate briefing</span>
          </li>
          <li className="step">
            <span className="step-num">3</span>
            <span>Get cross-newsletter insights from the last {windowDays} days, with source URLs</span>
          </li>
        </ol>
      </div>

      <div className="card">
        <AccessKeyField value={key} onChange={setKey} onBlur={refreshWindowCount} />

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

        {windowCount !== null && windowCount > 0 && (
          <div className="alert alert-info">
            {windowCount} newsletter{windowCount === 1 ? "" : "s"} in the last {windowDays}-day window —
            send digest for cross-newsletter insights with source links.
          </div>
        )}

        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={syncInbox}
          disabled={syncing || briefing}
          style={{ marginBottom: "0.75rem" }}
        >
          {syncing ? "Syncing Gmail…" : "Sync inbox"}
        </button>

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
        {syncMsg && <div className="alert alert-success" style={{ marginTop: "1rem", marginBottom: 0 }}>{syncMsg}</div>}
      </div>

      <div className="card">
        <h2 className="card-title">Email digest</h2>
        <p className="field-hint" style={{ marginTop: 0 }}>
          Reads all newsletters in the <strong>{windowDays}-day window</strong> together (not one-by-one).
          Each insight includes the article URL when available.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={sendTestDigest}
          disabled={testSending || digestSending || briefing}
          style={{ marginBottom: "0.75rem" }}
        >
          {testSending ? (
            <>
              <span className="spinner" aria-hidden /> Sending test digest…
            </>
          ) : (
            "Send test digest → skyspeak@gmail.com"
          )}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={forceSendDigest}
          disabled={digestSending || testSending || briefing}
        >
          {digestSending ? (
            <>
              <span className="spinner" aria-hidden /> Sending digest…
            </>
          ) : (
            "Send digest now"
          )}
        </button>
        {progress && (digestSending || testSending) && (
          <div className="alert alert-info" style={{ marginTop: "1rem", marginBottom: 0 }}>{progress}</div>
        )}
      </div>

      {digestErr && <div className="alert alert-error">{digestErr}</div>}

      {digestRes?.editions?.length > 0 && (
        <div className="result">
          <div
            className={digestRes.sent ? "alert alert-success" : "alert alert-error"}
            style={{ marginBottom: "1rem" }}
          >
            {digestRes.sent
              ? digestRes.test
                ? `Test digest sent to ${digestRes.sent_to || "skyspeak@gmail.com"} (${digestRes.sources} newsletter${digestRes.sources === 1 ? "" : "s"}${digestRes.ignored ? `, ${digestRes.ignored} skipped` : ""}).`
                : `Digest sent via Gmail (${digestRes.sources} newsletter${digestRes.sources === 1 ? "" : "s"}${digestRes.ignored ? `, ${digestRes.ignored} skipped` : ""}).`
              : digestRes.editions.find((e) => e.error)?.error || "Digest built but email was not sent."}
          </div>
          {digestRes.editions.map((edition) => (
            <div key={edition.persona}>
              {digestRes.editions.length > 1 && edition.label && (
                <h3 className="card-title" style={{ fontSize: "0.9375rem", marginBottom: "0.75rem" }}>
                  {edition.label}
                </h3>
              )}
              <div className="result-body">{edition.markdown}</div>
            </div>
          ))}
        </div>
      )}

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
              Briefing from {res.source_count} newsletter{res.source_count === 1 ? "" : "s"} in the {res.window_days || windowDays}-day window
              {res.ignored ? ` (${res.ignored} older skipped, max 40)` : ""}
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
