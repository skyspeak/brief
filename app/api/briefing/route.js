// app/api/briefing/route.js — on-demand briefing over the digest window.
import { cleanAllBodies } from "@/lib/clean-bodies";
import {
  getBriefingEmails,
  planDigestEmails,
  extractDigestEmailsBatch,
} from "@/lib/digest";
import { finalizeDigestMarkdown } from "@/lib/digest-extract";
import { isAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (!isAuthorized(req, body)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const action = body.action;
  const persona = body.persona || "neutral";

  try {
    if (action === "plan") {
      const { emails, total, ignored, windowDays } = await getBriefingEmails();
      if (!emails.length) {
        return Response.json({ error: "no newsletters in digest window yet" }, { status: 400 });
      }
      return Response.json({
        ...planDigestEmails(emails),
        total_in_window: total,
        ignored,
        window_days: windowDays,
      });
    }

    if (action === "extract") {
      const batchIndex = Number(body.batchIndex ?? 0);
      const { emails } = await getBriefingEmails();
      if (!emails.length) {
        return Response.json({ error: "no newsletters in corpus yet" }, { status: 400 });
      }
      const batch = await extractDigestEmailsBatch(emails, batchIndex, { personaKey: persona });
      return Response.json({
        partial: batch.data,
        batchIndex: batch.batchIndex,
        batchCount: batch.batchCount,
        batchSize: batch.batchSize,
      });
    }

    if (action === "finish") {
      const { emails, total, ignored, windowDays } = await getBriefingEmails();
      const parts = body.parts;
      if (!Array.isArray(parts) || !parts.length) {
        return Response.json({ error: "parts required" }, { status: 400 });
      }
      const markdown = finalizeDigestMarkdown(parts, {
        emails,
        windowDays,
        personaKey: persona,
      });
      return Response.json({
        markdown,
        persona,
        source_count: emails.length,
        total_in_corpus: total,
        ignored,
        window_days: windowDays,
        sources: emails.map((r, i) => ({
          n: i + 1,
          subject: r.subject || "(no subject)",
          sender: r.sender,
        })),
      });
    }

    if (body.clean !== false) {
      await cleanAllBodies();
    }

    const { emails, total, ignored, windowDays } = await getBriefingEmails();
    if (!emails.length) {
      return Response.json({ error: "no newsletters in digest window yet" }, { status: 400 });
    }

    const batchCount = planDigestEmails(emails).batchCount;
    const parts = [];
    for (let i = 0; i < batchCount; i++) {
      const { data } = await extractDigestEmailsBatch(emails, i, { personaKey: persona });
      parts.push(data);
    }

    const markdown = finalizeDigestMarkdown(parts, {
      emails,
      windowDays,
      personaKey: persona,
    });

    return Response.json({
      markdown,
      persona,
      source_count: emails.length,
      total_in_corpus: total,
      ignored,
      window_days: windowDays,
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
