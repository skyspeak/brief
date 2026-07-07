# Newsletter Magazine

A serverless pipeline that connects to your **personal Gmail**, summarizes each newsletter as it arrives,
and periodically distills them into **one tailored digest per persona** emailed from your Gmail account.
Plus an on-demand **briefing console** and ask-over-corpus. Deploys to Vercel.

```
Gmail inbox ──▶ /api/sync (daily cron) ──▶ Turso
                      │ store raw, summarize + tag
                      ▼
Vercel Cron ──▶ /api/digest ──▶ buildDigest (LLM) ──▶ Gmail send
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
5. Deploy, then open **Setup** in the app → enter `CRON_SECRET` → **Connect Gmail**.
6. Subscribe newsletters using your Gmail address → **Sync inbox**.

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
| `app/confirm/page.js` | Setup: connect Gmail, sync, confirm subscriptions |
| `lib/personas.js` | Who gets a digest and how it's framed |

## Personas

Edit `lib/personas.js` — default recipient (`DEFAULT_DIGEST_TO` / `DIGEST_TO`). One email per run with neutral talking points, stats, and one insight per role.

## Cron

| Schedule | Route | Purpose |
|----------|-------|---------|
| Daily 06:00 UTC | `/api/sync` | Pull new Gmail messages |
| Daily 07:00 UTC | `/api/digest` | Send digest if interval elapsed |

Requires `CRON_SECRET` in Vercel (sent as Bearer token on cron invocations).

## Switching models

Default: **Gemini only**. OpenRouter fallback is off unless you set both `LLM_FALLBACK=openrouter` and `LLM_ENABLE_OPENROUTER_FALLBACK=1`.

| Provider | Env var | Default model |
|----------|---------|---------------|
| `gemini` | `GEMINI_API_KEY` | `gemini-2.0-flash` |
| `openrouter` | `OPENROUTER_API_KEY` + `LLM_MODEL` | `openrouter/free` |
| `claude` | `ANTHROPIC_API_KEY` | only if `LLM_PROVIDER=claude` |

## Gotchas

- **OAuth testing mode** — personal Gmail apps in "Testing" need your Google account added as a test user on the OAuth consent screen.
- **Refresh token** is stored in Turso after connect; optionally also set `GMAIL_REFRESH_TOKEN` in env.
- **Re-auth after scope changes** — revoke the app at Google Account permissions and reconnect on Setup.
- **Summarized mail** is moved to Gmail Trash (not permanently deleted). Set `GMAIL_KEEP_IN_INBOX=1` to disable.
- **`OUTPUT_FORMAT=text`** (default) sends plain-text digests. Use `html` or `pdf` if you want styled email.
- **Re-auth** — revoke the app at [myaccount.google.com/permissions](https://myaccount.google.com/permissions) and reconnect if tokens break.
