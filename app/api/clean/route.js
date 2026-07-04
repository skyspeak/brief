// app/api/clean/route.js — re-clean all stored newsletter bodies from HTML.
import { cleanAllBodies } from "@/lib/clean-bodies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(body, req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  if (body?.key === secret) return true;
  return new URL(req.url).searchParams.get("key") === secret;
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (!authorized(body, req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await cleanAllBodies());
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
