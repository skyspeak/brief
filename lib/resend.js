// lib/resend.js — deliver one finished issue (PDF attachment or inline HTML).
import { htmlToPdf } from "@/lib/pdf";

const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Fetch full received email content (webhooks are metadata-only). */
export async function fetchReceivedEmail(emailId) {
  const r = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  if (!r.ok) throw new Error(`Resend receiving ${r.status}: ${await r.text()}`);
  return r.json();
}

export async function sendIssue(issue, html, count, to) {
  const title = process.env.DIGEST_TITLE || "THE BRIEF";
  const format = process.env.OUTPUT_FORMAT || "pdf";
  const recipient = to || process.env.DIGEST_TO;
  const subject = `📰 ${title} — ${issue.issue_title || "Weekly Issue"} (${count} sources)`;

  const teaser = `<div style="font-family:Georgia,serif;max-width:560px;margin:auto">
    <p style="font-style:italic;color:#9a2515;font-size:18px">${esc(issue.issue_title || "")}</p>
    <p>${esc(issue.lede || "")}</p>
    <p><b>Your ${format === "pdf" ? "issue is attached" : "issue is below"}.</b>
    Compiled from ${count} newsletters this week.</p></div>`;

  const body = { from: process.env.DIGEST_FROM, to: recipient, subject };

  if (format === "pdf") {
    const pdf = await htmlToPdf(html);
    body.html = teaser;
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
