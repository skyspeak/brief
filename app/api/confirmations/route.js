// app/api/confirmations/route.js — subscription confirmation emails + action links.
//   GET /api/confirmations?key=<CRON_SECRET>
import { recentEmailsWithBody } from "@/lib/db";
import { listConfirmations } from "@/lib/confirmations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return new URL(req.url).searchParams.get("key") === secret;
}

export async function GET(req) {
  if (!authorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const emails = await recentEmailsWithBody(80);
    const confirmations = listConfirmations(emails);

    return Response.json({
      count: confirmations.length,
      pending: confirmations.filter((c) => c.primaryLink).length,
      needs_manual: confirmations.filter((c) => c.needsManualReview).length,
      confirmations,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
