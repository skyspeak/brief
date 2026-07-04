// lib/summarize.js — map step: per-newsletter extraction at ingest time.
import { callLLM } from "@/lib/llm";
import { buildMapPrompt } from "@/lib/prompts";
import { cleanNewsletterContent, prepareNewsletterText } from "@/lib/newsletter-text";

export async function summarizeEmail({ subject, sender, body, body_html, receivedAt } = {}) {
  const cleaned = cleanNewsletterContent(body, { body_text: body, body_html, subject, sender });
  const text = prepareNewsletterText(cleaned, { subject, sender, receivedAt });
  const { system, user } = buildMapPrompt(text);

  const summary = await callLLM({ system, user, maxTokens: 800, maxAttempts: 2 });
  const trimmed = summary.trim();

  // Skip purely empty/promotional extractions.
  if (!trimmed || /^none\.?$/i.test(trimmed)) {
    return { summary: "", tags: "" };
  }

  return { summary: trimmed, tags: "" };
}
