// app/api/summarize/route.js — ad-hoc map-step: one email or all pending.
//   POST { key, id? }  — id = single email; omit = all unsummarized
import { summarizeOne, summarizePending } from "@/lib/run-summarize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // one email per batch on Vercel hobby

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
    if (body.id) {
      const result = await summarizeOne(body.id, { force: !!body.force });
      return Response.json(result);
    }
    return Response.json(await summarizePending({ limit: body.limit || 1 }));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
