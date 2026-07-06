// lib/newsletter-text.js — strip email noise before storage and map-step extraction.

const TRACKING_HOSTS =
  /email\.mg\d*\.substack\.com|mail\.chi\.substack\.com|eotrx\.substack\.com|click\.|track\.|list-manage\.com|beehiiv\.com\/click|ck\.page|convertkit\.com|mailchi\.mp/i;

const FOOTER_START =
  /^(unsubscribe|manage (your )?preferences|view (this )?email in (your )?browser|forward this|get the app|sent (to|with)|you('re| are) receiving|©|copyright|\d{4} .+ all rights|powered by substack|read on substack)/i;

const JUNK_LABEL = /^(you sub|click here|read more|here|link|→|»|›)$/i;

/** Replace anchor tags with visible label text (drop naked tracking URLs). */
function linksToLabels(html = "") {
  return html.replace(/<a[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, inner) => {
    const label = inner
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!label || label.length < 3 || JUNK_LABEL.test(label)) return "";
    if (/^https?:\/\//i.test(label)) return "";
    if (TRACKING_HOSTS.test(url) && label.length < 60) return label;
    return label;
  });
}

function decodeEntities(s = "") {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/gi, " ");
}

function stripTrackingUrls(text = "") {
  return text
    .replace(/https?:\/\/email\.mg\d*\.substack\.com\/c\/[^\s)\]"']+/gi, "")
    .replace(/https?:\/\/[^\s)\]"']{80,}/gi, "")
    .replace(/\bhttps?:\/\/\S+/gi, "")
    .replace(/\[([^\]]{0,4})\]/g, "");
}

function dropFooterLines(text = "") {
  const lines = text.split("\n");
  const kept = [];
  let inFooter = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (!inFooter) kept.push("");
      continue;
    }
    if (FOOTER_START.test(line) || /unsubscribe|opt out|privacy policy|email preferences/i.test(line)) {
      inFooter = true;
    }
    if (inFooter) continue;
    if (/^\d+% off|subscribe for|upgrade to paid|gift a subscription|refer a friend/i.test(line)) {
      continue;
    }
    kept.push(line);
  }

  return kept.join("\n");
}

function htmlToCleanText(raw = "") {
  let text = raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");

  if (/<[a-z][\s\S]*>/i.test(text)) {
    text = linksToLabels(text);
    text = text
      .replace(/<\/(p|div|tr|li|h[1-6]|table|section|article)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ");
  }

  text = decodeEntities(text);
  text = stripTrackingUrls(text);
  text = dropFooterLines(text);
  text = text
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();

  return text;
}

export function publicationHint({ sender = "", subject = "" } = {}) {
  const fromName = sender.match(/^([^<]+)</)?.[1]?.trim();
  if (fromName && !fromName.includes("@")) return fromName;
  const subjPub = subject.match(/^([^—–|-]+)/)?.[1]?.trim();
  return subjPub || "";
}

/** Clean newsletter content for storage (no LLM header). Prefers HTML when available. */
export function cleanNewsletterContent(raw = "", meta = {}) {
  const source =
    meta.body_html && meta.body_html.length > 80 ? meta.body_html : raw || meta.body_text || "";
  return htmlToCleanText(source);
}

/** Plain text for digest extraction — preserves links as "label (url)" per prompt spec. */
export function prepareNewsletterContentForDigest(body = "", meta = {}, maxChars = 12000) {
  let source =
    meta.body_html && meta.body_html.length > 80 ? meta.body_html : body || meta.body_text || "";

  if (/<[a-z][\s\S]*>/i.test(source)) {
    source = source
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<a[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, inner) => {
        const label = inner
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (!label) return ` (${url}) `;
        if (/^https?:\/\//i.test(label)) return ` ${url} `;
        return ` ${label} (${url}) `;
      })
      .replace(/<\/(p|div|tr|li|h[1-6]|table|section|article)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ");
  }

  let text = decodeEntities(source);
  text = dropFooterLines(text);
  text = text
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();

  const pub = publicationHint(meta);
  const header = [
    `Subject: ${meta.subject || ""}`,
    `From: ${meta.sender || ""}`,
    pub ? `Publication: ${pub}` : null,
    meta.receivedAt
      ? `Date: ${new Date(meta.receivedAt * 1000).toISOString().slice(0, 10)}`
      : null,
    "",
  ]
    .filter(Boolean)
    .join("\n");

  return (header + text).slice(0, maxChars);
}

/** Normalize stored body for LLM map step (includes metadata header). */
export function prepareNewsletterText(body = "", meta = {}) {
  const cleaned = cleanNewsletterContent(body, meta);
  const pub = publicationHint(meta);
  const header = [
    `Subject: ${meta.subject || ""}`,
    `From: ${meta.sender || ""}`,
    pub ? `Publication hint: ${pub}` : null,
    meta.receivedAt
      ? `Received: ${new Date(meta.receivedAt * 1000).toISOString().slice(0, 10)}`
      : null,
    "",
  ]
    .filter(Boolean)
    .join("\n");

  return (header + cleaned).slice(0, 8000);
}
