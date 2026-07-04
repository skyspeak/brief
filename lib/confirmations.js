// lib/confirmations.js — detect subscription confirmations and extract action links.

const CONFIRM_SUBJECT =
  /confirm|verif(y|ication)?|activ(at(e|ion))?|subscri(be|ption)|opt[- ]?in|one more step|complete your|click to (join|subscribe)|almost (subscribed|there)|validate your/i;

const CONFIRM_BODY =
  /confirm your (email|subscription|address)|verify your (email|subscription|address)|activate your|complete (your )?subscription|click (the )?(link|button) (below|above)|opt[- ]?in to|verify (this )?email/i;

const SKIP_URL =
  /unsubscribe|opt-out|optout|privacy-policy|privacy_policy|\/privacy|email-preferences|manage-preferences|list-manage|preferences\?|mailto:|twitter\.com|facebook\.com|linkedin\.com|instagram\.com|\.png|\.jpg|\.gif|open\.track/i;

const CONFIRM_URL =
  /confirm|verif|activ|subscribe|subscri|opt[-_]?in|token=|magic|click\./i;

export function extractUrls(text = "") {
  const found = [];
  const re = /https?:\/\/[^\s<>"')\]]+/gi;
  let m;
  while ((m = re.exec(text))) {
    found.push(m[0].replace(/[.,;:!?)]+$/, ""));
  }
  return [...new Set(found)];
}

export function isConfirmationEmail({ subject = "", body_text = "" }) {
  return CONFIRM_SUBJECT.test(subject) || CONFIRM_BODY.test(body_text);
}

export function rankConfirmationLinks(urls) {
  return urls
    .filter((u) => !SKIP_URL.test(u))
    .sort((a, b) => Number(CONFIRM_URL.test(b)) - Number(CONFIRM_URL.test(a)));
}

export function parseConfirmation(email) {
  const links = rankConfirmationLinks(extractUrls(email.body_text || ""));
  const likely = isConfirmationEmail(email) || links.some((u) => CONFIRM_URL.test(u));

  if (!likely) return null;

  return {
    id: email.id,
    sender: email.sender,
    subject: email.subject || "(no subject)",
    received_at: email.received_at,
    links,
    primaryLink: links[0] || null,
    needsManualReview: !links.length,
  };
}

export function listConfirmations(emails) {
  return emails.map(parseConfirmation).filter(Boolean);
}
