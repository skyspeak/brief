// app/api/webhook/route.js — Resend inbound → verify → store → summarize.
import { Webhook } from "svix";
import { insertEmail, updateSummary } from "@/lib/db";
import { fetchReceivedEmail } from "@/lib/resend";
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
  try {
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
      if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
        return Response.json(
          { error: "database not configured — set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel" },
          { status: 503 }
        );
      }

      const x = evt.data;
      const id = x?.email_id || x?.id || crypto.randomUUID();
      let body = x?.text || htmlToText(x?.html);
      let subject = x?.subject || "";
      let sender = x?.from;

      // Resend webhooks are metadata-only — fetch body via Receiving API.
      if (id && process.env.RESEND_API_KEY) {
        try {
          const full = await fetchReceivedEmail(id);
          body = full.text || htmlToText(full.html) || body;
          subject = full.subject || subject;
          sender = full.from || sender;
        } catch (e) {
          console.error("[webhook] Resend fetch failed:", e.message);
        }
      }

      await insertEmail({
        id,
        sender,
        subject,
        body_text: body,
        received_at: Math.floor(Date.now() / 1000),
      });

      if (body && body.length > 120) {
        try {
          const { summary, tags } = await summarizeEmail({ subject, sender, body });
          await updateSummary(id, summary, tags);
        } catch (e) {
          console.error("[summarize] failed:", e.message);
        }
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[webhook] error:", err.message);
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}
