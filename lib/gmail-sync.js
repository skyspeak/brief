// lib/gmail-sync.js — pull new Gmail messages → store → summarize.
import {
  emailExists,
  getEmailById,
  insertEmail,
  updateSummary,
  getLastGmailSync,
  setLastGmailSync,
  setAppState,
} from "@/lib/db";
import {
  getGmailClient,
  fetchGmailMessage,
  listMessageIds,
  syncQuery,
  getGmailEmail,
  trashIfSummarized,
} from "@/lib/gmail";
import { htmlToText } from "@/lib/html";
import { cleanNewsletterContent } from "@/lib/newsletter-text";
import { isConfirmationEmail } from "@/lib/confirmations";

const HISTORY_ID_KEY = "gmail_history_id";

export async function syncGmailInbox({ maxMessages = 40, full = false } = {}) {
  const gmail = await getGmailClient();
  const now = Math.floor(Date.now() / 1000);
  const syncDays = Number(process.env.GMAIL_SYNC_DAYS || 14);
  const sinceSec = full ? now - syncDays * 86400 : (await getLastGmailSync()) || now - syncDays * 86400;

  const q = syncQuery({ sinceSec: full ? sinceSec : Math.max(sinceSec - 86400, now - syncDays * 86400) });
  const seen = new Set();
  const results = [];
  let pageToken;
  let fetched = 0;

  do {
    const { ids, nextPageToken } = await listMessageIds(gmail, {
      q,
      maxResults: Math.min(maxMessages - fetched, 50),
      pageToken,
    });
    pageToken = nextPageToken;

    for (const id of ids) {
      if (seen.has(id) || fetched >= maxMessages) continue;
      seen.add(id);
      fetched++;

      if (await emailExists(id)) {
        const existing = await getEmailById(id);
        const trash = existing ? await trashIfSummarized(gmail, id, existing) : { skipped: true };
        results.push({
          id,
          skipped: true,
          reason: "already stored",
          ...(trash.trashed ? { trashed: true } : {}),
        });
        continue;
      }

      try {
        const parsed = await fetchGmailMessage(gmail, id);
        let bodyHtml = parsed.body_html || "";
        let body =
          cleanNewsletterContent(parsed.body_text || htmlToText(bodyHtml), {
            body_html: bodyHtml,
            subject: parsed.subject,
            sender: parsed.sender,
          }) ||
          parsed.body_text ||
          htmlToText(bodyHtml);

        await insertEmail({
          id: parsed.id,
          sender: parsed.sender,
          subject: parsed.subject,
          body_text: body,
          body_html: bodyHtml || null,
          received_at: parsed.received_at,
        });

        const isConfirm = isConfirmationEmail({
          subject: parsed.subject,
          body_text: body,
          body_html: bodyHtml,
        });

        if (isConfirm) {
          await updateSummary(parsed.id, "None", "confirmation");
          results.push({ id: parsed.id, ingested: true, confirmation: true });
        } else if (body && body.length > 120) {
          const trash = await trashIfSummarized(gmail, parsed.id, { body_text: body, tags: "" });
          results.push({
            id: parsed.id,
            ingested: true,
            stored: true,
            ...(trash.trashed ? { trashed: true } : {}),
          });
        } else {
          results.push({ id: parsed.id, ingested: true, stored: false, reason: "short body" });
        }
      } catch (e) {
        results.push({ id, error: e.message });
      }
    }
  } while (pageToken && fetched < maxMessages);

  try {
    const profile = await gmail.users.getProfile({ userId: "me" });
    if (profile.data.historyId) await setAppState(HISTORY_ID_KEY, profile.data.historyId);
    if (profile.data.emailAddress) await setAppState("gmail_email", profile.data.emailAddress);
  } catch {
    /* optional */
  }

  await setLastGmailSync(now);

  const ingested = results.filter((r) => r.ingested).length;
  const trashed = results.filter((r) => r.trashed).length;
  return {
    ok: true,
    query: q,
    gmail: (await getGmailEmail()) || null,
    checked: fetched,
    ingested,
    trashed,
    results,
    synced_at: now,
  };
}
