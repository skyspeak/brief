// lib/prompts.js — digest prompt library (map-reduce for Llama-class models).

export const EXAMPLE_DIGEST = `# 2026-03-12 Digest — Business, Tech & AI

## 🔭 Top 3 Themes This Cycle
- **Enterprise AI budget consolidation**
  Three newsletters (The Information, Platformer, Exec Sum) reported large
  enterprises cutting AI vendor count from 8–10 pilots to 2–3 production
  contracts, with CIO surveys showing 60% planning consolidation by Q3.
  Why it matters: Winner-take-most dynamics are arriving faster than expected
  in enterprise AI.

- **Inference costs fall another step**
  Two providers cut per-token pricing 40% following new accelerator
  availability (Stratechery, SemiAnalysis). One newsletter noted margin
  pressure spreading to mid-tier inference startups.
  Why it matters: Cost curves keep compressing app-layer moats built on
  pricing arbitrage.

- **EU AI Act enforcement begins**
  First enforcement actions under the AI Act's high-risk provisions were
  reported against two HR-tech vendors (Politico Tech, Import AI).
  Why it matters: Compliance is now a live cost line, not a future risk.

## 📰 3 Notable Stories
- **Acme Cloud acquires vector database startup**
  Acme paid a reported $850M for VectorCo, its third infra acquisition this
  year; the deal closes Q2 pending review. Source: The Information, Exec Sum.

- **OpenBank launches agentic payments pilot**
  A 10,000-customer pilot lets AI agents initiate ACH transfers under $500
  with delegated authority. Source: Fintech Brainfood.

- **Major retailer replaces search with conversational AI**
  BigRetail reported an 11% lift in conversion after replacing keyword search
  site-wide. Source: Lenny's Newsletter.

## 📈 3 Emerging Themes to Watch
- **Agent-to-agent commerce protocols**: two newsletters flagged early spec
  work on inter-agent payment standards. Confirmation: a major payments
  network publishing a public spec.

- **On-device model deployment in regulated industries**: one healthcare
  newsletter reported hospitals piloting local models for PHI workloads.
  Confirmation: a top-5 EHR vendor announcing on-device support.

- **AI-native pricing rebellion**: scattered reports of buyers rejecting
  seat-based pricing for outcome-based contracts. Confirmation: a public
  company disclosing outcome-based revenue in earnings.

## ✅ 3 Follow-Ups
- Watch for Acme/VectorCo regulatory review outcome by June because it
  signals antitrust posture on AI infra roll-ups.
- Watch for NVIDIA earnings (May 28) because inference-cost commentary will
  confirm or kill the margin-compression theme.
- Watch for the EU AI Act second enforcement wave (expected April) because
  scope expansion to GPAI would hit model providers directly.`;

export const MAP_SYSTEM = `You are a precise research assistant. You extract facts only. You never invent
information not present in the source text.`;

export const MAP_USER = `Extract from the newsletter below:
1. PUBLICATION: name and date
2. TOP_STORIES: up to 5 items, each as one sentence with company/product names,
   numbers, and dates preserved exactly as written
3. SIGNALS: up to 3 emerging trends, funding events, launches, or executive moves

Output as plain markdown under those three headings. No commentary, no analysis.
If a section has no content, write "None".

NEWSLETTER:
{{newsletter_text}}`;

export const PERSONA_PROMPTS = {
  marketing: {
    role: "CMO / VP Marketing",
    coreQuestion: "What changes how we reach, convert, and retain customers?",
    filter: `PERSONA FILTER — Reader: CMO / VP Marketing
Core question: "What changes how we reach, convert, and retain customers?"
PRIORITIZE: AI in content/creative/SEO-AEO, martech & adtech platform changes,
privacy and ad regulation, notable campaigns and brand moves, consumer
behavior data, CAC/channel economics.
DEPRIORITIZE: infrastructure news, funding rounds without a go-to-market angle.
FOLLOW-UPS must be actions a marketing leader can take: a channel to test,
a platform change to prepare for, a competitor campaign to analyze.`,
  },
  sales: {
    role: "CRO / VP Sales",
    coreQuestion: "What changes what our buyers will spend money on this quarter?",
    filter: `PERSONA FILTER — Reader: CRO / VP Sales
Core question: "What changes what our buyers will spend money on this quarter?"
PRIORITIZE: enterprise budget/spend signals, competitor pricing and packaging
moves, AI sales tooling (SDR agents, forecasting, enablement), exec changes at
large buyers, macro indicators tied to B2B spend, procurement/security trends.
DEPRIORITIZE: research papers, deep technical infrastructure.
FOLLOW-UPS must be pipeline-relevant: earnings calls of key accounts, pricing
announcements, buying-committee trends to raise in deal reviews.`,
  },
  engineering: {
    role: "VP Engineering / CTO",
    coreQuestion: "What changes what we build, how we build it, or what it costs?",
    filter: `PERSONA FILTER — Reader: VP Engineering / CTO
Core question: "What changes what we build, how we build it, or what it costs?"
PRIORITIZE: model releases with benchmarks, API/platform changes and
deprecations, infra and dev-tooling shifts, security incidents and CVEs,
open-source releases, inference/training cost-performance changes.
DEPRIORITIZE: marketing campaigns, consumer retail trends.
Preserve version numbers, benchmark figures, and pricing exactly.
FOLLOW-UPS must be technical: releases to evaluate, migrations to plan,
security patches to verify.`,
  },
  product: {
    role: "CPO / VP Product",
    coreQuestion: "What changes our roadmap, positioning, or pricing?",
    filter: `PERSONA FILTER — Reader: CPO / VP Product
Core question: "What changes our roadmap, positioning, or pricing?"
PRIORITIZE: competitor launches and feature moves, pricing/packaging changes,
AI-native UX patterns, platform shifts that create or kill product surface
area, PLG and adoption signals, notable product teardowns.
DEPRIORITIZE: pure infrastructure, sales-tooling news.
FOLLOW-UPS must be roadmap-relevant: competitor betas to trial, platform
capabilities to prototype against, pricing moves to counter.`,
  },
  general: {
    role: "General Manager / P&L owner",
    coreQuestion: "What changes my market, my margins, or my competitive position?",
    filter: `PERSONA FILTER — Reader: General Manager / P&L owner
Core question: "What changes my market, my margins, or my competitive position?"
PRIORITIZE: M&A and market entries/exits, regulation, macro and cost dynamics
(labor, cloud, capital), competitor strategy shifts, workforce and org trends,
AI's effect on unit economics.
DEPRIORITIZE: tool-level or feature-level details.
Frame every item in P&L terms: revenue, cost, or risk.
FOLLOW-UPS must be decisions or events: regulatory deadlines, competitor
earnings, announced restructurings.`,
  },
};

const NEUTRAL_SYSTEM_DIGEST = `You are the editor of an executive intelligence digest covering business,
technology, and AI. Your readers are senior operators with 5 minutes to read.
You are ruthless about signal vs. noise. You never fabricate stories, numbers,
or sources. Every item must be traceable to the source material provided.`;

const BASE_RULES = `RULES:
- Exactly 3 items per section. Never fewer, never more.
- No item may appear in two sections.
- Total length under 700 words.
- If sources conflict, say so explicitly.
- If the window was quiet, say "light news cycle" rather than inflating
  minor items.
- Match the structure of the EXAMPLE DIGEST exactly. It is from a different
  news cycle — copy its FORMAT, never its content.`;

export function buildMapPrompt(newsletterText) {
  return {
    system: MAP_SYSTEM,
    user: MAP_USER.replace("{{newsletter_text}}", newsletterText),
  };
}

export function buildDigestPrompt({ personaKey, runDate, startDate, endDate, n, extracts }) {
  const neutral = personaKey === "neutral";
  const persona = neutral ? null : PERSONA_PROMPTS[personaKey] || PERSONA_PROMPTS.general;

  const system = neutral
    ? `${NEUTRAL_SYSTEM_DIGEST}\nToday's date: ${runDate}. Coverage window: ${startDate} to ${endDate}.`
    : `You are the editor of an executive intelligence digest read by ${persona.role}.
Your reader cares about one question: "${persona.coreQuestion}"
Filter all source material through that lens. A story only qualifies if a
${persona.role} would change a decision, budget, or priority because of it.
You never fabricate stories, numbers, or sources.
Today's date: ${runDate}. Coverage window: ${startDate} to ${endDate}.`;

  const user = `Below are extracts from ${n} newsletters published in the last 3 days.
Produce a digest with EXACTLY this structure and nothing else:

# ${runDate} Digest — Business, Tech & AI

## 🔭 Top 3 Themes This Cycle
For each theme (exactly 3):
- **Theme name** (5 words max)
- What happened (2–3 sentences, cite which newsletters covered it)
- Why it matters (1 sentence)
Rank by: (a) how many independent newsletters covered it, (b) magnitude of
business impact. Cross-source corroboration beats single-source hype.

## 📰 3 Notable Stories
Exactly 3 discrete news items NOT already covered in the themes above.
For each:
- **Headline** (your own words, 10 words max)
- Summary (2 sentences, preserve specific numbers/names/dates)
- Source newsletter(s)

## 📈 3 Emerging Themes to Watch
Exactly 3 early signals — mentioned in only 1–2 newsletters, not yet mainstream.
For each: name it, give the evidence (1 sentence), state what would confirm
it as a real trend (1 sentence).

## ✅ 3 Follow-Ups
Exactly 3 concrete items to track before the next digest. Each must be
checkable: an announced date, a pending decision, an earnings call, a launch,
a regulatory deadline. Format: "Watch for X by Y because Z."

${neutral ? "Present all topics neutrally — no role-specific filtering. Cover the most consequential developments across all subjects.\n" : `${persona.filter}\n`}

${BASE_RULES}

EXAMPLE DIGEST (format reference only):
${EXAMPLE_DIGEST}

SOURCE MATERIAL:
${extracts}`;

  return { system, user };
}

/** Console Q&A — persona lens + digest rules over map-step extracts. */
export function buildAskPrompt({ personaKey = "general", question, runDate, n, extracts }) {
  const neutral = personaKey === "neutral";

  const system = neutral
    ? `${NEUTRAL_SYSTEM_DIGEST}\nToday's date: ${runDate}.`
    : (() => {
        const persona = PERSONA_PROMPTS[personaKey] || PERSONA_PROMPTS.general;
        return `You are the editor of an executive intelligence digest read by ${persona.role}.
Your reader cares about one question: "${persona.coreQuestion}"
Filter all source material through that lens. A story only qualifies if a
${persona.role} would change a decision, budget, or priority because of it.
You are ruthless about signal vs. noise. You never fabricate stories, numbers,
or sources. Every item must be traceable to the source material provided.
Today's date: ${runDate}.`;
      })();

  const personaBlock = neutral
    ? `VIEW: Neutral — no persona filter. Present facts and themes objectively without prioritizing any single role or function.\n`
    : `${(PERSONA_PROMPTS[personaKey] || PERSONA_PROMPTS.general).filter}\n`;

  const user = `Below are extracts from ${n} newsletters in the corpus.

${personaBlock}

RULES:
- Answer the USER QUESTION using ONLY the source material below.
- Cite sources inline as [n] referring to the numbered newsletters.
- If sources conflict, say so explicitly.
- If the corpus doesn't cover the question, say "light coverage on this topic"
  rather than guessing or inflating minor items.
- Be specific, concise, and structured. Preserve numbers, names, and dates exactly.
- Total length under 700 words.

When the question asks for a briefing, overview, or what's relevant, structure
your answer using markdown sections inspired by this format:
## 🔭 Key Themes · ## 📰 Notable Stories · ## 📈 Emerging Signals · ## ✅ Follow-Ups
Use exactly 3 items per section when enough evidence exists; otherwise say the
cycle was quiet for that angle.

EXAMPLE DIGEST (format reference only — copy FORMAT, never its content):
${EXAMPLE_DIGEST}

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
