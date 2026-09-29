// app/api/gmail/auth/route.js — start OAuth flow.
import { getAuthUrl } from "@/lib/gmail";
import { isAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return Response.json(
      { error: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel first" },
      { status: 503 }
    );
  }
  const key = new URL(req.url).searchParams.get("key") || "setup";
  return Response.redirect(getAuthUrl(key));
}
