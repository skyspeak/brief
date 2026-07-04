// lib/db.js — Turso/libSQL. v2 adds summary + tags (filled at ingest).
import { createClient } from "@libsql/client";

let _client;
function client() {
  if (!_client) {
    _client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _client;
}

let _ready;
function ready() {
  if (!_ready) {
    _ready = (async () => {
      await client().execute(`
        CREATE TABLE IF NOT EXISTS emails (
          id TEXT PRIMARY KEY, sender TEXT, subject TEXT,
          body_text TEXT, body_html TEXT, summary TEXT, tags TEXT,
          received_at INTEGER, digested INTEGER DEFAULT 0,
          confirmed_at INTEGER
        )`);
      // Idempotent migration for any pre-v2 table.
      for (const col of [
        "summary TEXT",
        "tags TEXT",
        "body_html TEXT",
        "confirmed_at INTEGER",
      ]) {
        try { await client().execute(`ALTER TABLE emails ADD COLUMN ${col}`); } catch {}
      }
      await client().execute(`
        CREATE TABLE IF NOT EXISTS app_state (
          key TEXT PRIMARY KEY,
          value TEXT
        )`);
    })();
  }
  return _ready;
}

export async function insertEmail(e) {
  await ready();
  await client().execute({
    sql: `INSERT INTO emails (id,sender,subject,body_text,body_html,received_at)
          VALUES (?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET
            sender = excluded.sender,
            subject = excluded.subject,
            body_text = CASE WHEN length(excluded.body_text) > length(COALESCE(emails.body_text,''))
              THEN excluded.body_text ELSE emails.body_text END,
            body_html = CASE WHEN length(COALESCE(excluded.body_html,'')) > length(COALESCE(emails.body_html,''))
              THEN excluded.body_html ELSE emails.body_html END`,
    args: [e.id, e.sender, e.subject, e.body_text, e.body_html || null, e.received_at],
  });
}

export async function markEmailConfirmed(id) {
  await ready();
  await client().execute({
    sql: `UPDATE emails SET confirmed_at = ? WHERE id = ?`,
    args: [Math.floor(Date.now() / 1000), id],
  });
}

export async function updateSummary(id, summary, tags) {
  await ready();
  await client().execute({
    sql: `UPDATE emails SET summary=?, tags=? WHERE id=?`,
    args: [summary, tags, id],
  });
}

export async function updateBodyText(id, body_text) {
  await ready();
  await client().execute({
    sql: `UPDATE emails SET body_text=? WHERE id=?`,
    args: [body_text, id],
  });
}

// Window selection (used by the weekly digest).
export async function recentEmails(sinceSec) {
  await ready();
  const r = await client().execute({
    sql: `SELECT id,sender,subject,body_text,summary,tags,received_at
          FROM emails WHERE received_at >= ? ORDER BY received_at ASC`,
    args: [sinceSec],
  });
  return r.rows;
}

// Whole-corpus selection (used by the ask console). Summaries only, newest first.
export async function allSummaries(limit = 500) {
  await ready();
  const r = await client().execute({
    sql: `SELECT id,sender,subject,summary,tags,received_at
          FROM emails ORDER BY received_at DESC LIMIT ?`,
    args: [limit],
  });
  return r.rows;
}

export async function getEmailById(id) {
  await ready();
  const r = await client().execute({
    sql: `SELECT id,sender,subject,body_text,body_html,summary,tags,received_at,confirmed_at
          FROM emails WHERE id = ?`,
    args: [id],
  });
  return r.rows[0] || null;
}

/** Emails with body but no summary yet (for ad-hoc summarize). */
export async function unsummarizedEmails(limit = 30) {
  await ready();
  const r = await client().execute({
    sql: `SELECT id,sender,subject,body_text,body_html,summary,received_at
          FROM emails
          WHERE (summary IS NULL OR length(summary) = 0)
            AND body_text IS NOT NULL AND length(body_text) > 120
          ORDER BY received_at DESC LIMIT ?`,
    args: [limit],
  });
  return r.rows;
}

/** All newsletters with stored body or HTML (for corpus clean + briefing). */
export async function allEmailsWithBodies(limit = 500) {
  await ready();
  const r = await client().execute({
    sql: `SELECT id,sender,subject,body_text,body_html,summary,tags,received_at
          FROM emails
          WHERE (body_text IS NOT NULL AND length(body_text) > 0)
             OR (body_html IS NOT NULL AND length(body_html) > 0)
          ORDER BY received_at ASC LIMIT ?`,
    args: [limit],
  });
  return r.rows;
}

/** Newsletters eligible for map-step (optionally include already-summarized when force). */
export async function emailsToSummarize({ force = false, limit = 1 } = {}) {
  await ready();
  const sql = force
    ? `SELECT id,sender,subject,body_text,body_html,summary,received_at
       FROM emails
       WHERE body_text IS NOT NULL AND length(body_text) > 120
       ORDER BY received_at ASC LIMIT ?`
    : `SELECT id,sender,subject,body_text,body_html,summary,received_at
       FROM emails
       WHERE (summary IS NULL OR length(summary) = 0)
         AND body_text IS NOT NULL AND length(body_text) > 120
       ORDER BY received_at ASC LIMIT ?`;
  const r = await client().execute({ sql, args: [limit] });
  return r.rows;
}

/** All newsletters with summary or clean body for briefing reduce step. */
export async function allEmailsForBriefing(limit = 500) {
  await ready();
  const r = await client().execute({
    sql: `SELECT id,sender,subject,body_text,body_html,summary,tags,received_at
          FROM emails
          WHERE body_text IS NOT NULL AND length(body_text) > 120
          ORDER BY received_at ASC LIMIT ?`,
    args: [limit],
  });
  return r.rows;
}

/** Full newsletter list for neutral browse view. */
export async function listNewsletters(limit = 100) {
  await ready();
  const r = await client().execute({
    sql: `SELECT id, sender, subject, summary, tags, received_at, confirmed_at,
                 length(body_text) AS body_len,
                 length(summary) AS summary_len
          FROM emails
          ORDER BY received_at DESC LIMIT ?`,
    args: [limit],
  });
  return r.rows.map((row) => ({
    id: row.id,
    sender: row.sender,
    subject: row.subject || "(no subject)",
    summary: row.summary || "",
    tags: row.tags || "",
    received_at: row.received_at,
    confirmed_at: row.confirmed_at || null,
    body_len: Number(row.body_len ?? 0),
    summary_len: Number(row.summary_len ?? 0),
    has_summary: Number(row.summary_len ?? 0) > 0,
  }));
}

/** Recent emails with body (for confirmation link extraction). */
export async function recentEmailsWithBody(limit = 80) {
  await ready();
  const r = await client().execute({
    sql: `SELECT id, sender, subject, body_text, body_html, received_at, confirmed_at
          FROM emails
          WHERE (body_text IS NOT NULL AND length(body_text) > 0)
             OR (body_html IS NOT NULL AND length(body_html) > 0)
          ORDER BY received_at DESC LIMIT ?`,
    args: [limit],
  });
  return r.rows;
}

export async function markDigested(ids) {
  if (!ids.length) return;
  await ready();
  const q = ids.map(() => "?").join(",");
  await client().execute({
    sql: `UPDATE emails SET digested=1 WHERE id IN (${q})`,
    args: ids,
  });
}

const LAST_DIGEST_KEY = "last_digest_at";

export async function getLastDigestRun() {
  await ready();
  const r = await client().execute({
    sql: `SELECT value FROM app_state WHERE key = ?`,
    args: [LAST_DIGEST_KEY],
  });
  const v = r.rows[0]?.value;
  return v ? Number(v) : null;
}

export async function setLastDigestRun(unixSec) {
  await ready();
  await client().execute({
    sql: `INSERT INTO app_state (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [LAST_DIGEST_KEY, String(unixSec)],
  });
}

/** Pipeline stats for /api/status — counts + recent rows (metadata only). */
export async function emailStatus(recentLimit = 10) {
  await ready();

  const counts = await client().execute(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN body_text IS NOT NULL AND length(body_text) > 0 THEN 1 ELSE 0 END) AS with_body,
      SUM(CASE WHEN summary IS NOT NULL AND length(summary) > 0 THEN 1 ELSE 0 END) AS with_summary,
      SUM(CASE WHEN digested = 1 THEN 1 ELSE 0 END) AS digested
    FROM emails`);

  const recent = await client().execute({
    sql: `SELECT id, sender, subject, received_at,
                 length(body_text) AS body_len,
                 length(summary) AS summary_len,
                 tags, digested
          FROM emails ORDER BY received_at DESC LIMIT ?`,
    args: [recentLimit],
  });

  const c = counts.rows[0] || {};
  return {
    counts: {
      total: Number(c.total ?? 0),
      with_body: Number(c.with_body ?? 0),
      with_summary: Number(c.with_summary ?? 0),
      digested: Number(c.digested ?? 0),
    },
    recent: recent.rows.map((r) => ({
      id: r.id,
      sender: r.sender,
      subject: r.subject,
      received_at: r.received_at,
      body_len: Number(r.body_len ?? 0),
      summary_len: Number(r.summary_len ?? 0),
      tags: r.tags || "",
      digested: !!r.digested,
    })),
  };
}
