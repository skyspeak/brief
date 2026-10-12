#!/usr/bin/env node
// Seed sample newsletters into Supabase for testing the ask console / digest preview.
import { createClient } from "@supabase/supabase-js";
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

for (const s of samples) {
  const { error } = await db.from("emails").upsert(
    {
      id: s.id,
      sender: s.sender,
      subject: s.subject,
      body_text: s.summary,
      summary: s.summary,
      tags: s.tags,
      received_at: s.received_at,
      digested: 0,
    },
    { onConflict: "id" }
  );
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
}

console.log(`Seeded ${samples.length} sample newsletters into ${url}`);
console.log("Next: npm run dev → open http://localhost:3000 and ask a question.");
