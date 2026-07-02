# Newsletter Magazine

A serverless pipeline that ingests email newsletters, **summarizes each one at ingest**,
and weekly distills them into **one tailored magazine per persona** (PDF, ≤3 pages) emailed
to you. Plus an **ask console** to query your whole corpus on demand. Switchable model
provider (Claude / Gemini / OpenRouter). Deploys to Vercel; no local dev required.

```
Newsletters ─▶ Resend Inbound ─▶ /api/webhook ─▶ Turso
                                       │ store raw, then summarize + tag (1 cheap LLM call)
                                       ▼
        (Vercel Cron, weekly) ─▶ for each persona: summaries → tailored magazine → Resend
                                       │
        (anytime) /  ─▶ ask console ─▶ /api/ask ─▶ analyst answer over the corpus + citations
```

## File map

| Path | Role |
|---|---|
| `app/page.js` + `app/layout.js` | Ask console (homepage) |
| `app/api/webhook/route.js` | Inbound receiver: verify → store → summarize |
| `app/api/digest/route.js`  | Weekly cron target; one magazine per persona |
| `app/api/preview/route.js` | Render a magazine without sending (`?format=pdf`) |
| `app/api/ask/route.js`     | Answer a question over the corpus |
| `lib/personas.js`          | **Edit this** to define who gets a digest and how |
| `lib/summarize.js`         | Per-email summary + tags at ingest |
| `lib/issue.js`             | Persona-lens issue builder (runs over summaries) |
| `lib/magazine.js`          | Editorial print-CSS template |
| `lib/pdf.js` · `lib/resend.js` · `lib/db.js` · `lib/digest.js` · `lib/llm.js` | render / send / store / orchestrate / model switch |
| `vercel.json`              | Cron schedule |

## Deploy (browser only — see chat for the click-by-click)

1. Push these files to a GitHub repo.
2. Import the repo at vercel.com/new; bulk-paste your filled-in `.env` into the
   Environment Variables box; deploy.
3. Create a Resend webhook → `https://<app>.vercel.app/api/webhook`, event
   `email.received`; put its secret in `RESEND_WEBHOOK_SECRET`; **redeploy** (registers cron).
4. Subscribe newsletters to your `*.resend.app` inbound address; confirm opt-ins.

## Personas

Open `lib/personas.js` and edit the list — each entry is `{ id, label, lens, to? }`. The
weekly run produces one magazine per persona, framed by its `lens`, sent to `to` (or
`DIGEST_TO`). The shipped example includes a **Healthcare Sales Edition**. Editing the file
in GitHub's web editor auto-redeploys.

## Ask console

Visit `https://<app>.vercel.app/`, enter your `CRON_SECRET` as the access key, and ask
anything ("what's relevant in my industry this month?"). Answers cite which newsletters
they drew from. It reads the stored summaries, so it stays cheap and fast.

## How summarize-at-ingest works

Every inbound email is stored raw, then condensed to an ≤80-word `summary` + `tags` with one
cheap LLM call. Digests and the ask console run over those summaries instead of full bodies,
keeping token cost tiny as the corpus grows. If summarization fails, the raw body is kept and
used as a fallback. No embeddings yet — when the corpus gets large or you want sharper
per-persona targeting, add an `embedding F32_BLOB` column (Turso has native vector search)
and retrieve top-K per persona.

## Switching models

| `LLM_PROVIDER` | default model | key |
|---|---|---|
| `claude` | `claude-sonnet-4-6` | `ANTHROPIC_API_KEY` |
| `gemini` | `gemini-2.5-flash` | `GEMINI_API_KEY` |
| `openrouter` | *(set `LLM_MODEL`)* | `OPENROUTER_API_KEY` |

## Gotchas

- **Cron is UTC.** `0 7 * * 1` = Monday 07:00 UTC; edit `vercel.json` for your timezone.
  Hobby allows once-per-day-or-less, so weekly is fine.
- **Env / `vercel.json` change → redeploy** for it to take effect.
- **`puppeteer-core` ↔ `@sparticuz/chromium` must be version-matched** (`^23` / `^131` here).
  If PDFs fail, align their majors. `OUTPUT_FORMAT=html` skips Chromium entirely.
- **Webhook does an LLM call now** (`maxDuration=30`); promotional/short emails (<120 chars)
  are skipped to save calls.
- **Storage swap:** reimplement the exports in `lib/db.js` to move off Turso.
```
