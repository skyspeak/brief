// lib/bartma-prompts.js — Megh profile, tracks, research + editorial prompts.

export const BARTMA_READER = `Megh Gautam — San Francisco Bay Area. ~18.5 years of experience. LinkedIn: linkedin.com/in/meghbartma

- Now: Product Leadership (Apps) @ Box, since Jan 2025 — building the agentic enterprise.
- Before: Chief Product Officer @ Crunchbase (2023–25) — ran Product, Design AND Marketing, and was GM of the self-serve business (real cross-functional P&L scope). Launched Crunchbase 2.0 with GenAI. Head of Product @ Twilio (Enterprise & Verticals). Director of PM @ Dropbox. Director/Lead PM @ Hearsay Systems (fintech CRM for financial advisors). PM @ Finxera, Pivotal. SWE then consultant @ Microsoft.
- Also: Active angel investor and advisor since 2021. Speaker and author. Reviewer on early drafts of Hooked.
- Education: Stanford MS, Management Science & Engineering (Lean Launchpad with Steve Blank, d.school). BTech, NIT Durgapur.
- Superpowers: enterprise/B2B SaaS, AI and GenAI product, 0→$100M+ revenue, 0→100+ person teams, PLG and self-serve monetization, pricing and packaging, data products, content and collaboration infrastructure, fintech infrastructure.`;

export const BARTMA_TRACKS = `Four tracks, all live simultaneously:
1. Product leadership — CPO, CPTO, SVP/VP Product, or GM with P&L, at Series B–D or public enterprise SaaS, AI infrastructure, AI applications, dev tools, data platforms, fintech infrastructure.
2. COO / general management — COO, President & COO, GM of a business unit, Chief Business Officer at scale-ups roughly 100–1,500 people.
3. Founder paths — EIR and Executive-in-Residence seats at tier-1 funds, venture studios, founder-in-residence roles, credible co-founder searches, structured "start a company with us" offers with capital attached.
4. Venture — Operating Partner, Venture Partner, Head of Platform, Head of Portfolio Talent, scout programs, plus product leadership at venture-data companies where his Crunchbase tenure is a superpower (Harmonic, PitchBook, CB Insights, Affinity, Carta, AngelList).

Geography: Bay Area or remote-US. No non-US relocation.
Exclude: anything below VP, crypto/web3, consumer social and gaming, pure finance/CFO seats, junior chief-of-staff roles, companies under ~$10M revenue unless it's a founding-level seat with strong funding.`;

export function researchSystemPrompt() {
  return `You are a senior executive search researcher for The Bartma Brief.
Use Google Search to find CURRENT, REAL job postings and opportunity signals from roughly the last two weeks.
Prefer primary sources: greenhouse.io, job-boards.greenhouse.io, jobs.ashbyhq.com, lever.co, wellfound.com, company careers pages, fund career pages, credible LinkedIn/public posts.
Never invent apply URLs. Only include roles you can cite with a real URL you retrieved.
Score fit 1–10 against Megh's specific background (cite Crunchbase GM scope, Box agentic apps, Twilio enterprise, Dropbox, Stanford, angel investing — not generic "strong product leadership").
Return ONLY valid JSON (no markdown fences) with this shape:
{
  "market_read": "2-4 sentences on what the sweeps revealed this week",
  "opportunities": [
    {
      "company": "",
      "role": "",
      "track": "product|coo|founder|venture",
      "url": "https://...",
      "score": 8,
      "rationale": "Megh-specific fit",
      "warm_path": "named intro angle or null",
      "caveat": "honest caveat inside the entry"
    }
  ],
  "watchlist": [
    {
      "company": "",
      "trigger": "concrete reason to reach out before a req exists",
      "track": "product|coo|founder|venture",
      "url": "https://... optional source"
    }
  ]
}
Aim for 6–10 opportunities when the market supports it. If thin, say so in market_read and return fewer. Prefer quality over padding.`;
}

export function researchUserPrompt({ alreadySent, weekOf }) {
  const sentBlock =
    alreadySent.length === 0
      ? "(none yet — first run or empty tracker)"
      : alreadySent
          .slice(0, 80)
          .map((o) => `- [${o.status}] ${o.company} — ${o.role} (${o.url || "no url"})`)
          .join("\n");

  return `Week of: ${weekOf}

Reader:
${BARTMA_READER}

${BARTMA_TRACKS}

Already in the tracker (do NOT resend unless status materially changed — role reopened, comp disclosed, company raised, req filled):
${sentBlock}

Search all four tracks. Bias to fresh postings. Return JSON only.`;
}

export function writeSystemPrompt() {
  return `You are the editor of The Bartma Brief — a private weekly executive opportunity digest for one reader: Megh Gautam.
Write looking forward into the week ahead. Be direct and opinionated. Rank things. Name caveats inside each entry. Do not flatter.
Close with "Do this week" — 3–5 concrete moves ordered by return.
Output ONLY valid JSON (no markdown fences):
{
  "headline": "short subject headline drawn from this week's actual finding",
  "market_read": "lead editorial paragraph(s)",
  "do_this_week": ["move 1", "move 2", "move 3"],
  "html": "full HTML email body (see design rules)"
}

Design rules for html (email-safe, inline CSS only):
- White canvas, institutional serif masthead "The Bartma Brief"
- Volume/number/date band in monospace
- Ink-blue accent (#1a365d)
- Scores large in a left margin/column
- Restrained paper-of-record broadsheet — not a marketing newsletter
- Include verified apply URLs as real <a href> links
- Sections: masthead, market read, ranked opportunities, watchlist (if any), Do this week`;
}

export function writeUserPrompt({ issueNumber, weekOf, marketRead, opportunities, watchlist }) {
  return `Issue: Vol. 1, No. ${issueNumber}
Week of: ${weekOf}

Draft market_read from research (revise if needed):
${marketRead || "(none)"}

Verified opportunities to include (already URL-checked; do not invent new ones):
${JSON.stringify(opportunities, null, 2)}

Watchlist:
${JSON.stringify(watchlist || [], null, 2)}

Reader context:
${BARTMA_READER}

Produce the JSON with headline, market_read, do_this_week, and full html.`;
}
