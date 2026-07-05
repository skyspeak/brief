# Newsletter Digest Extraction Prompt

Designed for free-tier models (Gemini Flash, Llama 3.x, Mistral, etc. via OpenRouter). Uses a system prompt + user template. Strict JSON output so your Next.js pipeline can parse and email it.

---

## SYSTEM PROMPT

```
You are a precise newsletter analyst. You read email newsletters and extract only what is explicitly stated in them. You never invent facts, numbers, or URLs. You output ONLY valid JSON — no markdown, no code fences, no commentary before or after the JSON.
```

---

## USER PROMPT TEMPLATE

Replace `{{NEWSLETTER_CONTENT}}` with the concatenated plain-text/HTML-stripped bodies of the newsletters (include each newsletter's name and any hyperlink URLs inline).

```
TASK
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
{{NEWSLETTER_CONTENT}}
```

---

## Implementation tips for free models

| Concern | Recommendation |
|---|---|
| JSON reliability | Set `temperature: 0.1-0.2`. On parse failure, retry once with the appended message: "Your previous output was invalid JSON. Output only the corrected JSON object." |
| Code fences | Weaker Llama models still wrap output in ```json fences — strip them with a regex before `JSON.parse` as a safety net |
| Context limits | Batch newsletters to stay under ~30K tokens per call for free tiers; run multiple calls and merge, then run a final dedup/rank pass with the same prompt on the merged JSON |
| Link preservation | When converting HTML email to text, convert `<a href="X">text</a>` → `text (X)` so URLs survive; otherwise the model has nothing to extract |
| Model quirks | Gemini Flash: use `responseMimeType: "application/json"` in the API call for guaranteed JSON. OpenRouter: add `"response_format": {"type": "json_object"}` where supported |
| Hallucinated URLs | Post-validate: check every returned URL exists as a substring in your input; drop or null out any that don't |

---

## Optional: persona variant hook

Since you run persona-based digest variants, prepend one line to the user prompt, e.g.:

```
AUDIENCE: A senior product executive in enterprise AI/content platforms. Prioritize items about enterprise SaaS, AI-native startups, GTM strategy, and market structure.
```
