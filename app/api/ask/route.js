// app/api/ask/route.js — free-form question over the corpus using digest prompt library.
import { allSummaries } from "@/lib/db";
import { callLLM } from "@/lib/llm";
import { buildAskPrompt } from "@/lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req) {
  const { question, key, persona = "general" } = await req.json().catch(() => ({}));

  const secret = process.env.CRON_SECRET;
  if (secret && key !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!question || !question.trim()) {
    return Response.json({ error: "missing question" }, { status: 400 });
  }

  const rows = await allSummaries(500);
  const usable = rows.filter((r) => r.summary && r.summary.length);
  if (!usable.length) {
    return Response.json({
      answer: "No summarized newsletters yet — give the pipeline a few inbound issues first.",
      sources: [],
    });
  }

  const extracts = usable
    .map((r, i) => {
      const when = new Date(r.received_at * 1000).toISOString().slice(0, 10);
      return `### [${i + 1}] ${r.subject || "(no subject)"} — ${r.sender} • ${when}\n${r.summary}`;
    })
    .join("\n\n---\n\n");

  const runDate = new Date().toISOString().slice(0, 10);
  const { system, user } = buildAskPrompt({
    personaKey: persona,
    question: question.trim(),
    runDate,
    n: usable.length,
    extracts,
  });

  const answer = await callLLM({ system, user, maxTokens: 1400 });

  return Response.json({
    answer,
    persona,
    sources: usable.map((r, i) => ({ n: i + 1, subject: r.subject, sender: r.sender })),
  });
}
