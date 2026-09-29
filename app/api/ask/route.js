// app/api/ask/route.js — free-form question over the corpus.
import { allEmailsWithBodies } from "@/lib/db";
import { callLLM } from "@/lib/llm";
import { buildAskPrompt } from "@/lib/prompts";
import { prepareNewsletterContentForDigest, publicationHint } from "@/lib/newsletter-text";
import { isConfirmationEmail } from "@/lib/confirmations";
import { isAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { question, persona = "general" } = body;

  if (!isAuthorized(req, body)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!question || !question.trim()) {
    return Response.json({ error: "missing question" }, { status: 400 });
  }

  const rows = (await allEmailsWithBodies()).filter(
    (e) => !isConfirmationEmail(e) && e.tags !== "confirmation" && (e.body_text || e.body_html)
  );
  if (!rows.length) {
    return Response.json({
      answer: "No newsletters in the corpus yet — sync your Gmail inbox first.",
      sources: [],
    });
  }

  // Cap corpus size so ask stays inside Vercel time/token limits.
  const capped = rows
    .slice()
    .sort((a, b) => (b.received_at || 0) - (a.received_at || 0))
    .slice(0, Number(process.env.ASK_MAX_NEWSLETTERS || 40));

  const extracts = capped
    .map((r, i) => {
      const when = new Date(r.received_at * 1000).toISOString().slice(0, 10);
      const pub = publicationHint({ sender: r.sender, subject: r.subject });
      const text = prepareNewsletterContentForDigest(r.body_text || "", {
        body_html: r.body_html,
        subject: r.subject,
        sender: r.sender,
        receivedAt: r.received_at,
      });
      return `### [${i + 1}] ${pub || r.subject || "(no subject)"} — ${r.sender} • ${when}\n${text}`;
    })
    .join("\n\n---\n\n");

  const runDate = new Date().toISOString().slice(0, 10);
  const { system, user } = buildAskPrompt({
    personaKey: persona,
    question: question.trim(),
    runDate,
    n: capped.length,
    extracts,
  });

  const answer = await callLLM({ system, user, maxTokens: 1400 });

  return Response.json({
    answer,
    persona,
    sources: capped.map((r, i) => ({ n: i + 1, subject: r.subject, sender: r.sender })),
  });
}
