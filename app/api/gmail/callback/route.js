// app/api/gmail/callback/route.js — OAuth callback, store refresh token.
import { exchangeCodeForTokens } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");

  if (err) {
    return htmlPage("Gmail connection failed", `<p>Google returned: ${err}</p>`, false);
  }
  if (!code) {
    return htmlPage("Missing code", "<p>No authorization code received.</p>", false);
  }

  try {
    const { email } = await exchangeCodeForTokens(code);
    return htmlPage(
      "Gmail connected",
      `<p>Connected as <strong>${escapeHtml(email || "your account")}</strong>.</p>
       <p>Newsletters sent to this address will sync automatically. You can close this tab and return to Setup.</p>
       <p><a href="/confirm">Go to Setup →</a></p>`,
      true
    );
  } catch (e) {
    return htmlPage("Connection failed", `<p>${escapeHtml(e.message)}</p>`, false);
  }
}

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function htmlPage(title, body, ok) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5">
<h1 style="color:${ok ? "#059669" : "#dc2626"}">${title}</h1>${body}</body></html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
    status: ok ? 200 : 500,
  });
}
