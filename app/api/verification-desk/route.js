// app/api/verification-desk/route.js — weekly Verification Desk (Vercel Cron + manual).
import { isAuthorized } from "@/lib/auth";
import { runVerificationDesk } from "@/lib/verification-desk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req) {
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  if (!isAuthorized(req, body)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1" || body.force === true;
  const test = url.searchParams.get("test") === "1" || body.test === true;
  const dryRun =
    url.searchParams.get("dry") === "1" ||
    url.searchParams.get("dryRun") === "1" ||
    body.dryRun === true ||
    body.dry === true;
  const format = url.searchParams.get("format") || body.format;

  try {
    const result = await runVerificationDesk({
      force: force || test || dryRun,
      test,
      dryRun,
    });

    if (format === "html" && result.html) {
      const status = result.sent
        ? `<p style="font-family:system-ui,sans-serif;color:#059669">Sent to ${result.to} (${result.id}).</p>`
        : result.skipped
          ? `<p style="font-family:system-ui,sans-serif">Skipped: ${result.reason}</p>`
          : result.dry_run
            ? `<p style="font-family:system-ui,sans-serif;color:#12456b">Dry run — not sent.</p>`
            : `<p style="font-family:system-ui,sans-serif;color:#dc2626">${result.error || "Not sent"}</p>`;
      return new Response(`${status}${result.html || ""}`, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (!result.skipped && !result.dry_run && result.sent === false) {
      return Response.json(
        {
          ...result,
          delivery: "FAILED",
          notice: `SEND FAILED — ${result.error}. Do not treat this digest as delivered.`,
        },
        { status: 502 }
      );
    }

    return Response.json(result);
  } catch (e) {
    console.error("[verification-desk]", e);
    if (format === "html") {
      return new Response(e.message, {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return Response.json(
      {
        delivery: "FAILED",
        error: e instanceof Error ? e.message : String(e),
        notice: "SEND FAILED — run aborted before or during delivery.",
      },
      { status: 500 }
    );
  }
}

export async function GET(req) {
  return handle(req);
}

export async function POST(req) {
  return handle(req);
}
