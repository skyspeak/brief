#!/usr/bin/env node
// Seed the local database with sample newsletters for testing the ask console and digest preview.
import { createClient } from "@libsql/client";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

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

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const db = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const now = Math.floor(Date.now() / 1000);

const samples = [
  {
    id: "seed-1",
    sender: "healthtech@substack.com",
    subject: "CMS finalizes prior auth rules for 2026",
    summary:
      "CMS released final prior-authorization rules requiring payers to respond within 7 days for urgent requests. " +
      "Hospitals expect faster approvals but warn about IT integration costs. Medicare Advantage plans must comply by Q1 2026.",
    tags: "healthcare,regulation,cms",
    received_at: now - 86400 * 2,
  },
  {
    id: "seed-2",
    sender: "payerpulse@beehiiv.com",
    subject: "United-Optum consolidation ripple effects",
    summary:
      "UnitedHealth deepened vertical integration with three new ambulatory acquisitions. " +
      "Employers report tighter networks; brokers see renewed interest in reference-based pricing.",
    tags: "payers,consolidation,sales",
    received_at: now - 86400 * 3,
  },
  {
    id: "seed-3",
    sender: "aibrief@newsletter.com",
    subject: "OpenAI launches healthcare agent SDK",
    summary:
      "OpenAI announced an agent SDK with HIPAA-ready deployment options via Azure. " +
      "Early adopters are piloting prior-auth automation and member outreach bots.",
    tags: "ai,healthcare,automation",
    received_at: now - 86400 * 4,
  },
  {
    id: "seed-4",
    sender: "fintech@morningbrew.com",
    subject: "Stripe expands embedded finance for platforms",
    summary:
      "Stripe rolled out treasury and lending APIs for B2B marketplaces. " +
      "Analysts note rising competition from Adyen and Square in vertical SaaS payments.",
    tags: "fintech,payments",
    received_at: now - 86400 * 5,
  },
];

await db.execute(`
  CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY, sender TEXT, subject TEXT,
    body_text TEXT, summary TEXT, tags TEXT,
    received_at INTEGER, digested INTEGER DEFAULT 0
  )`);

for (const s of samples) {
  await db.execute({
    sql: `INSERT OR REPLACE INTO emails (id,sender,subject,body_text,summary,tags,received_at,digested)
          VALUES (?,?,?,?,?,?,?,0)`,
    args: [s.id, s.sender, s.subject, s.summary, s.summary, s.tags, s.received_at],
  });
}

console.log(`Seeded ${samples.length} sample newsletters into ${url}`);
console.log("Next: npm run dev → open http://localhost:3000 and ask a question.");
