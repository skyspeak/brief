// lib/summarize.js — map step: per-newsletter extraction at ingest time.
import { callLLM } from "@/lib/llm";
import { buildMapPrompt } from "@/lib/prompts";

export async function summarizeEmail({ subject, sender, body }) {
  const header = `Subject: ${subject}\nFrom: ${sender}\n\n`;
  const text = header + (body || "").slice(0, 8000);
  const { system, user } = buildMapPrompt(text);

  const summary = await callLLM({ system, user, maxTokens: 800 });
  const trimmed = summary.trim();

  // Skip purely empty/promotional extractions.
  if (!trimmed || /^none\.?$/i.test(trimmed)) {
    return { summary: "", tags: "" };
  }

  return { summary: trimmed, tags: "" };
}
