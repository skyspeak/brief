// app/api/preview/route.js — preview digest without sending.
//   /api/preview?key=<CRON_SECRET>            → digest HTML in browser
//   /api/preview?key=<CRON_SECRET>&format=pdf → download PDF
import { recentEmails } from "@/lib/db";
import { buildDigest } from "@/lib/issue";
import { capNewslettersForDigest } from "@/lib/digest";
import { markdownToEmailHtml } from "@/lib/markdown";
import { htmlToPdf } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const url = new URL(req.url);

  const secret = process.env.CRON_SECRET;
  if (secret && url.searchParams.get("key") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const windowDays = Number(process.env.DIGEST_WINDOW_DAYS || process.env.DIGEST_INTERVAL_DAYS || 3);
    const since = Math.floor(Date.now() / 1000) - windowDays * 86400;
    const emails = capNewslettersForDigest(await recentEmails(since)).emails;
    if (!emails.length) return new Response("No emails in window yet.");

    const persona = url.searchParams.get("persona") || "general";
    const markdown = await buildDigest(emails, persona, windowDays);
    const html = markdownToEmailHtml(markdown, `${persona} preview`);

    if (url.searchParams.get("format") === "pdf") {
      const pdf = await htmlToPdf(html);
      return new Response(pdf, { headers: { "content-type": "application/pdf" } });
    }
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}
