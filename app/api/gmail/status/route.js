// app/api/gmail/status/route.js — Gmail connection + token longevity status.
import {
  isGmailConnected,
  getGmailEmail,
  appOrigin,
  gmailRedirectUri,
  getGmailTokenHealth,
  probeGmailAuth,
} from "@/lib/gmail";
import { getLastGmailSync } from "@/lib/db";
import { isAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!isAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const probe = url.searchParams.get("probe") === "1";

  const connected = await isGmailConnected();
  const email = connected ? await getGmailEmail() : null;
  const lastSync = await getLastGmailSync();
  const health = await getGmailTokenHealth();
  const live = probe && connected ? await probeGmailAuth() : null;

  return Response.json({
    connected: live ? live.connected && live.ok : connected,
    email: live?.email || email || process.env.GMAIL_ADDRESS || null,
    last_sync_at: lastSync,
    oauth_configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    redirect_uri: gmailRedirectUri(),
    app_origin: appOrigin(),
    label: process.env.GMAIL_LABEL || null,
    query: process.env.GMAIL_QUERY || null,
    token: health,
    probe: live,
  });
}
