// lib/digest.js — scheduled run: one neutral digest email with persona insights.
import { recentEmails, markDigested, getLastDigestRun, setLastDigestRun } from "@/lib/db";
import { buildDigest } from "@/lib/issue";
import { sendDigest } from "@/lib/gmail";
import { digestTitleFromMarkdown } from "@/lib/markdown";
import { DEFAULT_DIGEST_TO } from "@/lib/personas";

/** Max newsletters per digest LLM call — extras in the window are ignored. */
export const DIGEST_NEWSLETTER_LIMIT = 40;

/** Hardcoded recipient for UI “Send test digest”. */
export const TEST_DIGEST_TO = "skyspeak@gmail.com";

/** Keep the most recent `limit` newsletters (by received_at). */
export function capNewslettersForDigest(emails, limit = DIGEST_NEWSLETTER_LIMIT) {
  const total = emails.length;
  if (total <= limit) return { emails, total, ignored: 0 };
  const kept = [...emails]
    .sort((a, b) => (b.received_at || 0) - (a.received_at || 0))
    .slice(0, limit)
    .sort((a, b) => (a.received_at || 0) - (b.received_at || 0));
  return { emails: kept, total, ignored: total - limit };
}

export async function runDigest({ force = false, test = false } = {}) {
  const intervalDays = Number(process.env.DIGEST_INTERVAL_DAYS || 3);
  const windowDays = Number(process.env.DIGEST_WINDOW_DAYS || intervalDays);
  const now = Math.floor(Date.now() / 1000);

  if (!force && !test) {
    const last = await getLastDigestRun();
    if (last && now - last < intervalDays * 86400) {
      const nextAt = last + intervalDays * 86400;
      return {
        skipped: true,
        reason: "interval",
        interval_days: intervalDays,
        last_run_at: last,
        next_run_at: nextAt,
      };
    }
  }

  const since = now - windowDays * 86400;
  const inWindow = await recentEmails(since);
  if (!inWindow.length) return { skipped: true, reason: "empty window", window_days: windowDays };

  const { emails, total, ignored } = capNewslettersForDigest(inWindow);
  const markdown = await buildDigest(emails, "neutral", windowDays);
  const recipient = test ? TEST_DIGEST_TO : process.env.DIGEST_TO || DEFAULT_DIGEST_TO;
  const edition = {
    persona: "neutral",
    label: test ? "Test digest" : "Digest",
    title: digestTitleFromMarkdown(markdown),
    markdown,
  };

  try {
    await sendDigest({
      markdown,
      sourceCount: emails.length,
      to: recipient,
      personaLabel: test ? "Test" : "",
    });
    edition.sent = true;
  } catch (e) {
    edition.sent = false;
    edition.error = e.message;
    if (!force && !test) throw e;
    return {
      sent: false,
      reason: "send_failed",
      test,
      sent_to: recipient,
      sources: emails.length,
      total_in_window: total,
      ignored,
      editions: [edition],
      interval_days: intervalDays,
      window_days: windowDays,
    };
  }

  if (!test) {
    await markDigested(emails.map((e) => e.id));
    await setLastDigestRun(now);
  }

  return {
    sent: true,
    test,
    sent_to: recipient,
    sources: emails.length,
    total_in_window: total,
    ignored,
    editions: [edition],
    interval_days: intervalDays,
    window_days: windowDays,
    sent_at: now,
  };
}
