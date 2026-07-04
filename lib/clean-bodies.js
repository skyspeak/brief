// lib/clean-bodies.js — re-clean stored newsletter bodies from HTML sources.
import { allEmailsWithBodies, updateBodyText, updateSummary } from "@/lib/db";
import { cleanNewsletterContent } from "@/lib/newsletter-text";
import { isConfirmationEmail } from "@/lib/confirmations";

export async function cleanAllBodies() {
  const rows = await allEmailsWithBodies();
  let updated = 0;
  const results = [];

  for (const e of rows) {
    if (isConfirmationEmail(e)) {
      await updateSummary(e.id, "None", "confirmation");
      results.push({ id: e.id, skipped: true, reason: "confirmation email" });
      continue;
    }

    const cleaned = cleanNewsletterContent("", {
      body_text: e.body_text,
      body_html: e.body_html,
      subject: e.subject,
      sender: e.sender,
    });

    if (cleaned.length <= 120) {
      results.push({ id: e.id, skipped: true, reason: "body too short after clean" });
      continue;
    }

    if (cleaned !== (e.body_text || "")) {
      await updateBodyText(e.id, cleaned);
      await updateSummary(e.id, "", "");
      updated++;
      results.push({ id: e.id, updated: true, len: cleaned.length, summary_cleared: true });
    } else {
      results.push({ id: e.id, updated: false });
    }
  }

  return { total: rows.length, updated, results };
}
