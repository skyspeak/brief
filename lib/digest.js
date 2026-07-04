// lib/digest.js — scheduled run: one tailored digest per persona.
import { recentEmails, markDigested, getLastDigestRun, setLastDigestRun } from "@/lib/db";
import { buildDigest } from "@/lib/issue";
import { sendDigest } from "@/lib/resend";
import { digestTitleFromMarkdown } from "@/lib/markdown";
import { PERSONAS } from "@/lib/personas";

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

  const active = PERSONAS.filter((p) => p.digest !== false);
  if (!active.length) return { skipped: true, reason: "no active personas" };

  const results = [];
  for (const p of active) {
    const markdown = await buildDigest(emails, p.personaKey || p.id, windowDays);
    await sendDigest({
      markdown,
      sourceCount: emails.length,
      to: p.to,
      personaLabel: p.label,
    });
    results.push({ persona: p.id, title: digestTitleFromMarkdown(markdown) });
  }

  await markDigested(emails.map((e) => e.id));
  await setLastDigestRun(now);

  return {
    sent: true,
    sources: emails.length,
    editions: results,
    interval_days: intervalDays,
    window_days: windowDays,
    sent_at: now,
  };
}
