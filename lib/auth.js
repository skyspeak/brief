// lib/auth.js — shared API authorization.
//
// Two independent secrets (both long-lived env strings; they never expire):
//
//   ACCESS_KEY   — UI / manual API calls (paste into the app). Prefer this for
//                  day-to-day use so you can rotate CRON_SECRET without locking
//                  yourself out of the dashboard.
//   CRON_SECRET  — Vercel Cron Bearer token + legacy UI key when ACCESS_KEY is unset.
//
// Either secret is accepted for protected routes. Set both in Vercel for the
// recommended setup; rotate them independently anytime.

function configuredSecrets() {
  const secrets = new Set();
  const access = (process.env.ACCESS_KEY || "").trim();
  const cron = (process.env.CRON_SECRET || "").trim();
  if (access) secrets.add(access);
  if (cron) secrets.add(cron); // also unlocks UI when ACCESS_KEY is unset
  return [...secrets];
}

/** True when at least one access secret is configured. */
export function hasAccessSecret() {
  return configuredSecrets().length > 0;
}

/** Env status for /api/status. */
export function authEnvStatus() {
  const access = !!(process.env.ACCESS_KEY || "").trim();
  const cron = !!(process.env.CRON_SECRET || "").trim();
  return {
    access_key: access,
    cron_secret: cron,
    // UI works if either is set (ACCESS_KEY preferred when both exist).
    ui_key_configured: access || cron,
  };
}

function providedKeys(req, body = {}) {
  const keys = [];
  const auth = req?.headers?.get?.("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    keys.push(auth.slice(7).trim());
  }
  try {
    const url = new URL(req.url);
    const fromQuery =
      url.searchParams.get("key") ||
      url.searchParams.get("secret") ||
      url.searchParams.get("access_key");
    if (fromQuery) keys.push(fromQuery);
  } catch {
    /* ignore */
  }
  if (body?.key) keys.push(String(body.key));
  if (body?.access_key) keys.push(String(body.access_key));
  if (body?.secret) keys.push(String(body.secret));
  return keys.filter(Boolean);
}

/**
 * Authorize a request against ACCESS_KEY and/or CRON_SECRET.
 * If neither env var is set, allows through (local-dev convenience).
 */
export function isAuthorized(req, body = {}) {
  const secrets = configuredSecrets();
  if (!secrets.length) return true;
  const provided = providedKeys(req, body);
  return provided.some((k) => secrets.includes(k));
}

/** Strict cron check — prefers Bearer CRON_SECRET (Vercel Cron style). */
export function isCronAuthorized(req, body = {}) {
  return isAuthorized(req, body);
}

/** Hint shown in the UI when the key field is empty. */
export function accessKeyHint() {
  if ((process.env.ACCESS_KEY || "").trim()) {
    return "Paste your ACCESS_KEY from Vercel. Long-lived — it does not expire.";
  }
  return "Paste your ACCESS_KEY (or CRON_SECRET) from Vercel. Long-lived — it does not expire.";
}
