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
          body_text TEXT, summary TEXT, tags TEXT,
          received_at INTEGER, digested INTEGER DEFAULT 0
        )`);
      // Idempotent migration for any pre-v2 table.
      for (const col of ["summary TEXT", "tags TEXT"]) {
        try { await client().execute(`ALTER TABLE emails ADD COLUMN ${col}`); } catch {}
      }
    })();
  }
  return _ready;
}

export async function insertEmail(e) {
  // #region agent log
  console.error("[debug-63c155]", JSON.stringify({ hypothesisId: "C", location: "db:insertEmail", message: "insert start", data: { hasTursoUrl: !!process.env.TURSO_DATABASE_URL, hasTursoToken: !!process.env.TURSO_AUTH_TOKEN, id: e.id }, timestamp: Date.now() }));
  // #endregion
  try {
    await ready();
    await client().execute({
      sql: `INSERT OR IGNORE INTO emails (id,sender,subject,body_text,received_at)
            VALUES (?,?,?,?,?)`,
      args: [e.id, e.sender, e.subject, e.body_text, e.received_at],
    });
  } catch (err) {
    // #region agent log
    console.error("[debug-63c155]", JSON.stringify({ hypothesisId: "C", location: "db:insertEmail", message: "insert failed", data: { error: err?.message, name: err?.name }, timestamp: Date.now() }));
    // #endregion
    throw err;
  }
}

export async function updateSummary(id, summary, tags) {
  await ready();
  await client().execute({
    sql: `UPDATE emails SET summary=?, tags=? WHERE id=?`,
    args: [summary, tags, id],
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

export async function markDigested(ids) {
  if (!ids.length) return;
  await ready();
  const q = ids.map(() => "?").join(",");
  await client().execute({
    sql: `UPDATE emails SET digested=1 WHERE id IN (${q})`,
    args: ids,
  });
}
