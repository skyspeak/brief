// lib/prompts.js — from newsletter-digest-prompt.md (+ persona audience hooks).

export const DIGEST_JSON_SYSTEM = `You are a precise newsletter analyst. You read email newsletters and extract only what is explicitly stated in them. You never invent facts, numbers, or URLs. You output ONLY valid JSON — no markdown, no code fences, no commentary before or after the JSON.`;

export const DIGEST_JSON_USER = `TASK
Read the newsletters below and extract exactly three categories of content. Then output a single JSON object.

CATEGORY DEFINITIONS (do not confuse these):
1. TALKING POINTS — developments, debates, or open questions worth discussing with a colleague. Framed as "here's something worth thinking about." Must be interesting or contested, not routine news.
2. STATS — specific numbers stated in the newsletters: percentages, dollar amounts, growth rates, counts, dates-with-magnitude. Copy the number VERBATIM. Never estimate or round differently than the source.
3. INSIGHTS — non-obvious takeaways, patterns, or second-order implications an expert would draw. An insight explains "so what" — it is analysis, not a fact restatement. It must be grounded in newsletter content.

EXTRACTION RULES
- Extract exactly 5 items per category. If the newsletters genuinely contain fewer than 5 qualifying items, return fewer — NEVER pad, repeat, or invent.
- No item may appear in more than one category. No two items may cover the same story.
- Rank items by importance/interestingness; most important first.
- Each item: 1-2 sentences, max 40 words per field.

LINK RULES (critical)
- For each item, provide the ORIGINAL source URL: the underlying article, report, filing, or announcement that the newsletter links to when discussing that item.
- Do NOT use: the newsletter's "view in browser" link, homepage, unsubscribe links, sponsor/ad links, or social share links.
- Strip tracking parameters (utm_*, ref, fbclid, mc_cid, etc.) from URLs. Keep only the clean canonical URL.
- Only use URLs that literally appear in the newsletter text. NEVER construct, guess, or shorten a URL.
- If no original source link exists for an item, set "source_url" to null and "source_note" to the newsletter name.

OUTPUT FORMAT
Output ONLY this JSON object. No text before or after it. No markdown code fences.

{
  "digest_date": "<today's date, YYYY-MM-DD>",
  "newsletters_processed": ["<newsletter name>", "..."],
  "talking_points": [
    {
      "point": "<the discussion-worthy development or question>",
      "why_it_matters": "<one sentence>",
      "source_title": "<article/report title or publication>",
      "source_url": "<clean canonical URL or null>",
      "source_note": "<newsletter name if url is null, else empty string>"
    }
  ],
  "stats": [
    {
      "stat": "<the verbatim number with its subject, e.g. 'OpenAI revenue reached $X in 2025'>",
      "context": "<one sentence of context from the newsletter>",
      "source_title": "<article/report title or publication>",
      "source_url": "<clean canonical URL or null>",
      "source_note": ""
    }
  ],
  "insights": [
    {
      "insight": "<the non-obvious takeaway>",
      "implication": "<what this means going forward, one sentence>",
      "source_title": "<article/report title or publication>",
      "source_url": "<clean canonical URL or null>",
      "source_note": ""
    }
  ]
}

VALIDATION CHECKLIST (perform silently before answering)
- JSON parses? All strings escaped properly?
- Every stat number matches the newsletter verbatim?
- Every URL appeared literally in the input and has tracking params removed?
- No duplicates across categories?
- No fabricated content?

NEWSLETTERS:
{{NEWSLETTER_CONTENT}}`;

// Persona audience hooks (optional prepend to user prompt).
export const PERSONA_PROMPTS = {
  marketing: {
    role: "CMO / VP Marketing",
    coreQuestion: "What changes how we reach, convert, and retain customers?",
    audience:
      "AUDIENCE: A senior marketing executive (CMO / VP Marketing). Prioritize AI in content/creative/SEO-AEO, martech & adtech, privacy/ad regulation, campaigns, consumer behavior, and CAC/channel economics. Deprioritize pure infrastructure news.",
  },
  sales: {
    role: "CRO / VP Sales",
    coreQuestion: "What changes what our buyers will spend money on this quarter?",
    audience:
      "AUDIENCE: A senior sales executive (CRO / VP Sales). Prioritize buyer budget signals, competitor pricing/packaging, AI sales tooling, exec changes at large buyers, macro B2B spend indicators, and procurement trends. Deprioritize deep technical infrastructure.",
  },
  engineering: {
    role: "VP Engineering / CTO",
    coreQuestion: "What changes what we build, how we build it, or what it costs?",
    audience:
      "AUDIENCE: A senior engineering leader (VP Engineering / CTO). Prioritize model releases, API/platform changes, infra/dev-tooling, security/CVEs, open-source, and inference cost-performance. Preserve version numbers and benchmarks exactly.",
  },
  product: {
    role: "CPO / VP Product",
    coreQuestion: "What changes our roadmap, positioning, or pricing?",
    audience:
      "AUDIENCE: A senior product executive (CPO / VP Product). Prioritize competitor launches, pricing/packaging changes, AI-native UX patterns, platform shifts, PLG signals, and product teardowns.",
  },
  general: {
    role: "General Manager / P&L owner",
    coreQuestion: "What changes my market, my margins, or my competitive position?",
    audience:
      "AUDIENCE: A general manager / P&L owner. Prioritize M&A, regulation, macro and cost dynamics, competitor strategy, workforce trends, and AI's effect on unit economics. Frame items in revenue, cost, or risk terms.",
  },
};

export function personaAudienceLine(personaKey) {
  if (!personaKey || personaKey === "neutral") return "";
  const p = PERSONA_PROMPTS[personaKey] || PERSONA_PROMPTS.general;
  return `${p.audience}\n\n`;
}

/** Main digest extraction prompt (newsletter-digest-prompt.md). */
export function buildDigestExtractPrompt({ content, personaKey = "general", runDate }) {
  const audience = personaAudienceLine(personaKey);
  const user = `${audience}${DIGEST_JSON_USER.replace("{{NEWSLETTER_CONTENT}}", content).replace(
    "<today's date, YYYY-MM-DD>",
    runDate || new Date().toISOString().slice(0, 10)
  )}`;

  return { system: DIGEST_JSON_SYSTEM, user };
}

/** Legacy map step — kept for optional single-email preview in Inbox. */
export const MAP_SYSTEM = DIGEST_JSON_SYSTEM;

export const MAP_USER = `Extract a preview from this single newsletter using the same categories as a full digest (talking points, stats, insights). Output ONLY valid JSON with keys "talking_points", "stats", "insights" (arrays, up to 3 items each). No code fences.

NEWSLETTER:
{{newsletter_text}}`;

export function buildMapPrompt(newsletterText) {
  return {
    system: MAP_SYSTEM,
    user: MAP_USER.replace("{{newsletter_text}}", newsletterText),
  };
}

/** @deprecated — use buildDigestExtractPrompt */
export function buildDigestPrompt(opts) {
  return buildDigestExtractPrompt({
    content: opts.extracts,
    personaKey: opts.personaKey,
    runDate: opts.runDate,
  });
}

/** Q&A over newsletter corpus using digest extraction lens. */
export function buildAskPrompt({ personaKey = "general", question, runDate, n, extracts }) {
  const audience = personaAudienceLine(personaKey);
  const system = DIGEST_JSON_SYSTEM;

  const user = `${audience}Below are ${n} newsletters in the corpus.

Answer the USER QUESTION using ONLY the source material below.
- Cite sources inline as [n] referring to the numbered newsletters.
- If sources conflict, say so explicitly.
- If the corpus doesn't cover the question, say "light coverage on this topic" rather than guessing.
- Be specific and preserve numbers, names, and dates exactly.
- When useful, structure the answer with Talking Points, Stats, and Insights.

SOURCE MATERIAL:
${extracts}

USER QUESTION:
${question}`;

  return { system, user };
}

export const PERSONA_OPTIONS = [
  { id: "neutral", label: "Neutral (no persona)" },
  ...Object.entries(PERSONA_PROMPTS).map(([id, p]) => ({ id, label: p.role })),
];
