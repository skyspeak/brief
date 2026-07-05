// lib/issue.js — reduce step: JSON digest from newsletter bodies (newsletter-digest-prompt.md).
import { buildDigestFromEmails } from "@/lib/digest-extract";

/** @returns {Promise<string>} markdown digest (Talking Points, Stats, Insights) */
export async function buildDigest(emails, personaKey = "general", _windowDays) {
  const { markdown } = await buildDigestFromEmails(emails, personaKey);
  return markdown;
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
