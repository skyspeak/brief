// lib/gmail.js — Gmail OAuth, inbox read, digest send.
//
// Longevity notes (this is the token that actually expires):
//   • Google *access* tokens last ~1h — google-auth-library refreshes them.
//   • Google *refresh* tokens last indefinitely ONLY when the OAuth consent
//     screen is in Production. In "Testing", Google expires them after ~7 days.
//   • We persist refresh tokens to Turso, re-save any rotated refresh token,
//     and recommend mirroring into GMAIL_REFRESH_TOKEN for durable backup.
import { google } from "googleapis";
import { getAppState, setAppState } from "@/lib/db";
import { htmlToPdf } from "@/lib/pdf";
import { markdownToEmailHtml, markdownToPlainText, digestTitleFromMarkdown } from "@/lib/markdown";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

const REFRESH_TOKEN_KEY = "gmail_refresh_token";
const GMAIL_EMAIL_KEY = "gmail_email";
const CONNECTED_AT_KEY = "gmail_connected_at";
const LAST_OK_KEY = "gmail_last_ok_at";
const LAST_ERROR_KEY = "gmail_last_error";
const TOKEN_SOURCE_KEY = "gmail_token_source";

/** Base URL for OAuth redirects — must match Google Cloud Console exactly. */
export function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");

  // Prefer stable production host (works even when browsing a preview deployment).
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) {
    const host = production.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${host}`;
  }

  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`;
  }

  return "http://localhost:3000";
}

export function gmailRedirectUri() {
  return `${appOrigin()}/api/gmail/callback`;
}

export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel");
  }
  return new google.auth.OAuth2(clientId, clientSecret, gmailRedirectUri());
}

export async function getRefreshToken() {
  const fromEnv = (process.env.GMAIL_REFRESH_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  return (await getAppState(REFRESH_TOKEN_KEY)) || null;
}

export async function saveRefreshToken(token, email, { source = "oauth" } = {}) {
  if (token) {
    await setAppState(REFRESH_TOKEN_KEY, token);
    await setAppState(TOKEN_SOURCE_KEY, source);
  }
  if (email) await setAppState(GMAIL_EMAIL_KEY, email);
}

export async function markGmailConnected(email) {
  const now = Math.floor(Date.now() / 1000);
  await setAppState(CONNECTED_AT_KEY, String(now));
  await setAppState(LAST_OK_KEY, String(now));
  await setAppState(LAST_ERROR_KEY, "");
  if (email) await setAppState(GMAIL_EMAIL_KEY, email);
}

export async function markGmailOk() {
  await setAppState(LAST_OK_KEY, String(Math.floor(Date.now() / 1000)));
  await setAppState(LAST_ERROR_KEY, "");
}

export async function markGmailError(err) {
  const msg = err?.message || String(err || "unknown error");
  await setAppState(LAST_ERROR_KEY, msg.slice(0, 500));
}

export async function isGmailConnected() {
  return !!(await getRefreshToken());
}

export async function getGmailEmail() {
  return process.env.GMAIL_ADDRESS || (await getAppState(GMAIL_EMAIL_KEY)) || null;
}

export function isInvalidGrantError(err) {
  const msg = `${err?.message || ""} ${err?.response?.data?.error || ""} ${err?.response?.data?.error_description || ""}`;
  return /invalid_grant|Token has been expired or revoked|expired or revoked/i.test(msg);
}

/** Attach listener so rotated refresh tokens are persisted (Google may rotate). */
function attachTokenPersistence(oauth2, email) {
  oauth2.on("tokens", (tokens) => {
    // Fire-and-forget; callers also await markGmailOk on success paths.
    (async () => {
      try {
        if (tokens.refresh_token) {
          await saveRefreshToken(tokens.refresh_token, email, { source: "rotated" });
        }
        await markGmailOk();
      } catch (e) {
        console.warn("[gmail] failed to persist refreshed tokens:", e.message);
      }
    })();
  });
}

export async function getAuthorizedClient() {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) throw new Error("Gmail not connected — open Setup and connect your account");
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });
  attachTokenPersistence(oauth2, await getGmailEmail());
  return oauth2;
}

export async function getGmailClient() {
  const auth = await getAuthorizedClient();
  return google.gmail({ version: "v1", auth });
}

export function getAuthUrl(state) {
  const oauth2 = getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force refresh_token issuance on reconnect
    include_granted_scopes: true,
    scope: GMAIL_SCOPES,
    state,
  });
}

export async function exchangeCodeForTokens(code) {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("No refresh token — revoke the app at myaccount.google.com/permissions and connect again");
  }
  oauth2.setCredentials(tokens);
  attachTokenPersistence(oauth2, null);
  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress || null;
  await saveRefreshToken(tokens.refresh_token, email, { source: "oauth" });
  await markGmailConnected(email);
  return { email, refresh_token: tokens.refresh_token };
}

/**
 * Force a live token refresh + profile read. Use from cron/Setup to detect
 * expired refresh tokens early (common when OAuth app is still in Testing).
 */
export async function probeGmailAuth() {
  const hasEnvBackup = !!(process.env.GMAIL_REFRESH_TOKEN || "").trim();
  const hasDbToken = !!(await getAppState(REFRESH_TOKEN_KEY));
  const refreshToken = await getRefreshToken();

  if (!refreshToken) {
    return {
      ok: false,
      connected: false,
      reason: "not_connected",
      has_env_backup: hasEnvBackup,
      has_db_token: hasDbToken,
      hint: "Connect Gmail on Setup.",
    };
  }

  try {
    const oauth2 = getOAuth2Client();
    oauth2.setCredentials({ refresh_token: refreshToken });
    attachTokenPersistence(oauth2, await getGmailEmail());

    // Explicitly refresh access token so we learn about invalid_grant now.
    const { credentials } = await oauth2.refreshAccessToken();
    if (credentials.refresh_token) {
      await saveRefreshToken(credentials.refresh_token, null, { source: "rotated" });
    }

    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const email = profile.data.emailAddress || null;
    if (email) await setAppState(GMAIL_EMAIL_KEY, email);
    await markGmailOk();

    return {
      ok: true,
      connected: true,
      email,
      has_env_backup: hasEnvBackup,
      has_db_token: hasDbToken,
      access_token_expires_at: credentials.expiry_date
        ? Math.floor(credentials.expiry_date / 1000)
        : null,
    };
  } catch (e) {
    await markGmailError(e);
    const invalid = isInvalidGrantError(e);
    return {
      ok: false,
      connected: true,
      reason: invalid ? "refresh_expired" : "auth_error",
      error: e.message,
      has_env_backup: hasEnvBackup,
      has_db_token: hasDbToken,
      hint: invalid
        ? "Refresh token expired or was revoked. Reconnect Gmail on Setup. If this happens every ~7 days, publish your Google OAuth consent screen to Production (Testing mode expires refresh tokens)."
        : e.message,
    };
  }
}

/** Longevity / health snapshot for Setup + /api/status. */
export async function getGmailTokenHealth() {
  const connected = await isGmailConnected();
  const email = connected ? await getGmailEmail() : null;
  const connectedAt = Number((await getAppState(CONNECTED_AT_KEY)) || 0) || null;
  const lastOkAt = Number((await getAppState(LAST_OK_KEY)) || 0) || null;
  const lastError = (await getAppState(LAST_ERROR_KEY)) || null;
  const tokenSource = (await getAppState(TOKEN_SOURCE_KEY)) || null;
  const hasEnvBackup = !!(process.env.GMAIL_REFRESH_TOKEN || "").trim();
  const hasDbToken = !!(await getAppState(REFRESH_TOKEN_KEY));

  // Heuristic: if last OK was > 6 days ago and no env backup, warn about Testing-mode expiry.
  const now = Math.floor(Date.now() / 1000);
  const ageDays = lastOkAt ? (now - lastOkAt) / 86400 : connectedAt ? (now - connectedAt) / 86400 : null;
  const testingExpiryRisk =
    connected && !hasEnvBackup && ageDays != null && ageDays >= 5 && ageDays < 8;

  let longevity = "unknown";
  let hint = null;
  if (!connected) {
    longevity = "disconnected";
    hint = "Connect Gmail on Setup.";
  } else if (lastError && /invalid_grant|expired or revoked/i.test(lastError)) {
    longevity = "expired";
    hint =
      "Refresh token is dead — reconnect Gmail. Publish the OAuth consent screen to Production so new tokens no longer expire after 7 days.";
  } else if (hasEnvBackup) {
    longevity = "durable";
    hint = "GMAIL_REFRESH_TOKEN is set in Vercel (best durable backup). Still publish OAuth to Production to avoid 7-day Testing expiry.";
  } else if (testingExpiryRisk) {
    longevity = "at_risk";
    hint =
      "Token may expire soon if the Google OAuth app is still in Testing (7-day refresh tokens). Publish to Production, reconnect, and paste the refresh token into GMAIL_REFRESH_TOKEN.";
  } else {
    longevity = "ok";
    hint =
      "For a token that survives Turso resets and Testing-mode expiry: publish OAuth consent to Production, reconnect, then set GMAIL_REFRESH_TOKEN in Vercel from the connect confirmation page.";
  }

  return {
    connected,
    email,
    connected_at: connectedAt,
    last_ok_at: lastOkAt,
    last_error: lastError || null,
    token_source: tokenSource,
    has_env_backup: hasEnvBackup,
    has_db_token: hasDbToken,
    longevity,
    hint,
    oauth_publish_url: "https://console.cloud.google.com/apis/credentials/consent",
  };
}

function decodeBase64Url(data = "") {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

function headerValue(headers, name) {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function walkParts(part, out) {
  if (!part) return;
  const mime = part.mimeType || "";
  const data = part.body?.data;
  if (data) {
    const decoded = decodeBase64Url(data);
    if (mime === "text/html" && !out.body_html) out.body_html = decoded;
    else if (mime === "text/plain" && !out.body_text) out.body_text = decoded;
  }
  for (const child of part.parts || []) walkParts(child, out);
}

/** Parse a Gmail API message resource into stored-email fields. */
export function parseGmailMessage(msg) {
  const headers = msg.payload?.headers || [];
  const bodies = { body_html: "", body_text: "" };
  walkParts(msg.payload, bodies);

  return {
    id: msg.id,
    threadId: msg.threadId,
    sender: headerValue(headers, "From"),
    subject: headerValue(headers, "Subject"),
    body_html: bodies.body_html || null,
    body_text: bodies.body_text || null,
    received_at: Math.floor(Number(msg.internalDate || Date.now()) / 1000),
  };
}

export async function fetchGmailMessage(gmail, id) {
  const r = await gmail.users.messages.get({ userId: "me", id, format: "full" });
  return parseGmailMessage(r.data);
}

function formatGmailAfterDate(unixSec) {
  const d = new Date(unixSec * 1000);
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** Build Gmail search query for newsletter sync. */
export function syncQuery({ sinceSec } = {}) {
  const parts = [];
  const label = process.env.GMAIL_LABEL?.trim();
  const custom = process.env.GMAIL_QUERY?.trim();
  if (custom) parts.push(custom);
  else if (label) parts.push(`label:${label.replace(/\s+/g, "-")}`);
  if (sinceSec) parts.push(`after:${formatGmailAfterDate(sinceSec)}`);
  return parts.join(" ").trim() || "in:inbox";
}

export async function listMessageIds(gmail, { q, maxResults = 50, pageToken } = {}) {
  const r = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults,
    pageToken,
  });
  return {
    ids: (r.data.messages || []).map((m) => m.id),
    nextPageToken: r.data.nextPageToken || null,
  };
}

function encodeMimeHeader(value) {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  const b64 = Buffer.from(value, "utf8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

function buildRawEmail({ from, to, subject, body, contentType = "text/plain", pdfBuffer }) {
  const boundary = `brief_${Date.now()}`;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
  ];

  if (pdfBuffer) {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, "");
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${contentType}; charset=UTF-8`, "Content-Transfer-Encoding: 7bit", "", body, "");
    lines.push(`--${boundary}`);
    lines.push(
      'Content-Type: application/pdf; name="the-brief.pdf"',
      "Content-Transfer-Encoding: base64",
      'Content-Disposition: attachment; filename="the-brief.pdf"',
      "",
      pdfBuffer.toString("base64"),
      `--${boundary}--`
    );
  } else {
    lines.push(`Content-Type: ${contentType}; charset=UTF-8`, "Content-Transfer-Encoding: 7bit", "", body);
  }

  return Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Send a markdown digest via Gmail API (from the connected account). */
export async function sendDigest({ markdown, sourceCount, to, personaLabel }) {
  try {
    const gmail = await getGmailClient();
    const profile = await gmail.users.getProfile({ userId: "me" });
    const from = profile.data.emailAddress;
    if (!from) throw new Error("Could not read Gmail profile email");

    const brand = process.env.DIGEST_TITLE || "THE BRIEF";
    const format = (process.env.OUTPUT_FORMAT || "text").toLowerCase();
    const recipient = to || process.env.DIGEST_TO || from;
    const digestTitle = digestTitleFromMarkdown(markdown);
    const subject = `📰 ${brand} — ${digestTitle} (${sourceCount} sources)`;

    let body;
    let contentType = "text/plain";
    let pdfBuffer = null;

    if (format === "html") {
      body = markdownToEmailHtml(markdown, personaLabel);
      contentType = "text/html";
    } else if (format === "pdf") {
      const html = markdownToEmailHtml(markdown, personaLabel);
      pdfBuffer = await htmlToPdf(html);
      body = `Your ${brand} digest is attached — compiled from ${sourceCount} newsletters.`;
    } else {
      body = markdownToPlainText(markdown, personaLabel);
    }

    const raw = buildRawEmail({ from, to: recipient, subject, body, contentType, pdfBuffer });
    const r = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    await markGmailOk();
    return { id: r.data.id, from, to: recipient };
  } catch (e) {
    await markGmailError(e);
    if (isInvalidGrantError(e)) {
      throw new Error(
        "Gmail refresh token expired or revoked — reconnect on Setup. Publish OAuth consent to Production to stop 7-day Testing expiry."
      );
    }
    throw e;
  }
}

export function keepInInbox() {
  const v = process.env.GMAIL_KEEP_IN_INBOX;
  return v === "1" || v === "true";
}

/** True when a stored row is ready to remove from Gmail inbox. */
export function shouldTrashFromInbox({ summary, tags, body_text } = {}) {
  if (keepInInbox()) return false;
  if (tags === "confirmation") return false;
  const body = (body_text || "").trim();
  if (body.length > 120) return true;
  const s = (summary || "").trim();
  if (s && !/^none\.?$/i.test(s)) return true;
  return false;
}

/** Move a message to Gmail Trash (recoverable for 30 days). */
export async function trashFromInbox(gmail, messageId) {
  if (keepInInbox()) return { skipped: true, reason: "GMAIL_KEEP_IN_INBOX" };
  const client = gmail || (await getGmailClient());
  try {
    await client.users.messages.trash({ userId: "me", id: messageId });
    return { trashed: true };
  } catch (e) {
    const msg = e.message || "";
    if (e.code === 404 || /not found|Requested entity was not found/i.test(msg)) {
      return { skipped: true, reason: "not found" };
    }
    throw e;
  }
}

export async function trashIfSummarized(gmail, messageId, email) {
  if (!shouldTrashFromInbox(email)) return { skipped: true };
  return trashFromInbox(gmail, messageId);
}
