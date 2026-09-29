// lib/verification-desk.js — weekly Verification Desk: Gemini search → grade → Gmail.
import { callLLM, parseJson } from "@/lib/llm";
import { sendHtmlEmail, isGmailConnected, markGmailOk, markGmailError } from "@/lib/gmail";
import { getAppState, setAppState } from "@/lib/db";
import {
  researchSystemPrompt,
  researchUserPrompt,
} from "@/lib/verification-desk-prompts";

const LAST_RUN_KEY = "verification_desk_last_run_at";
const LAST_SUMMARY_KEY = "verification_desk_last_summary";
const MIN_INTERVAL_SEC = 6 * 86400; // skip if run within ~6 days unless force

const COLORS = {
  ink: "#14171a",
  secondary: "#3d4348",
  muted: "#6b7379",
  accent: "#B4162B",
  blue: "#12456b",
  green: "#1c5c3f",
  outer: "#eef0f2",
  white: "#ffffff",
  bandNo: "#3d4348",
  bandDrift: "#12456b",
  bandTripped: "#B4162B",
};

export function verificationDeskTo() {
  return (process.env.VERIFICATION_DESK_TO || "stuymusty@gmail.com").trim();
}

export async function getLastVerificationDeskRun() {
  const v = await getAppState(LAST_RUN_KEY);
  return v ? Number(v) : null;
}

async function getPriorSummary() {
  return (await getAppState(LAST_SUMMARY_KEY)) || null;
}

async function saveRunMeta({ now, summary }) {
  await setAppState(LAST_RUN_KEY, String(now));
  if (summary) await setAppState(LAST_SUMMARY_KEY, summary.slice(0, 4000));
}

/** Format like "28 Sep" in America/Los_Angeles. */
export function formatDeskDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Los_Angeles",
    day: "numeric",
    month: "short",
  }).format(d);
}

export function formatWeekOf(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeGrade(g) {
  const u = String(g || "")
    .toUpperCase()
    .replace(/_/g, " ")
    .trim();
  if (u.includes("TRIP")) return "TRIPPED";
  if (u.includes("DRIFT")) return "DRIFT";
  return "NO MOVEMENT";
}

function bandColor(grade) {
  if (grade === "TRIPPED") return COLORS.bandTripped;
  if (grade === "DRIFT") return COLORS.bandDrift;
  return COLORS.bandNo;
}

function normalizeDigest(raw) {
  const grade = normalizeGrade(raw.grade);
  const headline = String(raw.headline || "quiet week").trim().slice(0, 80);
  const verdict = String(raw.verdict || "").trim();
  const tripwires = Array.isArray(raw.tripwires)
    ? raw.tripwires
        .map((t) => ({
          id: String(t.id || "").trim(),
          status: String(t.status || "quiet").toLowerCase(),
          note: String(t.note || "").trim(),
        }))
        .filter((t) => t.id && (t.status === "drift" || t.status === "tripped" || t.note))
    : [];
  const changes = Array.isArray(raw.changes)
    ? raw.changes
        .map((c) => ({
          claim: String(c.claim || "").trim(),
          source: String(c.source || "").trim(),
          date: String(c.date || "").trim(),
          url: String(c.url || "").trim(),
          kind: String(c.kind || "reporting").trim(),
        }))
        .filter((c) => c.claim)
    : [];
  const shortlist_implication =
    raw.shortlist_implication == null || raw.shortlist_implication === ""
      ? null
      : String(raw.shortlist_implication).trim();
  const ignored = String(raw.ignored || "").trim();
  return { grade, headline, verdict, tripwires, changes, shortlist_implication, ignored };
}

export function buildSubject(digest, dateLabel = formatDeskDate()) {
  return `Verification Desk — ${dateLabel} — ${digest.grade}: ${digest.headline}`;
}

export function renderVerificationDeskHtml(digest, { dateLabel = formatDeskDate() } = {}) {
  const grade = digest.grade;
  const accent = bandColor(grade);

  const tripRows = (digest.tripwires || [])
    .filter((t) => t.status === "drift" || t.status === "tripped")
    .map(
      (t) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e8eaed;font-family:Courier,monospace;font-size:13px;color:${COLORS.accent};width:48px;vertical-align:top;">${esc(t.id)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #e8eaed;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${COLORS.ink};vertical-align:top;">
          <span style="font-family:Courier,monospace;font-size:11px;letter-spacing:0.04em;color:${t.status === "tripped" ? COLORS.accent : COLORS.blue};text-transform:uppercase;">${esc(t.status)}</span>
          ${t.note ? `<div style="margin-top:4px;color:${COLORS.secondary};">${esc(t.note)}</div>` : ""}
        </td>
      </tr>`
    )
    .join("");

  const changeRows = (digest.changes || [])
    .map((c) => {
      const meta = [c.kind, c.source, c.date].filter(Boolean).join(" · ");
      const link =
        c.url && /^https?:\/\//i.test(c.url)
          ? ` <a href="${esc(c.url)}" style="color:${COLORS.blue};">source</a>`
          : "";
      return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e8eaed;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${COLORS.ink};line-height:1.45;">
          ${esc(c.claim)}
          ${meta ? `<div style="margin-top:4px;font-family:Courier,monospace;font-size:11px;color:${COLORS.muted};">${esc(meta)}${link}</div>` : ""}
        </td>
      </tr>`;
    })
    .join("");

  const tripSection = tripRows
    ? `
    <tr><td style="padding:20px 28px 0;">
      <div style="font-family:Courier,monospace;font-size:11px;letter-spacing:0.08em;color:${COLORS.muted};text-transform:uppercase;margin-bottom:8px;">Tripwire status</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${tripRows}</table>
    </td></tr>`
    : "";

  const changeSection = changeRows
    ? `
    <tr><td style="padding:20px 28px 0;">
      <div style="font-family:Courier,monospace;font-size:11px;letter-spacing:0.08em;color:${COLORS.muted};text-transform:uppercase;margin-bottom:8px;">What changed</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${changeRows}</table>
    </td></tr>`
    : "";

  const shortlistSection = digest.shortlist_implication
    ? `
    <tr><td style="padding:20px 28px 0;">
      <div style="font-family:Courier,monospace;font-size:11px;letter-spacing:0.08em;color:${COLORS.muted};text-transform:uppercase;margin-bottom:8px;">Shortlist</div>
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:${COLORS.ink};">${esc(digest.shortlist_implication)}</p>
    </td></tr>`
    : "";

  const ignoredSection = digest.ignored
    ? `
    <tr><td style="padding:20px 28px 28px;">
      <div style="font-family:Courier,monospace;font-size:11px;letter-spacing:0.08em;color:${COLORS.muted};text-transform:uppercase;margin-bottom:8px;">Deliberately ignored</div>
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:${COLORS.muted};">${esc(digest.ignored)}</p>
    </td></tr>`
    : `<tr><td style="padding:0 0 28px;"></td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(buildSubject(digest, dateLabel))}</title></head>
<body style="margin:0;padding:0;background:${COLORS.outer};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.outer};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${COLORS.white};">
        <tr>
          <td style="background:${accent};padding:14px 28px;">
            <div style="font-family:Courier,monospace;font-size:12px;letter-spacing:0.12em;color:#ffffff;text-transform:uppercase;">${esc(grade)}</div>
            <div style="font-family:Georgia,serif;font-size:22px;line-height:1.25;color:#ffffff;margin-top:6px;">${esc(digest.headline)}</div>
            <div style="font-family:Courier,monospace;font-size:11px;color:rgba(255,255,255,0.85);margin-top:8px;">Verification Desk · ${esc(dateLabel)}</div>
          </td>
        </tr>
        <tr><td style="padding:24px 28px 0;">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:${COLORS.ink};">${esc(digest.verdict)}</p>
        </td></tr>
        ${tripSection}
        ${changeSection}
        ${shortlistSection}
        ${ignoredSection}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderVerificationDeskText(digest, { dateLabel = formatDeskDate() } = {}) {
  const lines = [
    `Verification Desk — ${dateLabel}`,
    `${digest.grade}: ${digest.headline}`,
    "",
    digest.verdict,
  ];

  const moving = (digest.tripwires || []).filter(
    (t) => t.status === "drift" || t.status === "tripped"
  );
  if (moving.length) {
    lines.push("", "TRIPWIRE STATUS");
    for (const t of moving) {
      lines.push(`${t.id} [${t.status}] ${t.note || ""}`.trim());
    }
  }

  if (digest.changes?.length) {
    lines.push("", "WHAT CHANGED");
    for (const c of digest.changes) {
      const meta = [c.kind, c.source, c.date].filter(Boolean).join(" · ");
      lines.push(`- ${c.claim}${meta ? ` (${meta})` : ""}${c.url ? ` ${c.url}` : ""}`);
    }
  }

  if (digest.shortlist_implication) {
    lines.push("", "SHORTLIST", digest.shortlist_implication);
  }
  if (digest.ignored) {
    lines.push("", "DELIBERATELY IGNORED", digest.ignored);
  }
  return lines.join("\n");
}

function summaryForMemory(digest) {
  return [
    `grade=${digest.grade}`,
    `headline=${digest.headline}`,
    digest.verdict,
    ...(digest.changes || []).slice(0, 5).map((c) => `- ${c.claim} (${c.source})`),
  ].join("\n");
}

export async function researchVerificationDesk({ weekOf } = {}) {
  const prior = await getPriorSummary();
  const text = await callLLM({
    system: researchSystemPrompt(),
    user: researchUserPrompt({
      weekOf: weekOf || formatWeekOf(),
      priorSummary: prior,
    }),
    maxTokens: 4096,
    googleSearch: true,
    // Search grounding works best on a current Gemini; override if GEMINI_MODEL is flash-lite.
    model: process.env.VERIFICATION_DESK_MODEL || process.env.GEMINI_MODEL || "gemini-2.0-flash",
  });
  return normalizeDigest(parseJson(text));
}

/**
 * Build (and optionally send) the weekly Verification Desk email.
 * @param {{ force?: boolean, test?: boolean, dryRun?: boolean }} opts
 */
export async function runVerificationDesk({ force = false, test = false, dryRun = false } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const last = await getLastVerificationDeskRun();
  if (!force && !test && last && now - last < MIN_INTERVAL_SEC) {
    return {
      skipped: true,
      reason: "interval",
      next_run_at: last + MIN_INTERVAL_SEC,
      last_run_at: last,
    };
  }

  const dateLabel = formatDeskDate();
  const digest = await researchVerificationDesk({ weekOf: formatWeekOf() });
  const subject = buildSubject(digest, dateLabel);
  const html = renderVerificationDeskHtml(digest, { dateLabel });
  const text = renderVerificationDeskText(digest, { dateLabel });
  const to = verificationDeskTo();

  const result = {
    skipped: false,
    grade: digest.grade,
    headline: digest.headline,
    subject,
    to,
    digest,
    html,
    text,
    sent: false,
    dry_run: !!dryRun,
    test: !!test,
  };

  if (dryRun) return result;

  if (!(await isGmailConnected())) {
    return { ...result, error: "Gmail not connected — open Setup and connect your account" };
  }

  try {
    const sent = await sendHtmlEmail({
      to,
      subject,
      html,
      text,
      fromName: "Verification Desk",
    });
    await markGmailOk();
    if (!test) await saveRunMeta({ now, summary: summaryForMemory(digest) });
    return {
      ...result,
      sent: true,
      id: sent.id,
      from: sent.from,
    };
  } catch (e) {
    await markGmailError(e);
    return {
      ...result,
      sent: false,
      error: e.message || String(e),
    };
  }
}
