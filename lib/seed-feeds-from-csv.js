// lib/seed-feeds-from-csv.js — upsert RSS rows from data/sources.csv into Turso.
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { countFeeds, upsertFeedFromCsv, deactivateFeedsNotIn } from "@/lib/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV = resolve(__dirname, "../data/sources.csv");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let q = false;
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

export async function loadRssSourcesFromCsv() {
  const text = await readFile(CSV, "utf8");
  const rows = parseCsv(text);
  if (!rows.length) return { rssRows: [], emailOnly: [] };
  const header = rows[0];
  const records = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
  const rssRows = records.filter(
    (r) => r.delivery === "rss" && r.feed_url && r.confidence !== "broken"
  );
  const emailOnly = records.filter((r) => r.delivery === "email");
  return { rssRows, emailOnly };
}

/** Idempotent upsert of all active RSS feeds from the CSV. */
export async function seedFeedsFromCsv({ deactivateMissing = false } = {}) {
  const { rssRows, emailOnly } = await loadRssSourcesFromCsv();
  let upserts = 0;
  for (const r of rssRows) {
    await upsertFeedFromCsv(r);
    upserts++;
  }
  let deactivated = 0;
  if (deactivateMissing) {
    deactivated = await deactivateFeedsNotIn(rssRows.map((r) => r.feed_url));
  }
  return { upserts, deactivated, emailOnlyCount: emailOnly.length, emailOnly };
}

/**
 * If the feeds table is empty, seed from CSV so cron ingest works without a
 * manual `npm run seed-feeds` step.
 */
export async function ensureFeedsSeeded() {
  const { total, active } = await countFeeds();
  if (active > 0) return { seeded: false, total, active };
  const result = await seedFeedsFromCsv();
  return { seeded: true, ...result, total: result.upserts, active: result.upserts };
}
