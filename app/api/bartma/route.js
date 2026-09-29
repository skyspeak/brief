// app/api/bartma/route.js — The Bartma Brief (Sunday cron + manual).
import { isAuthorized } from "@/lib/auth";
import { runBartmaBrief } from "@/lib/bartma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req) {
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  if (!isAuthorized(req, body)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const test = url.searchParams.get("test") === "1" || body.test === true;
  const dryRun = url.searchParams.get("dry") === "1" || body.dry === true;
  const force = url.searchParams.get("force") === "1" || body.force === true;

  try {
    const result = await runBartmaBrief({ test, dryRun, force });

    // Loud failure contract: never describe as delivered if send failed.
    if (result.sent === false) {
      return Response.json(
        {
          ...result,
          delivery: "FAILED",
          notice: `SEND FAILED — ${result.error}. Do not treat this edition as delivered.`,
        },
        { status: 502 }
      );
    }

    return Response.json(result);
  } catch (e) {
    console.error("[bartma]", e);
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
