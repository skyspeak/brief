// app/api/ingest-x/route.js — accept X bookmarks from local x_reader.py into the emails corpus.
import { isAuthorized } from "@/lib/auth";
import { insertXItem } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toUnixSec(value) {
  if (value == null || value === "") return Math.floor(Date.now() / 1000);
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  const ms = Date.parse(String(value));
  if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  return Math.floor(Date.now() / 1000);
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (!isAuthorized(req, body)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    return Response.json({ error: "items array required" }, { status: 400 });
  }

  let inserted = 0;
  let skipped = 0;
  const errors = [];

  for (const raw of items.slice(0, 200)) {
    try {
      const id = raw.id || raw.tweet_id;
      if (!id) {
        skipped++;
        continue;
      }
      const ok = await insertXItem({
        id,
        handle: raw.handle,
        author: raw.author,
        title: raw.title,
        text: raw.text,
        summary: raw.summary,
        url: raw.url,
        tweetUrl: raw.tweet_url || raw.tweetUrl,
        receivedAtSec: toUnixSec(raw.created_at || raw.saved_at || raw.received_at),
      });
      if (ok) inserted++;
      else skipped++;
    } catch (e) {
      errors.push({ id: raw?.id, error: e.message || String(e) });
    }
  }

  return Response.json({
    ok: true,
    received: items.length,
    inserted,
    skipped,
    errors: errors.slice(0, 10),
  });
}
