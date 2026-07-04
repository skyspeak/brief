// lib/resend.js — deliver digest emails via Resend.
import { htmlToPdf } from "@/lib/pdf";
import { markdownToEmailHtml, digestTitleFromMarkdown } from "@/lib/markdown";

/** Fetch full received email content (webhooks are metadata-only). */
export async function fetchReceivedEmail(emailId) {
  const r = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  if (!r.ok) throw new Error(`Resend receiving ${r.status}: ${await r.text()}`);
  return r.json();
}

/** Send a markdown digest email. */
export async function sendDigest({ markdown, sourceCount, to, personaLabel }) {
  const brand = process.env.DIGEST_TITLE || "THE BRIEF";
  const format = process.env.OUTPUT_FORMAT || "html";
  const recipient = to || process.env.DIGEST_TO;
  const digestTitle = digestTitleFromMarkdown(markdown);
  const subject = `📰 ${brand} — ${digestTitle} (${sourceCount} sources)`;
  const html = markdownToEmailHtml(markdown, personaLabel);

  const body = { from: process.env.DIGEST_FROM, to: recipient, subject };

  if (format === "pdf") {
    const pdf = await htmlToPdf(html);
    body.html = `<p style="font-family:Georgia,serif">Your ${brand} digest is attached — compiled from ${sourceCount} newsletters.</p>`;
    body.attachments = [{ filename: "the-brief.pdf", content: pdf.toString("base64") }];
  } else {
    body.html = html;
  }

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Resend send ${r.status}: ${await r.text()}`);
  return r.json();
}

/** @deprecated use sendDigest */
export async function sendIssue(issue, html, count, to) {
  const markdown = issue._markdown || issue.lede || "";
  return sendDigest({
    markdown: markdown || html,
    sourceCount: count,
    to,
    personaLabel: "",
  });
}
