// app/api/ask/route.js — free-form question answered over the corpus of summaries.
import { allSummaries } from "@/lib/db";
import { callLLM } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req) {
  const { question, key } = await req.json().catch(() => ({}));

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
    return Response.json({ answer: "No summarized newsletters yet — give the pipeline a few inbound issues first.", sources: [] });
  }

  const corpus = usable
    .map((r, i) => {
      const when = new Date(r.received_at * 1000).toISOString().slice(0, 10);
      return `[${i + 1}] ${r.subject} — ${r.sender} • ${when}\n${r.summary}`;
    })
    .join("\n\n");

  const system =
`You are an industry analyst. Answer the user's question using ONLY the newsletter summaries
provided. Cite sources inline as [n] referring to the numbered items. Be specific, concise,
and structured. If the corpus doesn't cover the question, say so plainly rather than guessing.`;

  const answer = await callLLM({
    system,
    user: `CORPUS:\n${corpus}\n\nQUESTION: ${question}`,
    maxTokens: 1400,
  });

  return Response.json({
    answer,
    sources: usable.map((r, i) => ({ n: i + 1, subject: r.subject, sender: r.sender })),
  });
}
