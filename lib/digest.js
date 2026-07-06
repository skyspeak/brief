// lib/digest.js — scheduled run: one neutral digest email with persona insights.
import { recentEmails, markDigested, getLastDigestRun, setLastDigestRun } from "@/lib/db";
import { buildDigest } from "@/lib/issue";
import { sendDigest } from "@/lib/gmail";
import { digestTitleFromMarkdown } from "@/lib/markdown";
import { DEFAULT_DIGEST_TO } from "@/lib/personas";

export async function runDigest({ force = false } = {}) {
  const intervalDays = Number(process.env.DIGEST_INTERVAL_DAYS || 3);
  const windowDays = Number(process.env.DIGEST_WINDOW_DAYS || intervalDays);
  const now = Math.floor(Date.now() / 1000);

  if (!force) {
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
  const emails = await recentEmails(since);
  if (!emails.length) return { skipped: true, reason: "empty window", window_days: windowDays };

  const markdown = await buildDigest(emails, "neutral", windowDays);
  const edition = {
    persona: "neutral",
    label: "Digest",
    title: digestTitleFromMarkdown(markdown),
    markdown,
  };

  try {
    await sendDigest({
      markdown,
      sourceCount: emails.length,
      to: process.env.DIGEST_TO || DEFAULT_DIGEST_TO,
      personaLabel: "",
    });
    edition.sent = true;
  } catch (e) {
    edition.sent = false;
    edition.error = e.message;
    if (!force) throw e;
    return {
      sent: false,
      reason: "send_failed",
      sources: emails.length,
      editions: [edition],
      interval_days: intervalDays,
      window_days: windowDays,
    };
  }

  await markDigested(emails.map((e) => e.id));
  await setLastDigestRun(now);

  return {
    sent: true,
    sources: emails.length,
    editions: [edition],
    interval_days: intervalDays,
    window_days: windowDays,
    sent_at: now,
  };
}
