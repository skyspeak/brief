// lib/digest.js — weekly run: one tailored magazine per persona.
import { recentEmails, markDigested } from "@/lib/db";
import { buildIssue } from "@/lib/issue";
import { renderMagazine } from "@/lib/magazine";
import { sendIssue } from "@/lib/resend";
import { PERSONAS } from "@/lib/personas";

export async function runDigest() {
  const windowDays = Number(process.env.DIGEST_WINDOW_DAYS || 7);
  const since = Math.floor(Date.now() / 1000) - windowDays * 86400;

  const emails = await recentEmails(since);
  if (!emails.length) return { skipped: true, reason: "empty window" };

  const results = [];
  for (const p of PERSONAS) {
    const issue = await buildIssue(emails, p.lens);
    const html = renderMagazine(issue, p);
    await sendIssue(issue, html, emails.length, p.to);
    results.push({ persona: p.id, title: issue.issue_title });
  }

  await markDigested(emails.map((e) => e.id));
  return { sent: true, sources: emails.length, editions: results };
}
