// lib/digest.js — scheduled run: one neutral digest email with persona insights.
import { recentEmails, markDigested, getLastDigestRun, setLastDigestRun, allEmailsForBriefing } from "@/lib/db";
import { sendDigest } from "@/lib/gmail";
import { digestTitleFromMarkdown } from "@/lib/markdown";
import { DEFAULT_DIGEST_TO } from "@/lib/personas";
import { isConfirmationEmail } from "@/lib/confirmations";
import {
  extractDigestBatch,
  finalizeDigestMarkdown,
  getDigestBatchCount,
} from "@/lib/digest-extract";

/** Max newsletters per digest LLM run — extras in the window are ignored. */
export const DIGEST_NEWSLETTER_LIMIT = 40;

/** Hardcoded recipient for UI “Send test digest”. */
export const TEST_DIGEST_TO = "skyspeak@gmail.com";

const CRON_TIME_BUDGET_MS = 48_000;

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

function digestWindowConfig() {
  const intervalDays = Number(process.env.DIGEST_INTERVAL_DAYS || 3);
  const windowDays = Number(process.env.DIGEST_WINDOW_DAYS || intervalDays);
  const now = Math.floor(Date.now() / 1000);
  const since = now - windowDays * 86400;
  return { intervalDays, windowDays, now, since };
}

export async function getDigestWindowEmails({ limit = DIGEST_NEWSLETTER_LIMIT } = {}) {
  const { windowDays, now, since } = digestWindowConfig();
  const inWindow = await recentEmails(since);
  const capped = capNewslettersForDigest(inWindow, limit);
  return { ...capped, windowDays, now };
}

export async function getBriefingEmails({ limit = DIGEST_NEWSLETTER_LIMIT } = {}) {
  const rows = (await allEmailsForBriefing()).filter(
    (e) => !isConfirmationEmail(e) && e.tags !== "confirmation"
  );
  return capNewslettersForDigest(rows, limit);
}

export function planDigestEmails(emails) {
  return {
    batchCount: getDigestBatchCount(emails),
    sources: emails.length,
  };
}

export async function extractDigestEmailsBatch(emails, batchIndex) {
  return extractDigestBatch(emails, batchIndex);
}

export async function sendDigestFromParts({
  parts,
  emails,
  total,
  ignored,
  test = false,
  force = false,
  windowDays,
  now,
}) {
  const markdown = finalizeDigestMarkdown(parts);
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
      window_days: windowDays,
    };
  }

  if (!test) {
    await markDigested(emails.map((e) => e.id));
    await setLastDigestRun(now ?? Math.floor(Date.now() / 1000));
  }

  const { intervalDays } = digestWindowConfig();
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
    sent_at: now ?? Math.floor(Date.now() / 1000),
  };
}

export async function runDigest({ force = false, test = false } = {}) {
  const { intervalDays, windowDays, now } = digestWindowConfig();

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

  const cronLimit = Number(process.env.CRON_DIGEST_LIMIT || 12);
  const limit = !force && !test ? cronLimit : DIGEST_NEWSLETTER_LIMIT;
  const { emails, total, ignored } = await getDigestWindowEmails({ limit });
  if (!emails.length) return { skipped: true, reason: "empty window", window_days: windowDays };

  const batchCount = getDigestBatchCount(emails);
  const start = Date.now();
  const parts = [];

  for (let i = 0; i < batchCount; i++) {
    if (!force && !test && Date.now() - start > CRON_TIME_BUDGET_MS) {
      throw new Error(
        `Digest timed out after ${i}/${batchCount} batches — send manually from Home (handles batching in the browser).`
      );
    }
    const { data } = await extractDigestBatch(emails, i);
    parts.push(data);
  }

  return sendDigestFromParts({
    parts,
    emails,
    total,
    ignored,
    test,
    force,
    windowDays,
    now,
  });
}
