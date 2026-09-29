// POST /api/relay-send — send HTML mail (Resend on this account, then Gmail).
// GET  /api/relay-send — domain status for this Resend key.
// Auth: Authorization: Bearer <EMAIL_RELAY_SECRET|CRON_SECRET>
//
// Body: { to, subject, html, text?, cc?, fromName?, prefer?: "gmail"|"resend" }
// prefer:"gmail" skips Resend and uses the connected Gmail account (same path as digests).

import { isGmailConnected, sendHtmlEmail } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorized(req) {
  const secret = process.env.EMAIL_RELAY_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function resendJson(path, init) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY missing" };
  const res = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function sendViaGmail({ to, cc, subject, html, fromName }) {
  if (!(await isGmailConnected())) {
    return { ok: false, error: "gmail not connected" };
  }
  try {
    const result = await sendHtmlEmail({
      to,
      cc: cc || undefined,
      subject,
      html,
      fromName: fromName || "dear[CC]",
    });
    return {
      ok: true,
      via: "gmail",
      id: result.id,
      from: result.from,
      to: result.to,
      cc: result.cc,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "gmail send failed" };
  }
}

export async function GET(req) {
  if (!authorized(req)) return Response.json({ error: "not found" }, { status: 404 });
  const domains = await resendJson("/domains");
  return Response.json({
    from: process.env.RESEND_FROM_EMAIL || null,
    hasResendKey: !!process.env.RESEND_API_KEY,
    gmail: await isGmailConnected(),
    domains: domains.data,
  });
}

export async function POST(req) {
  if (!authorized(req)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const to = typeof body.to === "string" ? body.to.trim() : "";
  const cc = typeof body.cc === "string" ? body.cc.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const html = typeof body.html === "string" ? body.html : "";
  const text = typeof body.text === "string" ? body.text : "";
  const fromName = typeof body.fromName === "string" ? body.fromName : "dear[CC]";
  const prefer = typeof body.prefer === "string" ? body.prefer.trim().toLowerCase() : "";
  if (!to || !subject || !html) {
    return Response.json({ error: "to, subject, html required" }, { status: 400 });
  }

  if (prefer === "gmail") {
    const gmail = await sendViaGmail({ to, cc, subject, html, fromName });
    if (gmail.ok) return Response.json(gmail);
    return Response.json({ error: gmail.error }, { status: 500 });
  }

  const from =
    process.env.RESEND_FROM_EMAIL ||
    "dear[CC] <onboarding@resend.dev>";
  const sent = await resendJson("/emails", {
    method: "POST",
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
      ...(cc ? { cc: [cc] } : {}),
    }),
  });
  if (sent.ok) {
    return Response.json({
      ok: true,
      via: "resend",
      id: sent.data?.id || null,
      from,
      to,
      cc: cc || null,
    });
  }

  const resendError =
    sent.data && typeof sent.data.message === "string" ? sent.data.message : "resend failed";

  const gmail = await sendViaGmail({ to, cc, subject, html, fromName });
  if (gmail.ok) return Response.json(gmail);
  return Response.json(
    { error: gmail.error || resendError, resendError },
    { status: 500 },
  );
}
