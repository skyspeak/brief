// app/api/sync/route.js — poll Gmail inbox → store → summarize.
import { syncGmailInbox } from "@/lib/gmail-sync";
import { isGmailConnected } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req, body = {}) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("key") === secret) return true;
  return body.key === secret;
}

async function handleSync(req, body = {}) {
  if (!authorized(req, body)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isGmailConnected())) {
    return Response.json(
      { error: "Gmail not connected — go to Setup and connect your account" },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const full = url.searchParams.get("full") === "1" || body.full === true;
  const maxMessages = Number(url.searchParams.get("limit") || body.limit || 40);

  try {
    return Response.json(await syncGmailInbox({ maxMessages, full }));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req) {
  return handleSync(req);
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  return handleSync(req, body);
}
