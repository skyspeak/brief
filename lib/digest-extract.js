// lib/digest-extract.js — JSON digest extraction (newsletter-digest-prompt.md).
import { callLLM, parseJson } from "@/lib/llm";
import { buildDigestExtractPrompt } from "@/lib/prompts";
import { prepareNewsletterContentForDigest, publicationHint } from "@/lib/newsletter-text";

const BATCH_SIZE = Number(process.env.DIGEST_BATCH_SIZE || 12);

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

/** Drop or null URLs the model invented (not present in input). */
export function validateDigestUrls(data, sourceText) {
  for (const key of ["talking_points", "stats", "insights"]) {
    for (const item of data[key] || []) {
      if (item.source_url && !urlInSource(item.source_url, sourceText)) {
        item.source_url = null;
        if (!item.source_note) item.source_note = item.source_title || "Newsletter";
      } else if (item.source_url) {
        item.source_url = cleanUrl(item.source_url);
      }
    }
  }
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

function mergeDigestResults(parts) {
  const merge = (key) => {
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
    return out.slice(0, 5);
  };

  return {
    digest_date: parts[0]?.digest_date || new Date().toISOString().slice(0, 10),
    newsletters_processed: [...new Set(parts.flatMap((p) => p.newsletters_processed || []))],
    talking_points: merge("talking_points"),
    stats: merge("stats"),
    insights: merge("insights"),
  };
}

async function callExtractPrompt(content, personaKey, runDate) {
  const { system, user } = buildDigestExtractPrompt({ content, personaKey, runDate });
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

/** Run newsletter-digest-prompt.md over one or more stored emails. */
export async function extractDigestJson(emails, personaKey = "general") {
  if (!emails.length) throw new Error("no newsletters to extract");

  const runDate = new Date().toISOString().slice(0, 10);
  const batches = [];
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    batches.push(emails.slice(i, i + BATCH_SIZE));
  }

  const parts = [];
  for (const batch of batches) {
    const content = buildNewsletterBundle(batch);
    const data = await callExtractPrompt(content, personaKey, runDate);
    validateDigestUrls(data, content);
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

  lines.push("## 💡 Insights", "");
  for (const item of data.insights || []) {
    lines.push(`- **${item.insight}**`);
    if (item.implication) lines.push(`  ${item.implication}`);
    const link = linkLine(item);
    if (link) lines.push(link);
    lines.push("");
  }

  return lines.join("\n").trim();
}

export async function buildDigestFromEmails(emails, personaKey = "general") {
  const data = await extractDigestJson(emails, personaKey);
  const markdown = digestJsonToMarkdown(data);
  return { markdown, data };
}
