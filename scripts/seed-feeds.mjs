#!/usr/bin/env node
/**
 * seed-feeds.mjs
 *
 * Upserts every `delivery=rss` row from data/sources.csv into the `feeds`
 * table. Idempotent: re-run after editing the CSV and only the changed fields
 * move. Rows flagged confidence=broken are skipped.
 *
 *   node scripts/seed-feeds.mjs
 *   node scripts/seed-feeds.mjs --deactivate-missing
 *
 * Requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the environment
 * (source .env.local first, or use `dotenv -e .env.local -- node ...`).
 */
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV = resolve(__dirname, "../data/sources.csv");
const DEACTIVATE_MISSING = process.argv.includes("--deactivate-missing");

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ""));
}

const rows = parseCsv(await readFile(CSV, "utf8"));
const header = rows[0];
const records = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));

const rssRows = records.filter(
  (r) => r.delivery === "rss" && r.feed_url && r.confidence !== "broken"
);
const emailOnly = records.filter((r) => r.delivery === "email");

let upserts = 0;
for (const r of rssRows) {
  await db.execute({
    sql: `INSERT INTO feeds (name, category, feed_url, site_url, weight, max_items, active)
          VALUES (?, ?, ?, ?, ?, ?, 1)
          ON CONFLICT(feed_url) DO UPDATE SET
            name      = excluded.name,
            category  = excluded.category,
            site_url  = excluded.site_url,
            weight    = excluded.weight,
            max_items = excluded.max_items,
            active    = 1`,
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

if (DEACTIVATE_MISSING) {
  const keep = rssRows.map((r) => r.feed_url);
  const placeholders = keep.map(() => "?").join(",");
  const { rowsAffected } = await db.execute({
    sql: `UPDATE feeds SET active = 0 WHERE feed_url NOT IN (${placeholders})`,
    args: keep,
  });
  console.log(`deactivated ${rowsAffected} feed(s) no longer in the CSV`);
}

console.log(`\nseeded ${upserts} rss feed(s)`);
console.log(`${emailOnly.length} source(s) marked email-only. Subscribe these to your`);
console.log(`Resend inbound address and unsubscribe your personal inbox:\n`);
for (const r of emailOnly) {
  console.log(`  ${r.name.padEnd(28)} ${r.signup_url || r.site_url}`);
}
console.log(
  `\nQuota check: ${emailOnly.length} email sources at roughly 1 send/day each` +
  ` = ~${emailOnly.length}/100 daily inbound on the Resend free tier.\n`
);
