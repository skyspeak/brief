// app/api/briefing/route.js — full-corpus digest (Top 3 Themes, Stories, Emerging, Follow-Ups).
import { cleanAllBodies } from "@/lib/clean-bodies";
import {
  getBriefingEmails,
  planDigestEmails,
  extractDigestEmailsBatch,
} from "@/lib/digest";
import { finalizeDigestMarkdown } from "@/lib/digest-extract";

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

  const action = body.action;

  try {
    if (action === "plan") {
      const { emails, total, ignored } = await getBriefingEmails();
      if (!emails.length) {
        return Response.json({ error: "no newsletters in corpus yet" }, { status: 400 });
      }
      return Response.json({
        ...planDigestEmails(emails),
        total_in_corpus: total,
        ignored,
      });
    }

    if (action === "extract") {
      const batchIndex = Number(body.batchIndex ?? 0);
      const { emails } = await getBriefingEmails();
      if (!emails.length) {
        return Response.json({ error: "no newsletters in corpus yet" }, { status: 400 });
      }
      const batch = await extractDigestEmailsBatch(emails, batchIndex);
      return Response.json({
        partial: batch.data,
        batchIndex: batch.batchIndex,
        batchCount: batch.batchCount,
        batchSize: batch.batchSize,
      });
    }

    if (action === "finish") {
      const { emails, total, ignored } = await getBriefingEmails();
      const parts = body.parts;
      if (!Array.isArray(parts) || !parts.length) {
        return Response.json({ error: "parts required" }, { status: 400 });
      }
      const persona = body.persona || "neutral";
      const markdown = finalizeDigestMarkdown(parts);
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
    }

    if (body.clean !== false) {
      await cleanAllBodies();
    }

    const { emails, total, ignored } = await getBriefingEmails();
    if (!emails.length) {
      return Response.json({ error: "no newsletters in corpus yet" }, { status: 400 });
    }

    const batchCount = planDigestEmails(emails).batchCount;
    const parts = [];
    for (let i = 0; i < batchCount; i++) {
      const { data } = await extractDigestEmailsBatch(emails, i);
      parts.push(data);
    }

    const persona = body.persona || "neutral";
    const markdown = finalizeDigestMarkdown(parts);

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
