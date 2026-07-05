// lib/run-summarize.js — ad-hoc map-step summarization.
import {
  getEmailById,
  emailsToSummarize,
  updateSummary,
  updateBodyText,
} from "@/lib/db";
import { summarizeEmail } from "@/lib/summarize";
import { isConfirmationEmail } from "@/lib/confirmations";
import { cleanNewsletterContent } from "@/lib/newsletter-text";
import { shouldTrashFromInbox, trashFromInbox, isGmailConnected } from "@/lib/gmail";

async function skipConfirmation(email) {
  await updateSummary(email.id, "None", "confirmation");
}

async function ensureCleanBody(email) {
  const cleaned = cleanNewsletterContent("", {
    body_text: email.body_text,
    body_html: email.body_html,
    subject: email.subject,
    sender: email.sender,
  });
  if (cleaned.length > 120 && cleaned !== (email.body_text || "")) {
    await updateBodyText(email.id, cleaned);
    email.body_text = cleaned;
  }
  return email;
}

export async function summarizeOne(id, { force = false } = {}) {
  let email = await getEmailById(id);
  if (!email) throw new Error("email not found");

  email = await ensureCleanBody(email);

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
    body_html: email.body_html,
    receivedAt: email.received_at,
  });
  await updateSummary(id, summary, tags);

  let trashed = false;
  if (shouldTrashFromInbox({ summary, tags, body_text: email.body_text }) && (await isGmailConnected())) {
    try {
      const r = await trashFromInbox(null, id);
      trashed = !!r.trashed;
    } catch {
      /* non-Gmail id or revoked scope */
    }
  }

  return { id, summary, tags, summarized: true, trashed };
}

export async function summarizePending({ limit = 1, force = false } = {}) {
  const rows = await emailsToSummarize({ force, limit });
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const e = rows[i];
    if (isConfirmationEmail(e)) {
      await skipConfirmation(e);
      results.push({ id: e.id, skipped: true, reason: "confirmation email" });
      continue;
    }
    try {
      results.push(await summarizeOne(e.id, { force }));
      if (i < rows.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (err) {
      results.push({ id: e.id, error: err.message });
      if (/429|rate.?limit/i.test(err.message)) break;
    }
  }

  const summarized = results.filter((r) => r.summarized).length;
  const rateLimited = results.some((r) => r.error && /429|rate.?limit/i.test(r.error));
  const remaining = (await emailsToSummarize({ force, limit: 500 })).filter(
    (row) => !isConfirmationEmail(row) && row.tags !== "confirmation"
  ).length;

  return {
    processed: results.length,
    summarized,
    remaining,
    rate_limited: rateLimited,
    results,
  };
}
