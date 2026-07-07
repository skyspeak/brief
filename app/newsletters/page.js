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
  const [err, setErr] = useState("");

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

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Inbox</h1>
        <p className="page-subtitle">
          Browse synced newsletters. Digests synthesize across the{" "}
          {data?.window_days ?? 3}-day window on <Link href="/">Home</Link> — not one-by-one.
        </p>
      </header>

      <div className="card">
        <AccessKeyField value={key} onChange={setKey} />
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

      {data && (
        <>
          <div className="stats">
            <span className="stat-pill">
              <strong>{data.count}</strong> synced
            </span>
            <span className="stat-pill">
              <strong>{data.in_digest_window}</strong> in {data.window_days}-day window
            </span>
          </div>

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
                    {n.body_len > 120 ? (
                      <span className="badge badge-ready">In corpus</span>
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
              </div>
            </article>
          ))}
        </>
      )}
    </>
  );
}
