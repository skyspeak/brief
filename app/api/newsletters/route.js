// app/api/newsletters/route.js — neutral browse: newsletters in digest window.
//   GET /api/newsletters?key=<CRON_SECRET>
import { listNewsletters } from "@/lib/db";
import { getDigestWindowEmails } from "@/lib/digest";

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
    const { emails, windowDays, total } = await getDigestWindowEmails();
    return Response.json({
      count: newsletters.length,
      in_digest_window: emails.length,
      window_days: windowDays,
      total_in_window: total,
      newsletters,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
