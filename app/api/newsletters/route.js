// app/api/newsletters/route.js — neutral browse: all newsletters + extract status.
//   GET /api/newsletters?key=<CRON_SECRET>
import { listNewsletters, unsummarizedEmails } from "@/lib/db";

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
    const newsletters = await listNewsletters(100);
    const pending = await unsummarizedEmails(100);
    return Response.json({
      count: newsletters.length,
      with_summary: newsletters.filter((n) => n.has_summary).length,
      pending_count: pending.length,
      newsletters,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
