// app/api/newsletters/route.js — neutral browse: newsletters in digest window.
//   GET /api/newsletters?key=<ACCESS_KEY>
import { listNewsletters } from "@/lib/db";
import { getDigestWindowEmails } from "@/lib/digest";
import { isAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!isAuthorized(req)) {
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
