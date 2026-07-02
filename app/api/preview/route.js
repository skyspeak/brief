// app/api/preview/route.js — design-iteration loop: render without sending.
//   /api/preview?key=<CRON_SECRET>            → magazine HTML in browser
//   /api/preview?key=<CRON_SECRET>&format=pdf → download the PDF
import { recentEmails } from "@/lib/db";
import { buildIssue } from "@/lib/issue";
import { renderMagazine } from "@/lib/magazine";
import { htmlToPdf } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const url = new URL(req.url);

  // Guard so an open URL can't burn LLM calls.
  const secret = process.env.CRON_SECRET;
  if (secret && url.searchParams.get("key") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const windowDays = Number(process.env.DIGEST_WINDOW_DAYS || 7);
    const since = Math.floor(Date.now() / 1000) - windowDays * 86400;
    const emails = await recentEmails(since);
    if (!emails.length) return new Response("No emails in window yet.");

    const html = renderMagazine(await buildIssue(emails));

    if (url.searchParams.get("format") === "pdf") {
      const pdf = await htmlToPdf(html);
      return new Response(pdf, { headers: { "content-type": "application/pdf" } });
    }
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}
