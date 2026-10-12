// app/api/gmail/callback/route.js — OAuth callback, store refresh token, return to Setup.
import { appOrigin, exchangeCodeForTokens } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");

  if (err) {
    return htmlPage("Gmail connection failed", `<p>Google returned: ${escapeHtml(err)}</p>`, false);
  }
  if (!code) {
    return htmlPage("Missing code", "<p>No authorization code received.</p>", false);
  }

  try {
    const { email } = await exchangeCodeForTokens(code);
    const dest = new URL("/confirm", appOrigin());
    dest.searchParams.set("gmail", "connected");
    if (email) dest.searchParams.set("email", email);
    return Response.redirect(dest);
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
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#0f172a">
<h1 style="color:${ok ? "#059669" : "#dc2626"}">${title}</h1>${body}</body></html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
    status: ok ? 200 : 500,
  });
}
