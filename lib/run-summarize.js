// lib/run-summarize.js — ad-hoc map-step summarization.
import { getEmailById, unsummarizedEmails, updateSummary } from "@/lib/db";
import { summarizeEmail } from "@/lib/summarize";
import { isConfirmationEmail } from "@/lib/confirmations";

export async function summarizeOne(id, { force = false } = {}) {
  const email = await getEmailById(id);
  if (!email) throw new Error("email not found");
  if (!email.body_text || email.body_text.length <= 120) {
    throw new Error("email has no usable body");
  }
  if (isConfirmationEmail(email)) {
    throw new Error("confirmation emails are not summarized");
  }
  if (!force && email.summary && email.summary.length > 0) {
    return { id, skipped: true, reason: "already summarized", summary: email.summary };
  }

  const { summary, tags } = await summarizeEmail({
    subject: email.subject || "",
    sender: email.sender || "",
    body: email.body_text,
  });
  await updateSummary(id, summary, tags);
  return { id, summary, tags, summarized: true };
}

export async function summarizePending({ limit = 1 } = {}) {
  const rows = await unsummarizedEmails(limit);
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const e = rows[i];
    if (isConfirmationEmail(e)) {
      results.push({ id: e.id, skipped: true, reason: "confirmation email" });
      continue;
    }
    try {
      results.push(await summarizeOne(e.id));
      // Pace only between emails in the same request (batch size should stay at 1 on Vercel).
      if (i < rows.length - 1) {
        await new Promise((r) => setTimeout(r, 4000));
      }
    } catch (err) {
      results.push({ id: e.id, error: err.message });
      if (/429|rate.?limit/i.test(err.message)) break;
    }
  }

  const summarized = results.filter((r) => r.summarized).length;
  const rateLimited = results.some((r) => r.error && /429|rate.?limit/i.test(r.error));

  return {
    processed: results.length,
    summarized,
    rate_limited: rateLimited,
    results,
  };
}
