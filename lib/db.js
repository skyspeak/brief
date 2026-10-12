// lib/db.js — Supabase Postgres (replaces Turso/libSQL).
import { createClient } from "@supabase/supabase-js";

let _client;

function db() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel"
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export function supabaseConfigured() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  return !!(url && key);
}

function throwIf(error) {
  if (error) throw new Error(error.message || String(error));
}

function len(s) {
  return s == null ? 0 : String(s).length;
}

function hasBodyText(row, min = 1) {
  return len(row?.body_text) >= min;
}

export async function insertEmail(e) {
  const { data: existing, error: readErr } = await db()
    .from("emails")
    .select("body_text, body_html")
    .eq("id", e.id)
    .maybeSingle();
  throwIf(readErr);

  const body_text =
    existing && len(existing.body_text) > len(e.body_text)
      ? existing.body_text
      : e.body_text;
  const body_html =
    existing && len(existing.body_html) > len(e.body_html || "")
      ? existing.body_html
      : e.body_html || null;

  const { error } = await db().from("emails").upsert(
    {
      id: e.id,
      sender: e.sender,
      subject: e.subject,
      body_text,
      body_html,
      received_at: e.received_at,
    },
    { onConflict: "id" }
  );
  throwIf(error);
}

export async function markEmailConfirmed(id) {
  const { error } = await db()
    .from("emails")
    .update({ confirmed_at: Math.floor(Date.now() / 1000) })
    .eq("id", id);
  throwIf(error);
}

export async function updateSummary(id, summary, tags) {
  const { error } = await db()
    .from("emails")
    .update({ summary, tags })
    .eq("id", id);
  throwIf(error);
}

export async function updateBodyText(id, body_text) {
  const { error } = await db()
    .from("emails")
    .update({ body_text })
    .eq("id", id);
  throwIf(error);
}

export async function recentEmails(sinceSec) {
  const { data, error } = await db()
    .from("emails")
    .select("id,sender,subject,body_text,body_html,summary,tags,received_at")
    .gte("received_at", sinceSec)
    .order("received_at", { ascending: true });
  throwIf(error);
  return data || [];
}

export async function allSummaries(limit = 500) {
  const { data, error } = await db()
    .from("emails")
    .select("id,sender,subject,summary,tags,received_at")
    .order("received_at", { ascending: false })
    .limit(limit);
  throwIf(error);
  return data || [];
}

export async function getEmailById(id) {
  const { data, error } = await db()
    .from("emails")
    .select(
      "id,sender,subject,body_text,body_html,summary,tags,received_at,confirmed_at"
    )
    .eq("id", id)
    .maybeSingle();
  throwIf(error);
  return data || null;
}

export async function unsummarizedEmails(limit = 30) {
  const { data, error } = await db()
    .from("emails")
    .select("id,sender,subject,body_text,body_html,summary,received_at")
    .order("received_at", { ascending: false })
    .limit(Math.max(limit * 5, 100));
  throwIf(error);
  return (data || [])
    .filter((r) => !hasBodyText({ body_text: r.summary }, 1) && hasBodyText(r, 120))
    .slice(0, limit);
}

export async function allEmailsWithBodies(limit = 500) {
  const { data, error } = await db()
    .from("emails")
    .select("id,sender,subject,body_text,body_html,summary,tags,received_at")
    .order("received_at", { ascending: true })
    .limit(Math.max(limit * 2, limit));
  throwIf(error);
  return (data || [])
    .filter((r) => hasBodyText(r, 1) || len(r.body_html) > 0)
    .slice(0, limit);
}

export async function emailsToSummarize({ force = false, limit = 1 } = {}) {
  const { data, error } = await db()
    .from("emails")
    .select("id,sender,subject,body_text,body_html,summary,received_at")
    .order("received_at", { ascending: true })
    .limit(Math.max(limit * 20, 50));
  throwIf(error);
  return (data || [])
    .filter((r) => {
      if (!hasBodyText(r, 120)) return false;
      if (force) return true;
      return !hasBodyText({ body_text: r.summary }, 1);
    })
    .slice(0, limit);
}

export async function allEmailsForBriefing(limit = 500) {
  const { data, error } = await db()
    .from("emails")
    .select("id,sender,subject,body_text,body_html,summary,tags,received_at")
    .order("received_at", { ascending: true })
    .limit(Math.max(limit * 2, limit));
  throwIf(error);
  return (data || []).filter((r) => hasBodyText(r, 120)).slice(0, limit);
}

export async function listNewsletters(limit = 100) {
  const { data, error } = await db()
    .from("emails")
    .select(
      "id, sender, subject, summary, tags, received_at, confirmed_at, body_text"
    )
    .order("received_at", { ascending: false })
    .limit(limit);
  throwIf(error);
  return (data || []).map((row) => {
    const body_len = len(row.body_text);
    const summary_len = len(row.summary);
    return {
      id: row.id,
      sender: row.sender,
      subject: row.subject || "(no subject)",
      summary: row.summary || "",
      tags: row.tags || "",
      received_at: row.received_at,
      confirmed_at: row.confirmed_at || null,
      body_len,
      summary_len,
      has_summary: summary_len > 0,
    };
  });
}

export async function recentEmailsWithBody(limit = 80) {
  const { data, error } = await db()
    .from("emails")
    .select("id, sender, subject, body_text, body_html, received_at, confirmed_at")
    .order("received_at", { ascending: false })
    .limit(Math.max(limit * 2, limit));
  throwIf(error);
  return (data || [])
    .filter((r) => hasBodyText(r, 1) || len(r.body_html) > 0)
    .slice(0, limit);
}

export async function markDigested(ids) {
  if (!ids.length) return;
  const { error } = await db()
    .from("emails")
    .update({ digested: 1 })
    .in("id", ids);
  throwIf(error);
}

const LAST_DIGEST_KEY = "last_digest_at";

export async function getLastDigestRun() {
  const v = await getAppState(LAST_DIGEST_KEY);
  return v ? Number(v) : null;
}

export async function setLastDigestRun(unixSec) {
  await setAppState(LAST_DIGEST_KEY, String(unixSec));
}

export async function getAppState(key) {
  const { data, error } = await db()
    .from("app_state")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  throwIf(error);
  return data?.value ?? null;
}

export async function setAppState(key, value) {
  const { error } = await db()
    .from("app_state")
    .upsert({ key, value }, { onConflict: "key" });
  throwIf(error);
}

const LAST_GMAIL_SYNC_KEY = "last_gmail_sync_at";

export async function getLastGmailSync() {
  const v = await getAppState(LAST_GMAIL_SYNC_KEY);
  return v ? Number(v) : null;
}

export async function setLastGmailSync(unixSec) {
  await setAppState(LAST_GMAIL_SYNC_KEY, String(unixSec));
}

export async function emailExists(id) {
  const { data, error } = await db()
    .from("emails")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  throwIf(error);
  return !!data;
}

// ── RSS feeds ───────────────────────────────────────────────────────────────

export async function listActiveFeeds() {
  const { data, error } = await db()
    .from("feeds")
    .select(
      "id, name, feed_url, category, max_items, etag, last_modified, consecutive_failures"
    )
    .eq("active", 1);
  throwIf(error);
  return data || [];
}

export async function countFeeds() {
  const { count: total, error: e1 } = await db()
    .from("feeds")
    .select("*", { count: "exact", head: true });
  throwIf(e1);
  const { count: active, error: e2 } = await db()
    .from("feeds")
    .select("*", { count: "exact", head: true })
    .eq("active", 1);
  throwIf(e2);
  return { total: total ?? 0, active: active ?? 0 };
}

export async function upsertFeedFromCsv(r) {
  const patch = {
    name: r.name,
    category: r.category || null,
    site_url: r.site_url || null,
    weight: Number(r.weight || 1),
    max_items: Number(r.max_items || 10),
    active: 1,
  };
  const { data: existing, error: readErr } = await db()
    .from("feeds")
    .select("id")
    .eq("feed_url", r.feed_url)
    .maybeSingle();
  throwIf(readErr);
  if (existing?.id) {
    const { error } = await db().from("feeds").update(patch).eq("id", existing.id);
    throwIf(error);
    return;
  }
  const { error } = await db()
    .from("feeds")
    .insert({ ...patch, feed_url: r.feed_url });
  throwIf(error);
}

export async function deactivateFeedsNotIn(feedUrls) {
  if (!feedUrls.length) return 0;
  const keep = new Set(feedUrls);
  const { data, error } = await db()
    .from("feeds")
    .select("id, feed_url")
    .eq("active", 1);
  throwIf(error);
  const ids = (data || []).filter((f) => !keep.has(f.feed_url)).map((f) => f.id);
  if (!ids.length) return 0;
  const { error: updErr } = await db()
    .from("feeds")
    .update({ active: 0 })
    .in("id", ids);
  throwIf(updErr);
  return ids.length;
}

export async function insertRssItem({ hash, sourceName, title, url, body, receivedAtSec }) {
  const id = `rss:${hash}`;
  const body_text = url ? `Article: ${url}\n\n${body || ""}` : body || "";
  const { error } = await db().from("emails").insert({
    id,
    sender: sourceName,
    subject: title || null,
    body_text,
    source_type: "rss",
    source_url: url || null,
    received_at: receivedAtSec,
  });
  if (error) {
    if (error.code === "23505") return false;
    throwIf(error);
  }
  return true;
}

export async function insertXItem({
  id,
  handle,
  author,
  title,
  text,
  summary,
  url,
  tweetUrl,
  receivedAtSec,
}) {
  const xid = String(id || "").replace(/^x:/, "");
  if (!xid) return false;
  const emailId = `x:${xid}`;
  const sender = handle ? `@${String(handle).replace(/^@/, "")}` : author || "X bookmark";
  const subject =
    (title && String(title).trim()) ||
    (text && String(text).trim().slice(0, 120)) ||
    `X bookmark ${sender}`;
  const parts = [];
  if (tweetUrl) parts.push(`Tweet: ${tweetUrl}`);
  if (url) parts.push(`Link: ${url}`);
  if (text) parts.push("", String(text).trim());
  if (summary) parts.push("", "Summary:", String(summary).trim());
  const body_text = parts.join("\n").trim();
  const sourceUrl = url || tweetUrl || null;
  const { error } = await db().from("emails").insert({
    id: emailId,
    sender,
    subject,
    body_text,
    summary: summary || null,
    source_type: "x",
    source_url: sourceUrl,
    received_at: receivedAtSec || Math.floor(Date.now() / 1000),
  });
  if (error) {
    if (error.code === "23505") return false;
    throwIf(error);
  }
  return true;
}

export async function markFeedNotModified(id) {
  const { error } = await db()
    .from("feeds")
    .update({
      last_fetched_at: new Date().toISOString(),
      last_status: "not_modified",
      consecutive_failures: 0,
    })
    .eq("id", id);
  throwIf(error);
}

export async function markFeedOk(id, etag, lastModified) {
  const { error } = await db()
    .from("feeds")
    .update({
      last_fetched_at: new Date().toISOString(),
      last_status: "ok",
      last_error: null,
      consecutive_failures: 0,
      etag: etag || null,
      last_modified: lastModified || null,
    })
    .eq("id", id);
  throwIf(error);
}

export async function markFeedFailure(id, status, errorMsg, previousFailures = 0) {
  const disableAfter = Number(process.env.RSS_DISABLE_AFTER_FAILURES || 8);
  const fails = previousFailures + 1;
  const { error } = await db()
    .from("feeds")
    .update({
      last_fetched_at: new Date().toISOString(),
      last_status: status,
      last_error: errorMsg || null,
      consecutive_failures: fails,
      active: fails >= disableAfter ? 0 : 1,
    })
    .eq("id", id);
  throwIf(error);
}

export async function emailStatus(recentLimit = 10) {
  const { count: total, error: e1 } = await db()
    .from("emails")
    .select("*", { count: "exact", head: true });
  throwIf(e1);

  const { data: sample, error: e2 } = await db()
    .from("emails")
    .select("id, sender, subject, received_at, body_text, summary, tags, digested")
    .order("received_at", { ascending: false })
    .limit(500);
  throwIf(e2);

  const rows = sample || [];
  const with_body = rows.filter((r) => hasBodyText(r, 1)).length;
  const with_summary = rows.filter((r) => hasBodyText({ body_text: r.summary }, 1)).length;
  const digested = rows.filter((r) => !!r.digested).length;
  // Scale approximate counts if corpus > sample (status is advisory).
  const scale = total > rows.length && rows.length ? total / rows.length : 1;

  const recent = rows.slice(0, recentLimit).map((r) => ({
    id: r.id,
    sender: r.sender,
    subject: r.subject,
    received_at: r.received_at,
    body_len: len(r.body_text),
    summary_len: len(r.summary),
    tags: r.tags || "",
    digested: !!r.digested,
  }));

  return {
    counts: {
      total: total ?? 0,
      with_body: Math.round(with_body * scale),
      with_summary: Math.round(with_summary * scale),
      digested: Math.round(digested * scale),
    },
    recent,
  };
}

// ── Bartma Brief tracker ────────────────────────────────────────────────────

const BARTMA_ISSUE_KEY = "bartma_issue_number";

export async function getBartmaIssueNumber() {
  const v = await getAppState(BARTMA_ISSUE_KEY);
  return v ? Number(v) : 0;
}

export async function setBartmaIssueNumber(n) {
  await setAppState(BARTMA_ISSUE_KEY, String(n));
}

export async function listBartmaOpportunities({ status, limit = 200 } = {}) {
  let q = db()
    .from("bartma_opportunities")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  throwIf(error);
  return data || [];
}

export async function bartmaOpportunityExists({ id, url }) {
  if (id) {
    const { data, error } = await db()
      .from("bartma_opportunities")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    throwIf(error);
    if (data) return data;
  }
  if (url) {
    const { data, error } = await db()
      .from("bartma_opportunities")
      .select("id, status")
      .eq("url", url)
      .maybeSingle();
    throwIf(error);
    if (data) return data;
  }
  return null;
}

export async function upsertBartmaOpportunity(row) {
  const now = Math.floor(Date.now() / 1000);
  const { error } = await db().from("bartma_opportunities").upsert(
    {
      id: row.id,
      company: row.company,
      role: row.role,
      track: row.track || null,
      url: row.url || null,
      score: row.score ?? null,
      status: row.status || "Sent",
      rationale: row.rationale || null,
      warm_path: row.warm_path || null,
      caveat: row.caveat || null,
      issue_number: row.issue_number ?? null,
      sent_at: row.sent_at ?? null,
      created_at: row.created_at ?? now,
      updated_at: now,
    },
    { onConflict: "id" }
  );
  throwIf(error);
}
