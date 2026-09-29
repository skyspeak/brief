// app/api/seed-feeds/route.js — upsert RSS feeds from data/sources.csv into Turso.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@libsql/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("key") === secret || url.searchParams.get("secret") === secret;
}

function parseCsv(text) {
  const rows = [];
  let row = [],
    field = "",
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v !== ""));
}

function client() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

export async function POST(req) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    const csvPath = join(process.cwd(), "data", "sources.csv");
    const rows = parseCsv(await readFile(csvPath, "utf8"));
    const header = rows[0];
    const records = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
    const rssRows = records.filter(
      (r) => r.delivery === "rss" && r.feed_url && r.confidence !== "broken"
    );

    const db = client();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS feeds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT,
        feed_url TEXT NOT NULL UNIQUE,
        site_url TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        weight INTEGER NOT NULL DEFAULT 1,
        max_items INTEGER NOT NULL DEFAULT 10,
        etag TEXT,
        last_modified TEXT,
        last_fetched_at TEXT,
        last_status TEXT,
        last_error TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);

    let upserts = 0;
    for (const r of rssRows) {
      await db.execute({
        sql: `INSERT INTO feeds (name, category, feed_url, site_url, weight, max_items, active)
              VALUES (?, ?, ?, ?, ?, ?, 1)
              ON CONFLICT(feed_url) DO UPDATE SET
                name = excluded.name,
                category = excluded.category,
                site_url = excluded.site_url,
                weight = excluded.weight,
                max_items = excluded.max_items,
                active = 1`,
        args: [
          r.name,
          r.category || null,
          r.feed_url,
          r.site_url || null,
          Number(r.weight || 1),
          Number(r.max_items || 10),
        ],
      });
      upserts++;
    }

    return Response.json({ ok: true, seeded: upserts });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req) {
  return POST(req);
}
