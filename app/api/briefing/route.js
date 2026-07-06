// app/api/briefing/route.js — full-corpus digest (Top 3 Themes, Stories, Emerging, Follow-Ups).
import { allEmailsForBriefing } from "@/lib/db";
import { cleanAllBodies } from "@/lib/clean-bodies";
import { buildDigest } from "@/lib/issue";
import { isConfirmationEmail } from "@/lib/confirmations";
import { capNewslettersForDigest } from "@/lib/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(body, req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  if (body?.key === secret) return true;
  return new URL(req.url).searchParams.get("key") === secret;
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (!authorized(body, req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    if (body.clean !== false) {
      await cleanAllBodies();
    }

    const rows = (await allEmailsForBriefing()).filter(
      (e) => !isConfirmationEmail(e) && e.tags !== "confirmation"
    );
    if (!rows.length) {
      return Response.json({ error: "no newsletters in corpus yet" }, { status: 400 });
    }

    const { emails, total, ignored } = capNewslettersForDigest(rows);
    const persona = body.persona || "neutral";
    const markdown = await buildDigest(emails, persona);

    return Response.json({
      markdown,
      persona,
      source_count: emails.length,
      total_in_corpus: total,
      ignored,
      sources: emails.map((r, i) => ({
        n: i + 1,
        subject: r.subject || "(no subject)",
        sender: r.sender,
      })),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
