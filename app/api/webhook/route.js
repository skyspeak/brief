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
  const runId = "webhook-pre-fix";
  const dbg = (hypothesisId, location, message, data) => {
    // #region agent log
    console.error("[debug-63c155]", JSON.stringify({ hypothesisId, location, message, data, timestamp: Date.now() }));
    fetch("http://127.0.0.1:7503/ingest/cc750943-9d9a-4237-90bc-50c1a19a76d2", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "63c155" },
      body: JSON.stringify({ sessionId: "63c155", runId, hypothesisId, location, message, data, timestamp: Date.now() }),
    }).catch(() => {});
    // #endregion
  };

  try {
    const payload = await req.text();
    dbg("A", "webhook:entry", "webhook received", {
      payloadLen: payload.length,
      hasWebhookSecret: !!process.env.RESEND_WEBHOOK_SECRET,
      hasTursoUrl: !!process.env.TURSO_DATABASE_URL,
      hasTursoToken: !!process.env.TURSO_AUTH_TOKEN,
      hasSvixId: !!req.headers.get("svix-id"),
    });

    let evt;
    if (process.env.RESEND_WEBHOOK_SECRET) {
      try {
        evt = new Webhook(process.env.RESEND_WEBHOOK_SECRET).verify(payload, {
          "svix-id": req.headers.get("svix-id"),
          "svix-timestamp": req.headers.get("svix-timestamp"),
          "svix-signature": req.headers.get("svix-signature"),
        });
        dbg("D", "webhook:verify", "signature verified", { eventType: evt?.type });
      } catch (verifyErr) {
        dbg("D", "webhook:verify", "signature failed", { error: verifyErr?.message });
        return Response.json({ error: "bad signature" }, { status: 400 });
      }
    } else {
      evt = JSON.parse(payload);
      dbg("D", "webhook:parse", "parsed without secret", { eventType: evt?.type });
    }

    if (evt.type === "email.received") {
      const x = evt.data;
      const id = x?.email_id || x?.id || crypto.randomUUID();
      const body = x?.text || htmlToText(x?.html);
      dbg("B", "webhook:payload", "email.received parsed", {
        hasData: !!x,
        id,
        hasText: !!x?.text,
        hasHtml: !!x?.html,
        bodyLen: body?.length ?? 0,
        fromType: typeof x?.from,
        subjectLen: (x?.subject || "").length,
        dataKeys: x ? Object.keys(x).slice(0, 12) : [],
      });

      try {
        await insertEmail({
          id,
          sender: x.from,
          subject: x.subject || "",
          body_text: body,
          received_at: Math.floor(Date.now() / 1000),
        });
        dbg("A", "webhook:db", "insertEmail ok", { id });
      } catch (dbErr) {
        dbg("A", "webhook:db", "insertEmail failed", { error: dbErr?.message, name: dbErr?.name });
        throw dbErr;
      }

      if (body && body.length > 120) {
        try {
          const { summary, tags } = await summarizeEmail({ subject: x.subject || "", sender: x.from, body });
          await updateSummary(id, summary, tags);
          dbg("E", "webhook:summarize", "summarize ok", { id, summaryLen: summary?.length ?? 0 });
        } catch (e) {
          dbg("E", "webhook:summarize", "summarize failed", { error: e?.message });
          console.error("[summarize] failed:", e.message);
        }
      } else {
        dbg("B", "webhook:body", "skipped summarize — no body in webhook payload", { bodyLen: body?.length ?? 0 });
      }
    } else {
      dbg("D", "webhook:event", "ignored event type", { eventType: evt?.type });
    }

    return Response.json({ ok: true });
  } catch (err) {
    dbg("A", "webhook:catch", "unhandled error", { error: err?.message, name: err?.name, stack: err?.stack?.slice(0, 300) });
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}
