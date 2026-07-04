// lib/issue.js — reduce step: corpus digest from newsletter extracts.
import { callLLM } from "@/lib/llm";
import { buildDigestPrompt } from "@/lib/prompts";
import { prepareNewsletterText } from "@/lib/newsletter-text";

function fmtDate(unixSec) {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

function buildExtracts(emails) {
  return emails
    .map((e, i) => {
      const when = fmtDate(e.received_at);
      const pub = e.subject || "(no subject)";
      const text =
        e.summary && e.summary.length
          ? e.summary
          : prepareNewsletterText(e.body_text || "", {
              subject: e.subject,
              sender: e.sender,
              receivedAt: e.received_at,
            }).slice(0, 4000);
      return `### [${i + 1}] ${pub} — ${e.sender} • ${when}\n${text}`;
    })
    .join("\n\n---\n\n");
}

function windowDaysFor(emails) {
  if (!emails.length) return 3;
  const now = Math.floor(Date.now() / 1000);
  const oldest = emails[0].received_at;
  return Math.max(1, Math.ceil((now - oldest) / 86400));
}

/** @returns {Promise<string>} markdown digest (Top 3 Themes, Stories, Emerging, Follow-Ups) */
export async function buildDigest(emails, personaKey = "general", windowDays) {
  const days = windowDays || windowDaysFor(emails);
  const end = Math.floor(Date.now() / 1000);
  const start = emails[0]?.received_at || end - days * 86400;
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
