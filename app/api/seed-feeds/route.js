// app/api/seed-feeds/route.js — upsert RSS feeds from data/sources.csv into Supabase.
import { isAuthorized } from "@/lib/auth";
import { seedFeedsFromCsv } from "@/lib/seed-feeds-from-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req) {
  if (!isAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    const result = await seedFeedsFromCsv({ deactivateMissing: false });
    return Response.json({ ok: true, seeded: result.upserts });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req) {
  return POST(req);
}
