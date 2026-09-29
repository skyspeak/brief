// lib/issue.js — reduce step: JSON digest from newsletter bodies (newsletter-digest-prompt.md).
import {
  extractDigestBatch,
  finalizeDigestMarkdown,
  getDigestBatchCount,
} from "@/lib/digest-extract";

/** @returns {Promise<string>} digest markdown, optionally framed for a persona */
export async function buildDigest(emails, personaKey = "neutral", windowDays) {
  const parts = [];
  const batchCount = getDigestBatchCount(emails);
  for (let i = 0; i < batchCount; i++) {
    const { data } = await extractDigestBatch(emails, i, { personaKey });
    parts.push(data);
  }
  return finalizeDigestMarkdown(parts, { emails, windowDays, personaKey });
}

/** @deprecated use buildDigest */
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
