// lib/digest-extract.js — JSON digest extraction (newsletter-digest-prompt.md).
import { callLLM, parseJson } from "@/lib/llm";
import { buildDigestExtractPrompt, PERSONA_PROMPTS, DIGEST_PERSONA_KEYS } from "@/lib/prompts";
import { prepareNewsletterContentForDigest, publicationHint } from "@/lib/newsletter-text";

export const DIGEST_BATCH_SIZE = Number(process.env.DIGEST_BATCH_SIZE || 8);

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

function stripJsonFences(text = "") {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function parseDigestJson(text) {
  return parseJson(stripJsonFences(text));
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
      });
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

function mergeDigestResults(parts) {
  return {
    digest_date: parts[0]?.digest_date || new Date().toISOString().slice(0, 10),
    newsletters_processed: [...new Set(parts.flatMap((p) => p.newsletters_processed || []))],
    talking_points: mergeList("talking_points", parts),
    stats: mergeList("stats", parts),
    persona_insights: mergePersonaInsights(parts),
  };
}

async function callExtractPrompt(content, runDate) {
  const { system, user } = buildDigestExtractPrompt({ content, runDate });
  let raw = await callLLM({ system, user, maxTokens: 4096, json: true, maxAttempts: 2 });
  try {
    return parseDigestJson(raw);
  } catch {
    raw = await callLLM({
      system,
      user: `${user}\n\nYour previous output was invalid JSON. Output only the corrected JSON object.`,
      maxTokens: 4096,
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
export function finalizeDigestMarkdown(parts) {
  const merged = parts.length === 1 ? parts[0] : mergeDigestResults(parts);
  return digestJsonToMarkdown(merged);
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

/** Format JSON digest for email / UI (markdown). */
export function digestJsonToMarkdown(data) {
  const date = data.digest_date || new Date().toISOString().slice(0, 10);
  const lines = [`# ${date} Digest — Talking Points, Stats & Insights`, ""];

  if (data.newsletters_processed?.length) {
    lines.push(`*From: ${data.newsletters_processed.join(", ")}*`, "");
  }

  lines.push("## 💬 Talking Points", "");
  for (const item of data.talking_points || []) {
    lines.push(`- **${item.point}**`);
    if (item.why_it_matters) lines.push(`  ${item.why_it_matters}`);
    const link = linkLine(item);
    if (link) lines.push(link);
    lines.push("");
  }

  lines.push("## 📊 Stats", "");
  for (const item of data.stats || []) {
    lines.push(`- **${item.stat}**`);
    if (item.context) lines.push(`  ${item.context}`);
    const link = linkLine(item);
    if (link) lines.push(link);
    lines.push("");
  }

  lines.push("## 👥 Insights by Role", "");
  const personaItems = data.persona_insights?.length
    ? data.persona_insights
    : (data.insights || []).map((item) => ({ ...item, persona: "general", role: "General" }));

  for (const item of personaItems) {
    lines.push(`### ${personaHeading(item)}`);
    lines.push(`- **${item.insight}**`);
    if (item.implication) lines.push(`  ${item.implication}`);
    const link = linkLine(item);
    if (link) lines.push(link);
    lines.push("");
  }

  return lines.join("\n").trim();
}

export async function buildDigestFromEmails(emails) {
  const data = await extractDigestJson(emails);
  const markdown = digestJsonToMarkdown(data);
  return { markdown, data };
}
