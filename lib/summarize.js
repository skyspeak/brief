// lib/summarize.js — optional single-newsletter JSON preview (Inbox "Read").
import { callLLM, parseJson } from "@/lib/llm";
import { buildMapPrompt } from "@/lib/prompts";
import { prepareNewsletterText } from "@/lib/newsletter-text";
import { digestJsonToMarkdown } from "@/lib/digest-extract";

function stripJsonFences(text = "") {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

export async function summarizeEmail({ subject, sender, body, body_html, receivedAt } = {}) {
  const text = prepareNewsletterText(body, { body_text: body, body_html, subject, sender, receivedAt });
  const { system, user } = buildMapPrompt(text);

  const raw = await callLLM({ system, user, maxTokens: 1200, json: true, maxAttempts: 2 });
  let data;
  try {
    data = parseJson(stripJsonFences(raw));
  } catch {
    return { summary: "", tags: "" };
  }

  data.digest_date = new Date().toISOString().slice(0, 10);
  data.newsletters_processed = [subject || sender || "Newsletter"];
  const markdown = digestJsonToMarkdown(data);
  const trimmed = markdown.trim();

  if (!trimmed || /^none\.?$/i.test(trimmed)) {
    return { summary: "", tags: "" };
  }

  return { summary: trimmed, tags: "extract" };
}
