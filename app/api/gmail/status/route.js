// app/api/gmail/status/route.js — Gmail connection status.
import { isGmailConnected, getGmailEmail, appOrigin, gmailRedirectUri } from "@/lib/gmail";
import { getLastGmailSync } from "@/lib/db";
import { isAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!isAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

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
