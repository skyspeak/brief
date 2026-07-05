"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { parseApiResponse, apiError } from "@/lib/parse-api-response";
import { useAccessKey } from "../components/useAccessKey";
import AccessKeyField from "../components/AccessKeyField";

function fmtTime(unix) {
  if (!unix) return "";
  return new Date(unix * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function NewslettersPage() {
  const { key, setKey } = useAccessKey();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    if (!key.trim()) {
      setErr("Add your access key to load newsletters.");
      return;
    }
    setErr("");
    setLoading(true);
    try {
      const r = await fetch(`/api/newsletters?key=${encodeURIComponent(key)}`);
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

  function requireKey() {
    if (!key.trim()) {
      setErr("Add your access key first.");
      return false;
    }
    return true;
  }

  async function summarize(id) {
    if (!requireKey()) return;
    setSummarizing(id || "all");
    setErr("");
    setMsg("");
    try {
      const r = await fetch("/api/summarize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, id: id || undefined, force: !!id }),
      });
      const parsed = await parseApiResponse(r);
      const d = parsed.data;
      if (!d) throw new Error(apiError(parsed, "summarize failed"));
      if (!r.ok) throw new Error(apiError(parsed, "summarize failed"));
      if (d.error) throw new Error(d.error);
      if (d.summarized) {
        setMsg("Done — tap Show extract to read it.");
        setExpanded(id);
      } else if (d.skipped) {
        setMsg(d.reason || "Skipped.");
      } else if (d.results) {
        const firstErr = d.results.find((r) => r.error)?.error;
        if (firstErr) throw new Error(firstErr);
        setMsg(`Processed ${d.summarized ?? 0} of ${d.processed ?? 0}.`);
      }
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSummarizing(null);
    }
  }

  async function summarizeAll() {
    if (!requireKey()) return;
    setSummarizing("all");
    setErr("");
    setMsg("Reading newsletters…");
    try {
      let done = 0;
      for (let i = 0; i < 200; i++) {
        const r = await fetch("/api/summarize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key, limit: 1 }),
        });
        const parsed = await parseApiResponse(r);
        const d = parsed.data;
        if (!d) throw new Error(apiError(parsed, "summarize failed"));
        if (!r.ok) throw new Error(apiError(parsed, "summarize failed"));
        if ((d.remaining ?? 0) === 0) break;
        done += d.summarized ?? 0;
        setMsg(`Reading… ${done} done, ${d.remaining} remaining`);
        const firstErr = d.results?.find((x) => x.error)?.error;
        if ((d.summarized ?? 0) === 0 && firstErr) {
          if (d.rate_limited) {
            setMsg("Rate limited — pausing 15s…");
            await new Promise((x) => setTimeout(x, 15000));
            continue;
          }
          throw new Error(firstErr);
        }
      }
      setMsg("All caught up! Head to Home for the full briefing.");
      await load();
    } catch (e) {
      setErr(e.message);
      setMsg("");
    } finally {
      setSummarizing(null);
    }
  }

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Your inbox</h1>
        <p className="page-subtitle">
          Every newsletter that&apos;s arrived. Tap one to extract facts, or generate the full briefing on{" "}
          <Link href="/">Home</Link>.
        </p>
      </header>

      <div className="card">
        <AccessKeyField value={key} onChange={setKey} id="inbox-key" />
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={load}
          disabled={loading}
        >
          {loading ? "Loading…" : "Load newsletters"}
        </button>
      </div>

      {err && <div className="alert alert-error">{err}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}

      {data && (
        <>
          <div className="stats">
            <span className="stat-pill">
              <strong>{data.count}</strong> total
            </span>
            <span className="stat-pill">
              <strong>{data.with_summary}</strong> read
            </span>
            <span className="stat-pill">
              <strong>{data.pending_count}</strong> pending
            </span>
          </div>

          {data.pending_count > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={summarizeAll}
              disabled={summarizing === "all"}
              style={{ marginBottom: "1rem" }}
            >
              {summarizing === "all"
                ? "Reading all pending…"
                : `Read all pending (${data.pending_count})`}
            </button>
          )}

          {data.newsletters?.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <p>No newsletters yet.</p>
              <p>
                Subscribe using your Gmail address on{" "}
                <Link href="/confirm">Setup</Link>.
              </p>
            </div>
          )}

          {data.newsletters?.map((n) => (
            <article key={n.id} className="nl-card">
              <div className="nl-card-header">
                <div>
                  <div className="nl-meta">
                    {fmtTime(n.received_at)}
                    {n.sender && ` · ${n.sender}`}
                  </div>
                  <h2 className="nl-title">{n.subject}</h2>
                  <div className="nl-status">
                    {n.has_summary ? (
                      <span className="badge badge-ready">Ready</span>
                    ) : n.body_len > 120 ? (
                      <span className="badge badge-pending">Needs read</span>
                    ) : (
                      <span className="badge">No body</span>
                    )}
                    {n.confirmed_at && (
                      <span className="badge badge-done" style={{ marginLeft: "0.35rem" }}>
                        Subscribed
                      </span>
                    )}
                  </div>
                </div>
                {!n.has_summary && n.body_len > 120 && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => summarize(n.id)}
                    disabled={!!summarizing}
                  >
                    {summarizing === n.id ? "…" : "Read"}
                  </button>
                )}
              </div>

              {n.has_summary && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: "0.5rem" }}
                    onClick={() => setExpanded(expanded === n.id ? null : n.id)}
                  >
                    {expanded === n.id ? "Hide extract" : "Show extract"}
                  </button>
                  {expanded === n.id && <div className="nl-extract">{n.summary}</div>}
                </>
              )}
            </article>
          ))}
        </>
      )}
    </>
  );
}
