# Newsletter Magazine

A serverless pipeline that connects to your **personal Gmail**, syncs newsletters,
and distills them into **one cross-newsletter digest** emailed from your Gmail account.
Plus an on-demand **briefing console** and ask-over-corpus. Deploys to Vercel.

```
Gmail inbox ──▶ /api/sync (daily cron) ──▶ Turso
RSS feeds   ──▶ /api/ingest-rss (daily) ──▶┘ store into emails corpus
                      │
Vercel Cron ──▶ /api/digest (Mon/Fri) ──▶ buildDigest (LLM) ──▶ Gmail send
Vercel Cron ──▶ /api/bartma (Wed) ──▶ Gemini + Search ──▶ Gmail
Vercel Cron ──▶ /api/verification-desk (Thu) ──▶ Gemini + Search ──▶ Gmail
                      │
Home (/) ──▶ briefing + ask ──▶ same corpus
```

## Deploy

1. Push to GitHub and import at [vercel.com/new](https://vercel.com/new).
2. Create a [Google Cloud project](https://console.cloud.google.com/) → enable **Gmail API**.
3. Create **OAuth 2.0 Client** (Web application):
   - Authorized redirect URI: `https://<your-app>.vercel.app/api/gmail/callback`
   - (Local dev: `http://localhost:3000/api/gmail/callback`)
4. Set environment variables in Vercel (see `.env.example`).
5. Generate long-lived secrets locally: `npm run gen-secrets` → set **both** `ACCESS_KEY` and `CRON_SECRET` in Vercel (they can differ).
6. Deploy, then open **Setup** in the app → paste `ACCESS_KEY` → **Connect Gmail**.
7. Subscribe newsletters using your Gmail address → **Sync inbox**.

### Recommended: Gmail label filter

Create a Gmail filter (e.g. label **Newsletters**) for subscription senders, then set in Vercel:

```
GMAIL_LABEL=Newsletters
```

Without a label, sync pulls recent inbox mail matching the default query.

## File map

| Path | Role |
|------|------|
| `lib/gmail.js` | OAuth, read messages, send digest via Gmail API |
| `lib/gmail-sync.js` | Poll inbox → store → summarize |
| `app/api/sync/route.js` | Manual + cron inbox sync |
| `app/api/gmail/*` | OAuth connect flow |
| `app/api/digest/route.js` | Scheduled digest send |
| `app/api/verification-desk/route.js` | Weekly Verification Desk (Gemini search → Gmail) |
| `lib/verification-desk.js` | Research, grade, email-safe HTML render, send |
| `app/confirm/page.js` | Setup: connect Gmail, sync, confirm subscriptions |
| `lib/personas.js` | Who gets a digest and how it's framed |

## Personas

Edit `lib/personas.js` — default recipient (`DEFAULT_DIGEST_TO` / `DIGEST_TO`). One email per run with neutral talking points, stats, and one insight per role.

## RSS feeds

Optional second ingest path. Articles land in the same `emails` table (ids prefixed `rss:`) so digests and briefings pick them up automatically.

```bash
npm run verify-feeds              # probe data/sources.csv
npm run verify-feeds -- --write   # repair broken feed URLs
npm run seed-feeds                # upsert active feeds into Turso (needs TURSO_* env)
npm run gen-secrets               # print fresh ACCESS_KEY + CRON_SECRET
curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/ingest-rss
```

`data/sources.csv` lists ~45 RSS feeds and ~11 email-only sources (keep those on Gmail). Dead feeds auto-deactivate after repeated failures. The first `/api/ingest-rss` run **auto-seeds** feeds from the CSV when the table is empty.

## Access secrets

| Env var | Purpose |
|---------|---------|
| `ACCESS_KEY` | Long-lived UI / manual API key (paste into the app). **Does not expire.** |
| `CRON_SECRET` | Vercel Cron `Authorization: Bearer …` token. Can differ from `ACCESS_KEY`. |

Either value unlocks protected routes. Prefer `ACCESS_KEY` in the UI so you can rotate `CRON_SECRET` without changing what you type in the app.

## Cron

| Schedule | Route | Purpose |
|----------|-------|---------|
| Daily 04:00 UTC | `/api/ingest-rss` | Pull RSS articles into the corpus |
| Daily 06:00 UTC | `/api/sync` | Pull new Gmail messages |
| Mon & Fri 07:00 UTC | `/api/digest` | Send digest if interval elapsed |
| Wednesdays 14:00 UTC | `/api/bartma` | The Bartma Brief (~7am Pacific) |
| Thursdays 14:00 UTC | `/api/verification-desk` | Verification Desk / Market Wizard (~7am Pacific) |

Requires `CRON_SECRET` in Vercel (sent as Bearer token on cron invocations). Set a separate `ACCESS_KEY` for the dashboard.

## The Bartma Brief

Weekly executive opportunity digest for Megh Gautam. Uses **Gemini + Google Search grounding**, verifies apply URLs, tracks sent items in Turso, and emails via the connected Gmail account (`prefer`-style path in `sendHtmlEmail`).

| | |
|--|--|
| To | `skyspeak@gmail.com` (override with `BARTMA_TO`) |
| Cc | `stuymusty@gmail.com` (override with `BARTMA_CC`) |
| Subject | `The Bartma Brief — Vol. 1, No. N: …` |

Manual run (dry first):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://<app>/api/bartma?dry=1"
curl -H "Authorization: Bearer $CRON_SECRET" "https://<app>/api/bartma"
```

Needs `maxDuration` up to 300s (Vercel Pro). Hobby may time out on the research step.

## Verification Desk

Weekly market-intelligence email that attacks the 16 Aug 2026 “Verification Decade” forecast. Uses **Gemini + Google Search**, grades the week (`NO MOVEMENT` / `DRIFT` / `TRIPPED`) against seven tripwires, and sends house-style HTML via connected Gmail.

| | |
|--|--|
| To | `stuymusty@gmail.com` (override with `VERIFICATION_DESK_TO`) |
| Subject | `Verification Desk — [D Mon] — [grade]: [headline]` |

```bash
curl -H "Authorization: Bearer $ACCESS_KEY" "https://<app>/api/verification-desk?dry=1&force=1"
curl -H "Authorization: Bearer $ACCESS_KEY" "https://<app>/api/verification-desk?force=1"
```

Optional: `VERIFICATION_DESK_MODEL` (defaults to `GEMINI_MODEL` / `gemini-2.0-flash`).

## Switching models

Default: **Gemini only**. If Gemini returns **429** or **503** (overloaded), the app retries briefly, then tries OpenRouter’s free model when `OPENROUTER_API_KEY` is set. Always-on OpenRouter fallback still needs `LLM_FALLBACK=openrouter` + `LLM_ENABLE_OPENROUTER_FALLBACK=1`.

If OpenRouter returns **402** (“never purchased credits”), free routes often need a phone verify or a small credit balance at https://openrouter.ai/settings/credits — or set `OPENROUTER_FREE_MODEL` / `LLM_MODEL` to an explicit `:free` model.

| Provider | Env var | Default model |
|----------|---------|---------------|
| `gemini` | `GEMINI_API_KEY` | `gemini-2.0-flash` |
| `openrouter` | `OPENROUTER_API_KEY` + `LLM_MODEL` | `openrouter/free` |
| `claude` | `ANTHROPIC_API_KEY` | only if `LLM_PROVIDER=claude` |

## Gotchas

### Gmail refresh tokens (the thing that actually expires)

`ACCESS_KEY` / `CRON_SECRET` never expire. The token that dies is Google’s **refresh token**:

| OAuth consent publishing | Refresh token lifetime |
|--------------------------|------------------------|
| **Testing** | ~**7 days**, then sync/digest fail with `invalid_grant` |
| **Production** | Long-lived (until revoked) |

**Make it durable:**

1. [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent) → **Publish to Production** (add yourself as a test user first while still in Testing).
2. Reconnect Gmail on Setup (forces a fresh refresh token).
3. On the connect confirmation page, copy the refresh token → set `GMAIL_REFRESH_TOKEN` in Vercel → redeploy.

The app also re-persists rotated refresh tokens, probes auth on every sync, and surfaces expiry on Setup.

- **Restricted scopes** — `gmail.modify` / `gmail.send` show an unverified-app warning until Google verification; fine for personal use under the unverified user cap.
- **Re-auth after scope changes** — revoke at [myaccount.google.com/permissions](https://myaccount.google.com/permissions) and reconnect on Setup.
- **Summarized mail** is moved to Gmail Trash (not permanently deleted). Set `GMAIL_KEEP_IN_INBOX=1` to disable.
- **`OUTPUT_FORMAT=text`** (default) sends plain-text digests. Use `html` or `pdf` if you want styled email.
