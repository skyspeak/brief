import { createHash } from "node:crypto";

/**
 * Query params that identify a *campaign*, not a *document*.
 * Newsletters tag links heavily; RSS almost never does. Stripping these is
 * what lets the unique index collapse the two copies into one row.
 */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^mc_/i, // Mailchimp
  /^mkt_/i,
  /^pk_/i, // Matomo
  /^_hs/i, // HubSpot
  /^vero_/i,
  /^ck_subscriber_id$/i, // ConvertKit
  /^ref$/i,
  /^refsrc$/i,
  /^source$/i,
  /^src$/i,
  /^campaign$/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^gbraid$/i,
  /^wbraid$/i,
  /^msclkid$/i,
  /^twclid$/i,
  /^igshid$/i,
  /^yclid$/i,
  /^s$/i, // Substack share token
  /^r$/i, // Substack reader id
  /^publication_id$/i,
  /^post_id$/i,
  /^isFreemail$/i,
  /^triedRedirect$/i,
  /^showWelcomeOnShare$/i,
];

const isTracking = (key) => TRACKING_PARAMS.some((re) => re.test(key));

/**
 * Normalise a URL to a stable identity string.
 * Returns null for anything unparseable so callers can fall back to a
 * title-based hash.
 */
export function canonicalUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  // Scheme and host normalisation
  u.protocol = "https:";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  u.hash = "";
  u.port = "";

  // Drop tracking params, keep the rest sorted for stability
  const kept = [...u.searchParams.entries()]
    .filter(([k]) => !isTracking(k))
    .sort(([a], [b]) => a.localeCompare(b));
  u.search = "";
  for (const [k, v] of kept) u.searchParams.append(k, v);

  // Trailing slash, but never strip the root path
  let out = u.toString();
  if (u.pathname !== "/" && out.endsWith("/")) out = out.slice(0, -1);
  // Some feeds emit "https://host/?" with an empty query
  out = out.replace(/\?$/, "");

  return out;
}

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/**
 * Identity hash for a content item.
 * Prefers the canonical URL. Falls back to source + normalised title, which
 * catches email-only newsletters that have no stable permalink.
 */
export function itemHash({ url, sourceName, title }) {
  const canon = canonicalUrl(url);
  if (canon) return sha256(canon);
  const key = `${(sourceName || "").toLowerCase().trim()}::${normaliseTitle(title)}`;
  return sha256(key);
}

export function normaliseTitle(t) {
  return (t || "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip HTML down to readable text without pulling in a parser dependency. */
export function stripHtml(html, maxChars = 6000) {
  if (!html) return "";
  const text = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > maxChars ? text.slice(0, maxChars) + "\u2026" : text;
}
