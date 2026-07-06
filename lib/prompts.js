// lib/prompts.js — from newsletter-digest-prompt.md (+ unified persona insights).

export const DIGEST_JSON_SYSTEM = `You are a precise newsletter analyst. You read email newsletters and extract only what is explicitly stated in them. You never invent facts, numbers, or URLs. You output ONLY valid JSON — no markdown, no code fences, no commentary before or after the JSON.`;

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
Read the newsletters below and produce ONE neutral digest as JSON. Talking points and stats are objective (no persona filter). Then add exactly one insight per executive role, each filtered through that role's lens.

CATEGORY DEFINITIONS:
1. TALKING POINTS — developments, debates, or open questions worth discussing. Interesting or contested, not routine news. Neutral — not filtered by role.
2. STATS — specific numbers from the newsletters (percentages, dollars, counts). Copy VERBATIM. Neutral — not filtered by role.
3. PERSONA INSIGHTS — exactly ONE item per role below. Each insight is the single most important takeaway FOR THAT ROLE from the same newsletter corpus. Must differ across roles when the material supports it.

PERSONA ROLES (one insight each, use these exact "persona" keys):
${personaInsightsInstructions()}

EXTRACTION RULES
- Up to 5 talking_points and up to 5 stats. If fewer qualify, return fewer — NEVER pad or invent.
- Exactly 5 persona_insights — one per persona key listed above.
- No item may appear in more than one category. No duplicate stories.
- Rank talking_points and stats by importance; most important first.
- Max 40 words per text field.
- If the JSON would be too long, shorten text fields — never stop mid-JSON.

LINK RULES (critical)
- Provide the ORIGINAL source URL from the newsletter when available.
- Do NOT use view-in-browser, unsubscribe, sponsor, or social share links.
- Only use URLs that literally appear in the newsletter text.
- If no URL, set "source_url" to null and "source_note" to the newsletter name.

OUTPUT FORMAT — output ONLY this JSON object, no markdown fences:

{
  "digest_date": "<YYYY-MM-DD>",
  "newsletters_processed": ["<newsletter name>", "..."],
  "talking_points": [
    {
      "point": "<discussion-worthy development>",
      "why_it_matters": "<one sentence>",
      "source_title": "<title or publication>",
      "source_url": "<URL or null>",
      "source_note": "<newsletter name if url is null, else empty string>"
    }
  ],
  "stats": [
    {
      "stat": "<verbatim number with subject>",
      "context": "<one sentence>",
      "source_title": "<title or publication>",
      "source_url": "<URL or null>",
      "source_note": ""
    }
  ],
  "persona_insights": [
    {
      "persona": "general",
      "role": "<role title>",
      "insight": "<most important takeaway for this role>",
      "implication": "<one sentence so-what>",
      "source_title": "<title or publication>",
      "source_url": "<URL or null>",
      "source_note": ""
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

export const MAP_USER = `Extract a preview from this single newsletter. Output ONLY valid JSON with keys "talking_points", "stats", "insights" (arrays, up to 3 items each). No code fences.

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
