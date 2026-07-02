// app/api/webhook/route.js — Resend inbound → verify → store → summarize.
import { Webhook } from "svix";
import { insertEmail, updateSummary } from "@/lib/db";
import { summarizeEmail } from "@/lib/summarize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // includes one summarization LLM call

const htmlToText = (h = "") =>
  h
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();

export async function POST(req) {
  const payload = await req.text();

  let evt;
  if (process.env.RESEND_WEBHOOK_SECRET) {
    try {
      evt = new Webhook(process.env.RESEND_WEBHOOK_SECRET).verify(payload, {
        "svix-id": req.headers.get("svix-id"),
        "svix-timestamp": req.headers.get("svix-timestamp"),
        "svix-signature": req.headers.get("svix-signature"),
      });
    } catch {
      return Response.json({ error: "bad signature" }, { status: 400 });
    }
  } else {
    evt = JSON.parse(payload);
  }

  if (evt.type === "email.received") {
    const x = evt.data;
    const id = x.email_id || x.id || crypto.randomUUID();
    const body = x.text || htmlToText(x.html);

    // 1) Store the raw email immediately (so nothing is lost if step 2 fails).
    await insertEmail({
      id,
      sender: x.from,
      subject: x.subject || "",
      body_text: body,
      received_at: Math.floor(Date.now() / 1000),
    });

    // 2) Summarize + tag. Best-effort: a failure here doesn't fail the webhook,
    //    and the digest will fall back to the raw body if summary is missing.
    if (body && body.length > 120) {
      try {
        const { summary, tags } = await summarizeEmail({ subject: x.subject || "", sender: x.from, body });
        await updateSummary(id, summary, tags);
      } catch (e) {
        console.error("[summarize] failed:", e.message);
      }
    }
  }

  return Response.json({ ok: true });
}
