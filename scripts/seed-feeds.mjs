#!/usr/bin/env node
/**
 * seed-feeds.mjs — upsert RSS rows from data/sources.csv into Supabase.
 *
 *   node scripts/seed-feeds.mjs
 *   node scripts/seed-feeds.mjs --deactivate-missing
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local).
 * Schema must already exist (run supabase/schema.sql in the SQL editor).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const CSV = resolve(root, "data/sources.csv");
const DEACTIVATE_MISSING = process.argv.includes("--deactivate-missing");

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
    }
    break;
  }
}

loadEnv();

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

const rows = parseCsv(await readFile(CSV, "utf8"));
const header = rows[0];
const records = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));

const rssRows = records.filter(
  (r) => r.delivery === "rss" && r.feed_url && r.confidence !== "broken"
);
const emailOnly = records.filter((r) => r.delivery === "email");

let upserts = 0;
for (const r of rssRows) {
  const patch = {
    name: r.name,
    category: r.category || null,
    site_url: r.site_url || null,
    weight: Number(r.weight || 1),
    max_items: Number(r.max_items || 10),
    active: 1,
  };
  const { data: existing, error: readErr } = await db
    .from("feeds")
    .select("id")
    .eq("feed_url", r.feed_url)
    .maybeSingle();
  if (readErr) {
    console.error(readErr.message);
    process.exit(1);
  }
  const { error } = existing?.id
    ? await db.from("feeds").update(patch).eq("id", existing.id)
    : await db.from("feeds").insert({ ...patch, feed_url: r.feed_url });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  upserts++;
}

if (DEACTIVATE_MISSING) {
  const keep = new Set(rssRows.map((r) => r.feed_url));
  const { data, error } = await db.from("feeds").select("id, feed_url").eq("active", 1);
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  const ids = (data || []).filter((f) => !keep.has(f.feed_url)).map((f) => f.id);
  if (ids.length) {
    const { error: updErr } = await db.from("feeds").update({ active: 0 }).in("id", ids);
    if (updErr) {
      console.error(updErr.message);
      process.exit(1);
    }
    console.log(`deactivated ${ids.length} feed(s) no longer in the CSV`);
  }
}

console.log(`\nseeded ${upserts} rss feed(s)`);
console.log(`${emailOnly.length} source(s) marked email-only. Subscribe these to your Gmail address:\n`);
for (const r of emailOnly) {
  console.log(`  ${r.name.padEnd(28)} ${r.signup_url || r.site_url}`);
}
console.log("");
