// lib/digest-extract.js — JSON digest extraction (newsletter-digest-prompt.md).
import { callLLM, parseJson } from "@/lib/llm";
import { buildDigestExtractPrompt, PERSONA_PROMPTS, DIGEST_PERSONA_KEYS } from "@/lib/prompts";
import { prepareNewsletterContentForDigest, publicationHint } from "@/lib/newsletter-text";

export const DIGEST_BATCH_SIZE = Number(process.env.DIGEST_BATCH_SIZE || 3);
export const DIGEST_NEWSLETTER_CHARS = Number(process.env.DIGEST_NEWSLETTER_CHARS || 5000);
const DIGEST_MAX_TOKENS = Number(process.env.DIGEST_MAX_TOKENS || 8192);

function getDigestBatches(emails) {
  const batches = [];
  for (let i = 0; i < emails.length; i += DIGEST_BATCH_SIZE) {
    batches.push(emails.slice(i, i + DIGEST_BATCH_SIZE));
  }
  return batches;
}

export function getDigestBatchCount(emails) {
  return getDigestBatches(emails).length;
}

const COMPACT_JSON_RETRY = `Your previous response was truncated or invalid JSON. Output ONLY one complete JSON object.
- Max 3 insights (do not pad).
- Each insight: headline + implication, specific numbers, named source.
- Max 30 words per insight. End with a closing brace.`;

function stripJsonFences(text = "") {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

/** Close truncated JSON by balancing brackets outside of strings. */
function closeTruncatedJson(text = "") {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let s = text.slice(start).trimEnd();
  s = s.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/s, "");
  s = s.replace(/,\s*$/s, "");

  const stack = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if ((ch === "}" || ch === "]") && stack.length && stack[stack.length - 1] === ch) {
      stack.pop();
    }
  }

  if (!stack.length && !inString) return null;
  if (inString) s += '"';
  return s + stack.reverse().join("");
}

function parseDigestJson(text) {
  const stripped = stripJsonFences(text);
  try {
    return parseJson(stripped);
  } catch (firstErr) {
    const closed = closeTruncatedJson(stripped);
    if (closed) {
      try {
        const data = JSON.parse(closed);
        if (data && typeof data === "object" && !Array.isArray(data)) {
          console.warn("[digest] salvaged truncated JSON from LLM output");
          return data;
        }
      } catch {
        /* fall through */
      }
    }
    throw firstErr;
  }
}

function cleanUrl(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url.trim());
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_|^ref$|^fbclid$|^mc_|^gclid$/i.test(key) || key.startsWith("utm_")) {
        u.searchParams.delete(key);
      }
    }
    u.hash = "";
    return u.toString();
  } catch {
    return url.trim();
  }
}

function urlInSource(url, source) {
  if (!url) return false;
  const u = url.trim();
  return source.includes(u) || source.includes(decodeURIComponent(u));
}

function validateItems(items, sourceText) {
  for (const item of items || []) {
    if (item.source_url && !urlInSource(item.source_url, sourceText)) {
      item.source_url = null;
      if (!item.source_note) item.source_note = item.source_title || "Newsletter";
    } else if (item.source_url) {
      item.source_url = cleanUrl(item.source_url);
    }
  }
}

/** Drop or null URLs the model invented (not present in input). */
export function validateDigestUrls(data, sourceText) {
  validateItems(data.talking_points, sourceText);
  validateItems(data.stats, sourceText);
  validateItems(data.persona_insights, sourceText);
  validateItems(data.insights, sourceText);
  return data;
}

function buildNewsletterBundle(emails) {
  return emails
    .map((e, i) => {
      const content = prepareNewsletterContentForDigest(e.body_text || "", {
        body_html: e.body_html,
        subject: e.subject,
        sender: e.sender,
        receivedAt: e.received_at,
      }, DIGEST_NEWSLETTER_CHARS);
      const pub = publicationHint({ sender: e.sender, subject: e.subject });
      const name = pub || e.subject || "Newsletter";
      return `--- Newsletter ${i + 1}: ${name} ---\n${content}`;
    })
    .join("\n\n");
}

function mergeList(key, parts, limit = 5) {
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    for (const item of p[key] || []) {
      const sig = JSON.stringify(item).slice(0, 120);
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push(item);
    }
  }
  return out.slice(0, limit);
}

function mergePersonaInsights(parts) {
  const byPersona = new Map();
  for (const p of parts) {
    for (const item of p.persona_insights || []) {
      if (item.persona && !byPersona.has(item.persona)) {
        byPersona.set(item.persona, item);
      }
    }
  }
  return DIGEST_PERSONA_KEYS.map((key) => byPersona.get(key)).filter(Boolean);
}

function mergeInsights(parts, limit = 7) {
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    for (const item of normalizeInsights(p)) {
      const sig = `${item.headline}|${item.source}`.slice(0, 140);
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push(item);
    }
  }
  return out.slice(0, limit);
}

function mergeDigestResults(parts) {
  const insights = mergeInsights(parts);
  return {
    digest_date: parts[0]?.digest_date || new Date().toISOString().slice(0, 10),
    newsletters_processed: [...new Set(parts.flatMap((p) => p.newsletters_processed || []))],
    insights,
    // legacy fields for backward compat with old batch parts
    talking_points: mergeList("talking_points", parts),
    stats: mergeList("stats", parts),
    persona_insights: mergePersonaInsights(parts),
  };
}

async function callExtractPrompt(content, runDate) {
  const { system, user } = buildDigestExtractPrompt({ content, runDate });
  let raw = await callLLM({ system, user, maxTokens: DIGEST_MAX_TOKENS, json: true, maxAttempts: 2 });
  try {
    return parseDigestJson(raw);
  } catch {
    raw = await callLLM({
      system,
      user: `${user}\n\n${COMPACT_JSON_RETRY}`,
      maxTokens: DIGEST_MAX_TOKENS,
      json: true,
      maxAttempts: 1,
    });
    return parseDigestJson(raw);
  }
}

/** Extract one batch (for UI step calls that stay under Vercel's 60s limit). */
export async function extractDigestBatch(emails, batchIndex = 0) {
  if (!emails.length) throw new Error("no newsletters to extract");
  const batches = getDigestBatches(emails);
  if (batchIndex < 0 || batchIndex >= batches.length) {
    throw new Error(`batch ${batchIndex} out of range (0–${batches.length - 1})`);
  }

  const runDate = new Date().toISOString().slice(0, 10);
  const batch = batches[batchIndex];
  const content = buildNewsletterBundle(batch);
  const data = await callExtractPrompt(content, runDate);
  validateDigestUrls(data, content);

  return {
    data,
    batchIndex,
    batchCount: batches.length,
    batchSize: batch.length,
  };
}

/** Merge batch JSON parts into final digest markdown. */
export function finalizeDigestMarkdown(parts, { emails } = {}) {
  const merged = parts.length === 1 ? parts[0] : mergeDigestResults(parts);
  return digestJsonToMarkdown(merged, { emails });
}

/** Run unified digest prompt over stored emails (cron — may exceed 60s if many batches). */
export async function extractDigestJson(emails) {
  if (!emails.length) throw new Error("no newsletters to extract");

  const parts = [];
  const batchCount = getDigestBatchCount(emails);
  for (let i = 0; i < batchCount; i++) {
    const { data } = await extractDigestBatch(emails, i);
    parts.push(data);
  }

  return parts.length === 1 ? parts[0] : mergeDigestResults(parts);
}

function linkLine(item) {
  if (item.source_url) return `  Source: [${item.source_title || "link"}](${item.source_url})`;
  if (item.source_note) return `  Source: ${item.source_note}`;
  if (item.source_title) return `  Source: ${item.source_title}`;
  return "";
}

function personaHeading(item) {
  const p = PERSONA_PROMPTS[item.persona];
  return p?.role || item.role || item.persona;
}

const LENS_LABELS = {
  general: "GM",
  sales: "Sales",
  marketing: "Marketing",
  engineering: "Engineering",
  product: "Product",
};

/** Normalize legacy and new insight shapes into { headline, implication, source, source_url, lens }. */
export function normalizeInsights(data) {
  if (!data) return [];
  const out = [];

  for (const item of data.insights || []) {
    if (item.headline) {
      out.push({
        headline: item.headline,
        implication: item.implication || "",
        source: item.source || item.source_title || item.source_note || "",
        source_url: item.source_url || null,
        lens: item.lens || item.persona || null,
      });
    } else if (item.insight) {
      out.push({
        headline: item.insight,
        implication: item.implication || "",
        source: item.source_title || item.source_note || "",
        source_url: item.source_url || null,
        lens: item.persona || null,
      });
    }
  }

  for (const item of data.talking_points || []) {
    out.push({
      headline: item.point || "",
      implication: item.why_it_matters || "",
      source: item.source_title || item.source_note || "",
      source_url: item.source_url || null,
      lens: null,
    });
  }

  for (const item of data.stats || []) {
    out.push({
      headline: item.stat || "",
      implication: item.context || "",
      source: item.source_title || item.source_note || "",
      source_url: item.source_url || null,
      lens: null,
    });
  }

  for (const item of data.persona_insights || []) {
    out.push({
      headline: item.insight || "",
      implication: item.implication || "",
      source: item.source_title || item.source_note || "",
      source_url: item.source_url || null,
      lens: item.persona || null,
    });
  }

  return out.filter((i) => i.headline?.trim());
}

function formatDateRange(emails) {
  if (!emails?.length) return null;
  const ts = emails.map((e) => e.received_at).filter(Boolean);
  if (!ts.length) return null;
  const min = Math.min(...ts);
  const max = Math.max(...ts);
  const fmt = (s) =>
    new Date(s * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const days = Math.max(1, Math.ceil((max - min) / 86400) + 1);
  const range = min === max ? fmt(min) : `${fmt(min)}–${fmt(max).replace(/^[A-Za-z]+ /, "")}`;
  return { count: emails.length, days, range };
}

export function buildScanSummary(emails, insightCount) {
  const meta = formatDateRange(emails);
  const n = insightCount ?? 0;
  if (!meta) {
    return `Distilled ${n} sharp insight${n === 1 ? "" : "s"} from your newsletters.`;
  }
  return `Scanned ${meta.count} message${meta.count === 1 ? "" : "s"} across ${meta.days} day${meta.days === 1 ? "" : "s"} (${meta.range}). Distilled ${n} sharp insight${n === 1 ? "" : "s"}:`;
}

/** Format JSON digest for email / UI (markdown). */
export function digestJsonToMarkdown(data, { emails } = {}) {
  const date = data.digest_date || new Date().toISOString().slice(0, 10);
  const insights = normalizeInsights(data);
  const sources = [...new Set(insights.map((i) => i.source).filter(Boolean))];
  const scanLine = data.scan_summary || buildScanSummary(emails, insights.length);

  const lines = [`# THE BRIEF — ${date}`, "", scanLine, ""];

  insights.forEach((item, i) => {
    const impl = item.implication ? ` — ${item.implication}` : "";
    lines.push(`${i + 1}. **${item.headline}**${impl}`);
    if (item.source) {
      const src = item.source_url
        ? `[${item.source}](${item.source_url})`
        : item.source;
      const badge = item.lens && LENS_LABELS[item.lens] ? ` · ${LENS_LABELS[item.lens]}` : "";
      lines.push(`   *${src}${badge}*`);
    }
    lines.push("");
  });

  if (sources.length) {
    lines.push(
      `---`,
      "",
      `*All insights grounded in named sources (${sources.slice(0, 8).join(", ")}${sources.length > 8 ? ", …" : ""}) with specific numbers and dated claims.*`
    );
  }

  return lines.join("\n").trim();
}

export async function buildDigestFromEmails(emails) {
  const data = await extractDigestJson(emails);
  const markdown = digestJsonToMarkdown(data);
  return { markdown, data };
}
