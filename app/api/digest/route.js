// app/api/digest/route.js — invoked on schedule by Vercel Cron (and manually with the secret).
import {
  runDigest,
  getDigestWindowEmails,
  planDigestEmails,
  extractDigestEmailsBatch,
  sendDigestFromParts,
} from "@/lib/digest";
import { markdownToEmailHtml } from "@/lib/markdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req, body = {}) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("key") === secret) return true;
  return body.key === secret;
}

function digestHtmlResponse(result) {
  if (result.skipped) {
    const msg =
      result.reason === "interval"
        ? `Digest skipped — next run after ${new Date(result.next_run_at * 1000).toLocaleString()}. Add <code>force=1</code> to send now.`
        : result.reason === "empty window"
          ? "No newsletters in the digest window yet."
          : `Digest skipped (${result.reason || "unknown"}).`;
    return new Response(
      `<!doctype html><html><body style="font-family:system-ui,sans-serif;padding:2rem;max-width:40rem;margin:0 auto"><p>${msg}</p></body></html>`,
      { headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  const editions = result.editions || [];
  if (!editions.length) {
    return new Response("No digest generated.", { status: 404 });
  }

  const blocks = editions.map((e) => markdownToEmailHtml(e.markdown, e.label));
  const status = result.sent
    ? `<p style="font-family:system-ui,sans-serif;font-size:14px;color:#059669;margin:0 0 1rem">Sent to ${editions.filter((e) => e.sent).length} recipient(s).</p>`
    : `<p style="font-family:system-ui,sans-serif;font-size:14px;color:#dc2626;margin:0 0 1rem">Email not sent${editions[0]?.error ? `: ${editions[0].error}` : ""}.</p>`;

  return new Response(`${status}${blocks.join('<hr style="border:none;border-top:1px solid #e2e8f0;margin:2rem 0">')}`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function handleDigest(req, body = {}) {
  if (!authorized(req, body)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1" || body.force === true;
  const test = url.searchParams.get("test") === "1" || body.test === true;
  const format = url.searchParams.get("format") || body.format;
  const action = url.searchParams.get("action") || body.action;

  try {
    if (action === "plan") {
      const { emails, total, ignored, windowDays } = await getDigestWindowEmails();
      if (!emails.length) {
        return Response.json({ skipped: true, reason: "empty window", window_days: windowDays });
      }
      return Response.json({
        ...planDigestEmails(emails),
        total_in_window: total,
        ignored,
        window_days: windowDays,
      });
    }

    if (action === "extract") {
      const batchIndex = Number(body.batchIndex ?? url.searchParams.get("batch") ?? 0);
      const { emails } = await getDigestWindowEmails();
      if (!emails.length) {
        return Response.json({ error: "no newsletters in digest window" }, { status: 400 });
      }
      const batch = await extractDigestEmailsBatch(emails, batchIndex);
      return Response.json({
        partial: batch.data,
        batchIndex: batch.batchIndex,
        batchCount: batch.batchCount,
        batchSize: batch.batchSize,
      });
    }

    if (action === "send") {
      const { emails, total, ignored, windowDays, now } = await getDigestWindowEmails();
      if (!emails.length) {
        return Response.json({ error: "no newsletters in digest window" }, { status: 400 });
      }
      const parts = body.parts;
      if (!Array.isArray(parts) || !parts.length) {
        return Response.json({ error: "parts required" }, { status: 400 });
      }
      const result = await sendDigestFromParts({
        parts,
        emails,
        total,
        ignored,
        test,
        force: force || test,
        windowDays,
        now,
      });
      if (format === "html") return digestHtmlResponse(result);
      return Response.json(result);
    }

    const result = await runDigest({ force: force || test, test });
    if (format === "html") return digestHtmlResponse(result);
    return Response.json(result);
  } catch (e) {
    if (format === "html") {
      return new Response(e.message, { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req) {
  return handleDigest(req);
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  return handleDigest(req, body);
}
