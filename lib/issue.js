// lib/issue.js — build one persona-tailored issue. Runs over summaries when present.
import { callLLM, parseJson } from "@/lib/llm";

const ISSUE_SCHEMA = `{
  "issue_title": string,                 // punchy 2-4 word cover line
  "dateline": string,                    // e.g. "Week of June 23, 2026"
  "lede": string,                        // 1-2 sentence editor's note, <40 words
  "tldr": string[],                      // 4-6 bullets, the week's biggest signals
  "features": [                          // 2-4 themed sections
    { "theme": string,
      "items": [ { "headline": string, "summary": string, "source": string } ] } // 1-3 items, summary <45 words
  ],
  "pull_quote": string,                  // one striking line, <25 words
  "action_plan": [                       // 3-8 rows worth actually doing
    { "action": string, "why": string, "effort": "S"|"M"|"L", "source": string } ],
  "worth_a_click": [ { "title": string, "source": string } ]   // <=5
}`;

export async function buildIssue(emails, lens = "") {
  const corpus = emails
    .map((e, i) => {
      const when = new Date(e.received_at * 1000).toISOString().slice(0, 10);
      // Prefer the compact summary (cheap); fall back to raw body if not summarized yet.
      const text = e.summary && e.summary.length ? e.summary : (e.body_text || "").slice(0, 4000);
      return `### [${i + 1}] ${e.subject || "(no subject)"} — ${e.sender} • ${when}\n${text}`;
    })
    .join("\n\n---\n\n");

  const system =
`You are the editor of a sharp personal-intelligence magazine.
${lens ? `READER LENS — tailor everything to this reader:\n${lens}\n` : ""}
Distill the week's newsletters into one tight issue for that reader. Be ruthless: cut ads,
housekeeping, and filler; surface only what matters TO THEM. The issue MUST fit 3 printed
pages, so respect every count and length limit. Output ONLY valid JSON (no prose, no fences)
matching this schema:
${ISSUE_SCHEMA}
Never invent facts not in the sources. If the week is thin for this reader, say so in the lede.`;

  const txt = await callLLM({
    system,
    user: `Here are this week's newsletters (${emails.length} items). Produce the issue JSON.\n\n${corpus}`,
    json: true,
    maxTokens: 2400,
  });
  return parseJson(txt);
}
