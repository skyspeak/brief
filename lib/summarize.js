// lib/summarize.js — map step: per-newsletter extraction at ingest time.
import { callLLM } from "@/lib/llm";
import { buildMapPrompt } from "@/lib/prompts";
import { prepareNewsletterText } from "@/lib/newsletter-text";

export async function summarizeEmail({ subject, sender, body, receivedAt } = {}) {
  const text = prepareNewsletterText(body, { subject, sender, receivedAt });
  const { system, user } = buildMapPrompt(text);

  const summary = await callLLM({ system, user, maxTokens: 800, maxAttempts: 2 });
  const trimmed = summary.trim();

  // Skip purely empty/promotional extractions.
  if (!trimmed || /^none\.?$/i.test(trimmed)) {
    return { summary: "", tags: "" };
  }

  return { summary: trimmed, tags: "" };
}
