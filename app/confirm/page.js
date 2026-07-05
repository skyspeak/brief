"use client";

import { useState, useEffect, useCallback } from "react";
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

function ConfirmCard({ c, keyVal, onConfirmed }) {
  const [marking, setMarking] = useState(false);
  const done = c.status === "confirmed";

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

  return (
    <article className={`confirm-card${done ? " done" : ""}`}>
      <div className="nl-meta">
        {fmtTime(c.received_at)}
        {c.sender && ` · ${c.sender}`}
        {done && (
          <span className="badge badge-ready" style={{ marginLeft: "0.5rem" }}>
            Confirmed
          </span>
        )}
      </div>

      <h2 className="nl-title">{c.subject}</h2>

      {c.snippet && (
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
          {c.snippet}
        </p>
      )}

      {!done && c.primaryLink && (
        <div className="confirm-actions">
          <a
            href={c.primaryLink}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            onClick={() => {
              fetch("/api/confirmations", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ key: keyVal, id: c.id }),
              })
                .then(() => onConfirmed())
                .catch(() => {});
            }}
          >
            Confirm subscription ↗
          </a>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={markDone}
            disabled={marking}
          >
            {marking ? "…" : "Mark done"}
          </button>
        </div>
      )}

      {!done && !c.primaryLink && (
        <div className="alert alert-warning" style={{ marginBottom: 0 }}>
          We found a confirmation email but no link — try the links below or re-send the signup email.
        </div>
      )}

      {c.linkDetails?.length > 0 && (
        <details style={{ marginTop: "0.75rem", fontSize: "0.875rem" }}>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>
            {c.linkDetails.length} link{c.linkDetails.length > 1 ? "s" : ""} found
          </summary>
          <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem", lineHeight: 1.6 }}>
            {c.linkDetails.map((l) => (
              <li key={l.url} style={{ marginBottom: "0.5rem" }}>
                {l.label && <strong style={{ display: "block", fontSize: "0.8125rem" }}>{l.label}</strong>}
                <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ wordBreak: "break-all" }}>
                  {l.url.length > 72 ? l.url.slice(0, 72) + "…" : l.url}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

export default function SetupPage() {
  const { key, setKey } = useAccessKey();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [gmail, setGmail] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadGmail = useCallback(async () => {
    if (!key.trim()) return;
    try {
      const r = await fetch(`/api/gmail/status?key=${encodeURIComponent(key)}`);
      const parsed = await parseApiResponse(r);
      if (parsed.data && r.ok) setGmail(parsed.data);
    } catch {
      setGmail(null);
    }
  }, [key]);

  const load = useCallback(async () => {
    if (!key.trim()) {
      setErr("Add your access key to load confirmations.");
      return;
    }
    setErr("");
    setLoading(true);
    try {
      await loadGmail();
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
  }, [key, loadGmail]);

  useEffect(() => {
    if (!autoRefresh || !key.trim()) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [autoRefresh, key, load]);

  function connectGmail() {
    if (!key.trim()) {
      setErr("Add your access key first.");
      return;
    }
    window.location.href = `/api/gmail/auth?key=${encodeURIComponent(key)}`;
  }

  async function syncInbox() {
    if (!key.trim()) {
      setErr("Add your access key first.");
      return;
    }
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
      const trashed = d.trashed ? `, ${d.trashed} trashed` : "";
      setSyncMsg(
        `Synced ${d.ingested} new message${d.ingested === 1 ? "" : "s"} (${d.checked} checked${trashed}).`
      );
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSyncing(false);
    }
  }

  function copyAddress() {
    const addr = data?.inbound_address || gmail?.email;
    if (!addr) return;
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const pending = data?.pending_list || [];
  const confirmed = data?.confirmed_list || [];
  const manual = (data?.confirmations || []).filter((c) => c.status === "manual");
  const gmailAddress = data?.inbound_address || gmail?.email;

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Setup</h1>
        <p className="page-subtitle">
          Connect your personal Gmail — newsletters arrive there, we sync and summarize them, and digests
          send from the same account.
        </p>
      </header>

      <div className="card">
        <h2 className="card-title">1. Connect Gmail</h2>
        <AccessKeyField value={key} onChange={setKey} id="setup-key" onBlur={loadGmail} />

        {gmail?.connected ? (
          <div className="alert alert-success" style={{ marginBottom: "1rem" }}>
            Connected as <strong>{gmail.email || "your account"}</strong>
            {gmail.last_sync_at && (
              <span> · last sync {fmtTime(gmail.last_sync_at)}</span>
            )}
          </div>
        ) : gmail?.oauth_configured === false ? (
          <div className="alert alert-warning" style={{ marginBottom: "1rem" }}>
            Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in Vercel, then redeploy.
          </div>
        ) : (
          <div className="alert alert-info" style={{ marginBottom: "1rem" }}>
            Sign in with Google so we can read your newsletters and send digests from your address.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {!gmail?.connected && (
            <button type="button" className="btn btn-primary btn-block" onClick={connectGmail}>
              Connect Gmail
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={syncInbox}
            disabled={syncing || !gmail?.connected}
          >
            {syncing ? "Syncing inbox…" : "Sync inbox now"}
          </button>
        </div>
        {syncMsg && <div className="alert alert-success" style={{ marginTop: "1rem", marginBottom: 0 }}>{syncMsg}</div>}
      </div>

      <div className="card">
        <h2 className="card-title">2. Subscribe to newsletters</h2>
        <ol className="steps">
          <li className="step">
            <span className="step-num">1</span>
            <span>Use your Gmail address when signing up for newsletters</span>
          </li>
          <li className="step">
            <span className="step-num">2</span>
            <span>Tap Sync inbox — confirmation emails appear below</span>
          </li>
          <li className="step">
            <span className="step-num">3</span>
            <span>Confirm subscriptions, then generate your briefing on Home</span>
          </li>
        </ol>

        {gmailAddress ? (
          <div className="copy-box">
            <code>{gmailAddress}</code>
            <button type="button" className="btn btn-primary btn-sm" onClick={copyAddress}>
              {copied ? "Copied!" : "Copy address"}
            </button>
          </div>
        ) : (
          <div className="alert alert-info">
            Connect Gmail above to show your address here.
          </div>
        )}

        <p className="field-hint" style={{ marginBottom: 0 }}>
          Tip: create a Gmail filter to label subscription mail (e.g. &quot;Newsletters&quot;) and set{" "}
          <code>GMAIL_LABEL=Newsletters</code> in Vercel so sync ignores personal email. Summarized
          newsletters are moved to Gmail Trash automatically (recoverable for 30 days).
        </p>
      </div>

      <div className="card">
        <h2 className="card-title">3. Confirm subscriptions</h2>
        <button type="button" className="btn btn-primary btn-block" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Check for confirmations"}
        </button>

        <label className="checkbox-label" style={{ marginTop: "1rem", marginBottom: 0 }}>
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Auto-refresh every 15 seconds while waiting
        </label>
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      {data && (
        <>
          <div className="stats">
            <span className="stat-pill">
              <strong>{data.pending}</strong> pending
            </span>
            <span className="stat-pill">
              <strong>{data.confirmed}</strong> confirmed
            </span>
            {data.needs_manual > 0 && (
              <span className="stat-pill">
                <strong>{data.needs_manual}</strong> need review
              </span>
            )}
          </div>

          {pending.length === 0 && confirmed.length === 0 && manual.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">✉️</div>
              <p>No confirmation emails yet.</p>
              <p>Subscribe using your Gmail address, sync inbox, then check again.</p>
            </div>
          )}

          {pending.length > 0 && (
            <>
              <h3 className="section-heading">Waiting for you ({pending.length})</h3>
              {pending.map((c) => (
                <ConfirmCard key={c.id} c={c} keyVal={key} onConfirmed={load} />
              ))}
            </>
          )}

          {manual.length > 0 && (
            <>
              <h3 className="section-heading">Needs review ({manual.length})</h3>
              {manual.map((c) => (
                <ConfirmCard key={c.id} c={c} keyVal={key} onConfirmed={load} />
              ))}
            </>
          )}

          {confirmed.length > 0 && (
            <>
              <h3 className="section-heading">Done ({confirmed.length})</h3>
              {confirmed.map((c) => (
                <ConfirmCard key={c.id} c={c} keyVal={key} onConfirmed={load} />
              ))}
            </>
          )}
        </>
      )}

      <p style={{ marginTop: "1.5rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>
        After newsletters are flowing, go to <Link href="/">Home</Link> to generate your briefing or send a
        digest email.
      </p>
    </>
  );
}
