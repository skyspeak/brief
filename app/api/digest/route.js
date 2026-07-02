// app/api/digest/route.js — invoked weekly by Vercel Cron (and manually with the secret).
import { runDigest } from "@/lib/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Puppeteer + LLM; Hobby cap is 300s.

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret set → open (set one in prod)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json(await runDigest());
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// Allow manual POST triggers too (same auth).
export const POST = GET;
