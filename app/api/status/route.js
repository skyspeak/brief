// app/api/status/route.js — pipeline health: email counts + recent ingest state.
//   /api/status?key=<CRON_SECRET>
import { emailStatus } from "@/lib/db";
import { PROVIDER, resolveModel } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return new URL(req.url).searchParams.get("key") === secret;
}

function envCheck() {
  const llmOk =
    PROVIDER === "openrouter"
      ? !!(process.env.OPENROUTER_API_KEY && process.env.LLM_MODEL)
      : PROVIDER === "gemini"
        ? !!process.env.GEMINI_API_KEY
        : PROVIDER === "claude"
          ? !!process.env.ANTHROPIC_API_KEY
          : false;

  return {
    turso: !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN),
    resend_api: !!process.env.RESEND_API_KEY,
    resend_webhook: !!process.env.RESEND_WEBHOOK_SECRET,
    llm_provider: PROVIDER,
    llm_model: process.env.LLM_MODEL || null,
    llm_ok: llmOk,
    cron_secret: !!process.env.CRON_SECRET,
  };
}

function pipelineHint(counts, env) {
  if (!env.turso) return "Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel.";
  if (counts.total === 0) return "No emails yet — send one to your Resend inbound address.";
  if (counts.with_body === 0)
    return "Emails stored but bodies empty — check RESEND_API_KEY and redeploy (webhook fetches body via Resend API).";
  if (counts.with_summary === 0)
    return "Bodies stored but no summaries — check LLM_PROVIDER, OPENROUTER_API_KEY, and LLM_MODEL; see Vercel logs for [summarize] failed.";
  if (counts.with_summary < counts.total)
    return "Some emails lack summaries — older rows may predate the body-fetch fix; send a new test email.";
  return "Pipeline healthy — ask console should work.";
}

export async function GET(req) {
  if (!authorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const env = envCheck();
    if (!env.turso) {
      return Response.json({
        ok: false,
        env,
        hint: pipelineHint({ total: 0, with_body: 0, with_summary: 0, digested: 0 }, env),
      });
    }

    const { counts, recent } = await emailStatus(10);
    let llm_model_resolved = null;
    try {
      llm_model_resolved = resolveModel();
    } catch {
      /* LLM_MODEL missing for openrouter */
    }

    return Response.json({
      ok: counts.with_summary > 0,
      env: { ...env, llm_model_resolved },
      counts,
      recent,
      hint: pipelineHint(counts, env),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
