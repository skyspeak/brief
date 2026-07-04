// app/api/digest/route.js — invoked on schedule by Vercel Cron (and manually with the secret).
import { runDigest } from "@/lib/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Puppeteer + LLM; Hobby cap is 300s.

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret set → open (set one in prod)
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("key") === secret;
}

export async function GET(req) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  try {
    return Response.json(await runDigest({ force }));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export const POST = GET;
