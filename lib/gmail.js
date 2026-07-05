// lib/gmail.js — Gmail OAuth, inbox read, digest send.
import { google } from "googleapis";
import { getAppState, setAppState } from "@/lib/db";
import { htmlToPdf } from "@/lib/pdf";
import { markdownToEmailHtml, digestTitleFromMarkdown } from "@/lib/markdown";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

const REFRESH_TOKEN_KEY = "gmail_refresh_token";
const GMAIL_EMAIL_KEY = "gmail_email";

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
  return process.env.GMAIL_REFRESH_TOKEN || (await getAppState(REFRESH_TOKEN_KEY));
}

export async function saveRefreshToken(token, email) {
  await setAppState(REFRESH_TOKEN_KEY, token);
  if (email) await setAppState(GMAIL_EMAIL_KEY, email);
}

export async function isGmailConnected() {
  return !!(await getRefreshToken());
}

export async function getGmailEmail() {
  return process.env.GMAIL_ADDRESS || (await getAppState(GMAIL_EMAIL_KEY)) || null;
}

export async function getAuthorizedClient() {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) throw new Error("Gmail not connected — open Setup and connect your account");
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });
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
    prompt: "consent",
    scope: GMAIL_SCOPES,
    state,
  });
}

export async function exchangeCodeForTokens(code) {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("No refresh token — revoke app access in Google Account and try again");
  }
  oauth2.setCredentials(tokens);
  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress || null;
  await saveRefreshToken(tokens.refresh_token, email);
  return { email, refresh_token: tokens.refresh_token };
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

function buildRawEmail({ from, to, subject, html, pdfBuffer }) {
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
    lines.push("Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: 7bit", "", html, "");
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
    lines.push("Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: 7bit", "", html);
  }

  return Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Send a markdown digest via Gmail API (from the connected account). */
export async function sendDigest({ markdown, sourceCount, to, personaLabel }) {
  const gmail = await getGmailClient();
  const profile = await gmail.users.getProfile({ userId: "me" });
  const from = profile.data.emailAddress;
  if (!from) throw new Error("Could not read Gmail profile email");

  const brand = process.env.DIGEST_TITLE || "THE BRIEF";
  const format = process.env.OUTPUT_FORMAT || "html";
  const recipient = to || process.env.DIGEST_TO || from;
  const digestTitle = digestTitleFromMarkdown(markdown);
  const subject = `📰 ${brand} — ${digestTitle} (${sourceCount} sources)`;
  const html = markdownToEmailHtml(markdown, personaLabel);

  let pdfBuffer = null;
  let sendHtml = html;
  if (format === "pdf") {
    pdfBuffer = await htmlToPdf(html);
    sendHtml = `<p style="font-family:Georgia,serif">Your ${brand} digest is attached — compiled from ${sourceCount} newsletters.</p>`;
  }

  const raw = buildRawEmail({ from, to: recipient, subject, html: sendHtml, pdfBuffer });
  const r = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
  return { id: r.data.id, from, to: recipient };
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
