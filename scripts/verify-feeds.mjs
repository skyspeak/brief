#!/usr/bin/env node
/**
 * verify-feeds.mjs
 *
 * Checks every rss row in data/sources.csv. For anything that fails or has no
 * feed_url, it fetches the site homepage and looks for
 *   <link rel="alternate" type="application/rss+xml" href="...">
 * plus the usual convention paths. Writes the repaired CSV back.
 *
 *   node scripts/verify-feeds.mjs                  # report only
 *   node scripts/verify-feeds.mjs --write          # repair data/sources.csv
 *   node scripts/verify-feeds.mjs --write --all    # re-verify high-confidence rows too
 *
 * Run this BEFORE seeding. It is the reason the CSV ships with a `confidence`
 * column instead of pretending every URL is correct.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Parser from "rss-parser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV = resolve(__dirname, "../data/sources.csv");
const WRITE = process.argv.includes("--write");
const ALL = process.argv.includes("--all");
const UA = "newsletter-magazine/1.0 (+personal digest)";

const parser = new Parser({ timeout: 15_000, headers: { "User-Agent": UA } });

const CONVENTIONS = ["/feed", "/feed/", "/rss", "/rss.xml", "/index.xml",
                     "/atom.xml", "/feed.xml", "/blog/rss.xml", "/?feed=rss2"];

// ── minimal CSV round-trip (handles quoted fields with commas) ───────────────
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
const esc = (v) => (/[",\n]/.test(v ?? "") ? `"${String(v).replace(/"/g, '""')}"` : v ?? "");
const toCsv = (header, objs) =>
  [header.join(","), ...objs.map((o) => header.map((h) => esc(o[h])).join(","))].join("\n") + "\n";

// ── probing ─────────────────────────────────────────────────────────────────
async function tryFeed(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const xml = await res.text();
    const feed = await parser.parseString(xml);
    const n = feed.items?.length ?? 0;
    if (n === 0) return { ok: false, reason: "empty_feed" };
    const newest = feed.items[0]?.isoDate || feed.items[0]?.pubDate || null;
    return { ok: true, url: res.url, items: n, newest, title: feed.title || null };
  } catch (e) {
    return { ok: false, reason: e?.name === "TimeoutError" ? "timeout" : String(e?.message || e).slice(0, 120) };
  }
}

async function discover(siteUrl) {
  if (!siteUrl) return null;
  const candidates = [];
  try {
    const res = await fetch(siteUrl, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const html = await res.text();
      const re = /<link[^>]+rel=["']?alternate["']?[^>]*>/gi;
      for (const tag of html.match(re) || []) {
        if (!/application\/(rss|atom)\+xml/i.test(tag)) continue;
        const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
        if (href) candidates.push(new URL(href, res.url).toString());
      }
    }
  } catch { /* fall through to conventions */ }

  for (const path of CONVENTIONS) {
    try { candidates.push(new URL(path, siteUrl).toString()); } catch {}
  }

  for (const c of [...new Set(candidates)]) {
    const r = await tryFeed(c);
    if (r.ok) return { ...r, discovered: c };
  }
  return null;
}

// ── main ────────────────────────────────────────────────────────────────────
const raw = await readFile(CSV, "utf8");
const rows = parseCsv(raw);
const header = rows[0];
const records = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));

const report = [];
let repaired = 0, broken = 0;

for (const rec of records) {
  if (rec.delivery !== "rss") continue;
  if (!ALL && rec.confidence === "high" && rec.feed_url) {
    report.push([rec.name, "skipped (high confidence)", rec.feed_url]);
    continue;
  }

  let result = rec.feed_url ? await tryFeed(rec.feed_url) : { ok: false, reason: "no_url" };

  if (result.ok) {
    rec.confidence = "verified";
    report.push([rec.name, `ok (${result.items} items, newest ${result.newest ?? "?"})`, rec.feed_url]);
    continue;
  }

  const found = await discover(rec.site_url);
  if (found) {
    rec.feed_url = found.discovered;
    rec.confidence = "verified";
    repaired++;
    report.push([rec.name, `REPAIRED (${found.items} items)`, found.discovered]);
  } else {
    rec.confidence = "broken";
    rec.notes = [rec.notes, `no feed found (${result.reason})`].filter(Boolean).join("; ");
    broken++;
    report.push([rec.name, `BROKEN (${result.reason}) -> switch to email`, rec.site_url]);
  }
}

const pad = (s, n) => String(s).padEnd(n).slice(0, n);
console.log(`\n${pad("SOURCE", 30)} ${pad("RESULT", 46)} URL`);
console.log("-".repeat(120));
for (const [a, b, c] of report) console.log(`${pad(a, 30)} ${pad(b, 46)} ${c}`);
console.log(`\nrepaired: ${repaired}   broken: ${broken}   checked: ${report.length}\n`);

if (WRITE) {
  await writeFile(CSV, toCsv(header, records));
  console.log(`wrote ${CSV}`);
} else {
  console.log("dry run. re-run with --write to save.");
}
