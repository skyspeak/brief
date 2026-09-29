// app/api/clean/route.js — re-clean all stored newsletter bodies from HTML.
import { cleanAllBodies } from "@/lib/clean-bodies";
import { isAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (!isAuthorized(req, body)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await cleanAllBodies());
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
