#!/usr/bin/env node
/**
 * Print fresh long-lived secrets for Vercel.
 *
 *   node scripts/gen-secrets.mjs
 *
 * Paste ACCESS_KEY into the app UI. Paste CRON_SECRET into Vercel → Cron
 * (or let Vercel keep using the same Bearer value). Both are opaque strings
 * that never expire — rotate either independently anytime.
 */
import { randomBytes } from "node:crypto";

const access = randomBytes(32).toString("hex");
const cron = randomBytes(32).toString("hex");

console.log(`
# Long-lived secrets (do not commit). Set in Vercel → Settings → Environment Variables.

ACCESS_KEY=${access}
CRON_SECRET=${cron}

# ACCESS_KEY  → paste into the app "Access key" field (UI / manual API)
# CRON_SECRET → used by Vercel Cron as Authorization: Bearer …
#
# Either key unlocks protected routes. Prefer ACCESS_KEY for daily use so you
# can rotate CRON_SECRET without changing what you type in the UI.
`);
