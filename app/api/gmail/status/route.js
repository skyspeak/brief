// app/api/gmail/status/route.js — Gmail connection status.
import { isGmailConnected, getGmailEmail, appOrigin, gmailRedirectUri } from "@/lib/gmail";
import { getLastGmailSync } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return new URL(req.url).searchParams.get("key") === secret;
}

export async function GET(req) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const connected = await isGmailConnected();
  const email = connected ? await getGmailEmail() : null;
  const lastSync = await getLastGmailSync();

  return Response.json({
    connected,
    email: email || process.env.GMAIL_ADDRESS || null,
    last_sync_at: lastSync,
    oauth_configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    redirect_uri: gmailRedirectUri(),
    app_origin: appOrigin(),
    label: process.env.GMAIL_LABEL || null,
    query: process.env.GMAIL_QUERY || null,
  });
}
