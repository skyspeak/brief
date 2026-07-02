// lib/summarize.js — distill one newsletter to a compact record at ingest time.
import { callLLM, parseJson } from "@/lib/llm";

export async function summarizeEmail({ subject, sender, body }) {
  const system = `Distill ONE newsletter email into a compact JSON record. Output ONLY JSON:
{"summary": string,   // <=80 words: just the substantive signal. Skip ads, sponsorships, housekeeping.
 "tags": string[]}    // 2-6 lowercase topic tags, e.g. ["ai","payments","regulation"]
If the email is purely promotional with no real signal, return summary="" and tags=[].`;

  const user = `Subject: ${subject}\nFrom: ${sender}\n\n${(body || "").slice(0, 8000)}`;
  const txt = await callLLM({ system, user, json: true, maxTokens: 400 });
  const d = parseJson(txt);
  return {
    summary: d.summary || "",
    tags: Array.isArray(d.tags) ? d.tags.join(",") : "",
  };
}
