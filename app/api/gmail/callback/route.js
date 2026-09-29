// app/api/gmail/callback/route.js — OAuth callback, store refresh token.
import { exchangeCodeForTokens } from "@/lib/gmail";

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
    const { email, refresh_token } = await exchangeCodeForTokens(code);
    return htmlPage(
      "Gmail connected",
      `
       <p>Connected as <strong>${escapeHtml(email || "your account")}</strong>.</p>

       <h2 style="font-size:1.1rem;margin:1.75rem 0 0.5rem">Make this token long-lived</h2>
       <ol style="padding-left:1.25rem;margin:0 0 1rem">
         <li style="margin-bottom:0.5rem">
           Open <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener">Google OAuth consent screen</a>
           and set Publishing status to <strong>Production</strong>.
           While it stays in <em>Testing</em>, Google kills refresh tokens after <strong>~7 days</strong>.
         </li>
         <li style="margin-bottom:0.5rem">
           Paste the refresh token below into Vercel as <code>GMAIL_REFRESH_TOKEN</code>, then redeploy.
           That survives Turso wipes and is the durable backup.
         </li>
         <li>If you already published to Production, reconnect once so you get a non-expiring refresh token.</li>
       </ol>

       <label style="display:block;font-size:0.85rem;color:#64748b;margin-bottom:0.35rem">
         Refresh token (shown once — treat like a password)
       </label>
       <textarea id="rt" readonly rows="3" style="width:100%;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;padding:0.75rem;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc">${escapeHtml(refresh_token)}</textarea>
       <button type="button" id="copy" style="margin-top:0.75rem;padding:0.55rem 1rem;border:0;border-radius:8px;background:#0f172a;color:#fff;font-weight:600;cursor:pointer">
         Copy refresh token
       </button>
       <p id="copied" style="display:none;color:#059669;font-size:0.9rem;margin:0.5rem 0 0">Copied. Add it as GMAIL_REFRESH_TOKEN in Vercel → Environment Variables.</p>

       <p style="margin-top:1.75rem"><a href="/confirm">Go to Setup →</a></p>
       <script>
         document.getElementById('copy').onclick = async () => {
           const el = document.getElementById('rt');
           el.select();
           try { await navigator.clipboard.writeText(el.value); } catch { document.execCommand('copy'); }
           document.getElementById('copied').style.display = 'block';
         };
       </script>
      `,
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
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#0f172a">
<h1 style="color:${ok ? "#059669" : "#dc2626"}">${title}</h1>${body}</body></html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
    status: ok ? 200 : 500,
  });
}
