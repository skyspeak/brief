// app/api/confirmations/route.js — subscription confirmation emails + action links.
//   GET  /api/confirmations?key=<ACCESS_KEY>
//   POST /api/confirmations  { key, id }  → mark as confirmed (clicked)
import { recentEmailsWithBody, markEmailConfirmed } from "@/lib/db";
import { listConfirmations } from "@/lib/confirmations";
import { getGmailEmail } from "@/lib/gmail";
import { isAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const emails = await recentEmailsWithBody(100);
    const all = listConfirmations(emails);
    const pending = all.filter((c) => c.status === "pending");
    const manual = all.filter((c) => c.status === "manual");
    const confirmed = all.filter((c) => c.status === "confirmed");

    const inbound = (await getGmailEmail()) || process.env.GMAIL_ADDRESS || null;

    return Response.json({
      inbound_address: inbound,
      count: all.length,
      pending: pending.length,
      needs_manual: manual.length,
      confirmed: confirmed.length,
      confirmations: all,
      pending_list: pending,
      confirmed_list: confirmed,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (!isAuthorized(req, body)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!body.id) {
    return Response.json({ error: "missing id" }, { status: 400 });
  }

  try {
    await markEmailConfirmed(body.id);
    return Response.json({ ok: true, id: body.id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
