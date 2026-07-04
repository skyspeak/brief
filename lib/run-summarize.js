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

export async function summarizePending({ limit = 20 } = {}) {
  const rows = await unsummarizedEmails(limit);
  const results = [];

  for (const e of rows) {
    if (isConfirmationEmail(e)) {
      results.push({ id: e.id, skipped: true, reason: "confirmation email" });
      continue;
    }
    try {
      results.push(await summarizeOne(e.id));
    } catch (err) {
      results.push({ id: e.id, error: err.message });
    }
  }

  return {
    processed: results.length,
    summarized: results.filter((r) => r.summarized).length,
    results,
  };
}
