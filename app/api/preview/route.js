// app/api/preview/route.js — preview digest without sending.
//   /api/preview?key=<ACCESS_KEY>            → digest HTML in browser
//   /api/preview?key=<ACCESS_KEY>&format=pdf → download PDF
import { buildDigest } from "@/lib/issue";
import { getDigestWindowEmails } from "@/lib/digest";
import { markdownToEmailHtml } from "@/lib/markdown";
import { htmlToPdf } from "@/lib/pdf";
import { isAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const url = new URL(req.url);
  if (!isAuthorized(req)) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const { emails, windowDays } = await getDigestWindowEmails();
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
