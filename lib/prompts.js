// lib/prompts.js — from newsletter-digest-prompt.md (+ unified persona insights).

export const DIGEST_JSON_SYSTEM = `You are an executive newsletter editor. You read tech/business newsletters and distill only substantive, specific insights — with exact numbers, named entities, product names, and dates copied from the source. You skip promotional mail, shopping deals, security alerts, and duplicate rehashes. You never invent facts or URLs. Output ONLY valid JSON — no markdown fences, no commentary.`;

export const PERSONA_PROMPTS = {
  marketing: {
    role: "CMO / VP Marketing",
    coreQuestion: "What changes how we reach, convert, and retain customers?",
    lens: "Prioritize AI in content/creative/SEO-AEO, martech & adtech, privacy/ad regulation, campaigns, consumer behavior, and CAC/channel economics.",
  },
  sales: {
    role: "CRO / VP Sales",
    coreQuestion: "What changes what our buyers will spend money on this quarter?",
    lens: "Prioritize buyer budget signals, competitor pricing/packaging, AI sales tooling, exec changes at large buyers, macro B2B spend indicators, and procurement trends.",
  },
  engineering: {
    role: "VP Engineering / CTO",
    coreQuestion: "What changes what we build, how we build it, or what it costs?",
    lens: "Prioritize model releases, API/platform changes, infra/dev-tooling, security/CVEs, open-source, and inference cost-performance. Preserve version numbers and benchmarks exactly.",
  },
  product: {
    role: "CPO / VP Product",
    coreQuestion: "What changes our roadmap, positioning, or pricing?",
    lens: "Prioritize competitor launches, pricing/packaging changes, AI-native UX patterns, platform shifts, PLG signals, and product teardowns.",
  },
  general: {
    role: "General Manager / P&L owner",
    coreQuestion: "What changes my market, my margins, or my competitive position?",
    lens: "Prioritize M&A, regulation, macro and cost dynamics, competitor strategy, workforce trends, and AI's effect on unit economics. Frame in revenue, cost, or risk terms.",
  },
};

export const DIGEST_PERSONA_KEYS = ["general", "sales", "marketing", "engineering", "product"];

function personaInsightsInstructions() {
  return DIGEST_PERSONA_KEYS.map((key) => {
    const p = PERSONA_PROMPTS[key];
    return `- "${key}" (${p.role}): ${p.coreQuestion} ${p.lens}`;
  }).join("\n");
}

export const DIGEST_UNIFIED_USER = `TASK
Read the newsletters below. Filter out junk (retail promos, "security alert" account emails, sponsor fluff, empty hype). From the substantive remainder, extract the sharpest insights an executive would forward to a colleague.

QUALITY BAR (every insight must pass):
- Contains a SPECIFIC number, benchmark, date, product name, or named company — not vague trends.
- Format: one concrete claim, then " — " then a sharp implication (why it matters).
- Grounded in a named newsletter (use publication name from the header, e.g. "Import AI 464", "TLDR AI").
- Interesting or non-obvious — skip routine product updates unless the numbers are striking.
- Max 35 words for headline + implication combined.

RULES
- Return 3–5 insights per batch. Fewer is fine — NEVER pad or invent.
- No duplicate stories. Rank by importance; boldest first.
- Copy stats VERBATIM from the newsletter (don't round or rephrase numbers).
- source_url: only URLs that literally appear in the newsletter text; null if none. No tracking links, unsubscribe, or view-in-browser URLs.

LENS (optional tag per insight — pick the best fit):
general | sales | marketing | engineering | product

OUTPUT — ONLY this JSON object:

{
  "digest_date": "<YYYY-MM-DD>",
  "newsletters_processed": ["<publication or subject>", "..."],
  "insights": [
    {
      "headline": "<specific claim with numbers/names>",
      "implication": "<sharp so-what, no period>",
      "source": "<newsletter name>",
      "source_url": "<URL or null>",
      "lens": "engineering"
    }
  ]
}

NEWSLETTERS:
{{NEWSLETTER_CONTENT}}`;

export const DIGEST_JSON_USER = DIGEST_UNIFIED_USER;

export function personaAudienceLine(personaKey) {
  if (!personaKey || personaKey === "neutral") return "";
  const p = PERSONA_PROMPTS[personaKey] || PERSONA_PROMPTS.general;
  return `AUDIENCE: ${p.role}. ${p.lens}\n\n`;
}

/** Unified neutral digest + one insight per persona. */
export function buildDigestExtractPrompt({ content, runDate }) {
  const user = DIGEST_UNIFIED_USER.replace("{{NEWSLETTER_CONTENT}}", content).replace(
    "<YYYY-MM-DD>",
    runDate || new Date().toISOString().slice(0, 10)
  );
  return { system: DIGEST_JSON_SYSTEM, user };
}

/** Legacy map step — single newsletter preview in Inbox. */
export const MAP_SYSTEM = DIGEST_JSON_SYSTEM;

export const MAP_USER = `Extract 1–3 sharp insights from this single newsletter. Skip ads and boilerplate.

Each insight: specific claim with numbers/names if present, then " — " then implication.
Output ONLY valid JSON:

{
  "insights": [
    {
      "headline": "<specific claim>",
      "implication": "<so-what>",
      "source": "<publication or subject>",
      "source_url": null,
      "lens": "general"
    }
  ]
}

NEWSLETTER:
{{newsletter_text}}`;

export function buildMapPrompt(newsletterText) {
  return {
    system: MAP_SYSTEM,
    user: MAP_USER.replace("{{newsletter_text}}", newsletterText),
  };
}

/** @deprecated */
export function buildDigestPrompt(opts) {
  return buildDigestExtractPrompt({ content: opts.extracts, runDate: opts.runDate });
}

export function buildAskPrompt({ personaKey = "general", question, runDate, n, extracts }) {
  const audience = personaAudienceLine(personaKey);
  const system = DIGEST_JSON_SYSTEM;

  const user = `${audience}Below are ${n} newsletters in the corpus.

Answer the USER QUESTION using ONLY the source material below.
- Cite sources inline as [n] referring to the numbered newsletters.
- If sources conflict, say so explicitly.
- If the corpus doesn't cover the question, say "light coverage on this topic" rather than guessing.
- Be specific and preserve numbers, names, and dates exactly.

SOURCE MATERIAL:
${extracts}

USER QUESTION:
${question}`;

  return { system, user };
}

export const PERSONA_OPTIONS = [
  { id: "neutral", label: "Neutral (full digest with all roles)" },
  ...Object.entries(PERSONA_PROMPTS).map(([id, p]) => ({ id, label: p.role })),
];
