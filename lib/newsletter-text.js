// lib/newsletter-text.js — strip email noise before map-step extraction.

const TRACKING_HOSTS =
  /email\.mg\d*\.substack\.com|mail\.chi\.substack\.com|click\.|track\.|list-manage\.com/i;

const FOOTER_START =
  /^(unsubscribe|manage (your )?preferences|view (this )?email in (your )?browser|forward this|get the app|sent (to|with)|you('re| are) receiving|©|copyright|\d{4} .+ all rights)/i;

/** Replace anchor tags with visible label text (drop naked tracking URLs). */
function linksToLabels(html = "") {
  return html.replace(/<a[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, inner) => {
    const label = inner
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!label || label.length < 3) return "";
    if (/^(you sub|click here|read more|here|link)$/i.test(label)) return "";
    if (TRACKING_HOSTS.test(url) && label.length < 40) return label;
    if (/^https?:\/\//i.test(label)) return "";
    return label;
  });
}

function stripTrackingUrls(text = "") {
  return text
    .replace(/https?:\/\/email\.mg\d*\.substack\.com\/c\/[^\s)\]"']+/gi, "")
    .replace(/https?:\/\/[^\s)\]"']{90,}/gi, "")
    .replace(/\[([^\]]{0,3})\]/g, "")
    .replace(/\bhttps?:\/\/\S+/gi, "");
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
    if (FOOTER_START.test(line) || /unsubscribe|opt out|privacy policy/i.test(line)) {
      inFooter = true;
    }
    if (inFooter) continue;
    if (/^\d+% off|subscribe for|upgrade to paid|gift a subscription/i.test(line)) continue;
    kept.push(line);
  }

  return kept.join("\n");
}

export function publicationHint({ sender = "", subject = "" } = {}) {
  const fromName = sender.match(/^([^<]+)</)?.[1]?.trim();
  if (fromName && !fromName.includes("@")) return fromName;
  const subjPub = subject.match(/^([^—–|-]+)/)?.[1]?.trim();
  return subjPub || "";
}

/** Normalize stored body (plain or HTML remnants) for LLM map step. */
export function prepareNewsletterText(body = "", meta = {}) {
  const looksHtml = /<[a-z][\s\S]*>/i.test(body);
  let text = looksHtml ? linksToLabels(body) : body;

  text = text
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');

  text = stripTrackingUrls(text);
  text = dropFooterLines(text);
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();

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

  return (header + text).slice(0, 8000);
}
