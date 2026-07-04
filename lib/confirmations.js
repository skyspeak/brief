// lib/confirmations.js — detect subscription confirmations and extract action links.
import { extractAnchorLinks } from "@/lib/html";

const CONFIRM_SUBJECT =
  /confirm|verif(y|ication)?|activ(at(e|ion))?|subscri(be|ption)|opt[- ]?in|one more step|complete your|click to (join|subscribe)|almost (subscribed|there)|validate your|finish signing up|thanks for subscribing/i;

const CONFIRM_BODY =
  /confirm your (email|subscription|address)|verify your (email|subscription|address)|activate your|complete (your )?subscription|click (the )?(link|button) (below|above)|opt[- ]?in to|verify (this )?email|yes,? subscribe me/i;

const CONFIRM_LABEL =
  /confirm|verify|activ|subscribe|opt[- ]?in|yes|complete|join|finish/i;

const SKIP_URL =
  /unsubscribe|opt-out|optout|privacy-policy|privacy_policy|\/privacy|email-preferences|manage-preferences|list-manage|preferences\?|mailto:|twitter\.com|facebook\.com|linkedin\.com|instagram\.com|\.png|\.jpg|\.gif|open\.track|fonts\.google/i;

const CONFIRM_URL =
  /confirm|verif|activ|subscribe|subscri|opt[-_]?in|token=|magic|click\.|jwt=|signup|double/i;

export function extractUrls(text = "") {
  const found = [];
  const re = /https?:\/\/[^\s<>"')\]]+/gi;
  let m;
  while ((m = re.exec(text))) {
    found.push(m[0].replace(/[.,;:!?)]+$/, ""));
  }
  return [...new Set(found)];
}

export function isConfirmationEmail({ subject = "", body_text = "", body_html = "" }) {
  const blob = `${subject}\n${body_text}\n${body_html}`;
  return CONFIRM_SUBJECT.test(subject) || CONFIRM_BODY.test(blob);
}

function linkScore({ url, label = "" }) {
  let score = 0;
  if (CONFIRM_URL.test(url)) score += 3;
  if (CONFIRM_LABEL.test(label)) score += 4;
  if (SKIP_URL.test(url)) score -= 10;
  return score;
}

export function extractConfirmationLinks({ body_text = "", body_html = "" }) {
  const candidates = [];

  for (const { url, label } of extractAnchorLinks(body_html)) {
    candidates.push({ url, label, source: "anchor" });
  }
  for (const url of extractUrls(body_text)) {
    candidates.push({ url, label: "", source: "text" });
  }
  for (const url of extractUrls(body_html)) {
    candidates.push({ url, label: "", source: "html" });
  }

  const seen = new Set();
  const ranked = [];

  for (const c of candidates) {
    const url = c.url.replace(/[.,;:!?)]+$/, "");
    if (!url.startsWith("http") || seen.has(url) || SKIP_URL.test(url)) continue;
    seen.add(url);
    ranked.push({ ...c, url, score: linkScore({ url, label: c.label }) });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

export function parseConfirmation(email) {
  const ranked = extractConfirmationLinks(email);
  const links = ranked.map((r) => r.url);
  const likely = isConfirmationEmail(email) || ranked.some((r) => r.score >= 3);

  if (!likely) return null;

  const primary = ranked[0];
  const snippet = (email.body_text || "").replace(/\s+/g, " ").trim().slice(0, 220);

  return {
    id: email.id,
    sender: email.sender,
    subject: email.subject || "(no subject)",
    received_at: email.received_at,
    confirmed_at: email.confirmed_at || null,
    links,
    linkDetails: ranked.slice(0, 8).map((r) => ({
      url: r.url,
      label: r.label || null,
      source: r.source,
    })),
    primaryLink: primary?.url || null,
    primaryLabel: primary?.label || "Confirm subscription",
    needsManualReview: !links.length,
    snippet: snippet ? snippet + (email.body_text?.length > 220 ? "…" : "") : "",
    status: email.confirmed_at ? "confirmed" : links.length ? "pending" : "manual",
  };
}

export function listConfirmations(emails) {
  return emails.map(parseConfirmation).filter(Boolean);
}
