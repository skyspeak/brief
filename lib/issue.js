// lib/issue.js — reduce step: 3-day digest from newsletter extracts.
import { callLLM } from "@/lib/llm";
import { buildDigestPrompt } from "@/lib/prompts";

function fmtDate(unixSec) {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

function buildExtracts(emails) {
  return emails
    .map((e, i) => {
      const when = fmtDate(e.received_at);
      const pub = e.subject || "(no subject)";
      const text =
        e.summary && e.summary.length ? e.summary : (e.body_text || "").slice(0, 4000);
      return `### [${i + 1}] ${pub} — ${e.sender} • ${when}\n${text}`;
    })
    .join("\n\n---\n\n");
}

/** @returns {Promise<string>} markdown digest */
export async function buildDigest(emails, personaKey = "general", windowDays = 3) {
  const end = Math.floor(Date.now() / 1000);
  const start = end - windowDays * 86400;
  const runDate = fmtDate(end);

  const { system, user } = buildDigestPrompt({
    personaKey,
    runDate,
    startDate: fmtDate(start),
    endDate: runDate,
    n: emails.length,
    extracts: buildExtracts(emails),
  });

  return callLLM({ system, user, maxTokens: 2400 });
}

/** @deprecated use buildDigest — kept for any legacy imports */
export async function buildIssue(emails, _lens = "") {
  const markdown = await buildDigest(emails, "general");
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  return {
    issue_title: titleMatch ? titleMatch[1].replace(/ Digest.*/, "").trim() : "This Cycle",
    dateline: "",
    lede: markdown.split("\n").slice(0, 5).join(" ").slice(0, 200),
    tldr: [],
    features: [],
    pull_quote: "",
    action_plan: [],
    worth_a_click: [],
    _markdown: markdown,
  };
}
