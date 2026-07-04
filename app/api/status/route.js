// app/api/status/route.js — pipeline health: email counts + recent ingest state.
//   /api/status?key=<CRON_SECRET>
import { emailStatus, getLastDigestRun } from "@/lib/db";
import { llmEnvStatus, resolveModelFor, getProviderChain } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return new URL(req.url).searchParams.get("key") === secret;
}

function envCheck() {
  const llm = llmEnvStatus();

  return {
    turso: !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN),
    resend_api: !!process.env.RESEND_API_KEY,
    resend_webhook: !!process.env.RESEND_WEBHOOK_SECRET,
    llm_provider: llm.provider,
    llm_fallback: llm.fallback,
    llm_chain: llm.chain,
    llm_model: process.env.LLM_MODEL || null,
    llm_ok: llm.ok,
    cron_secret: !!process.env.CRON_SECRET,
  };
}

function pipelineHint(counts, env) {
  if (!env.turso) return "Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel.";
  if (counts.total === 0) return "No emails yet — send one to your Resend inbound address.";
  if (counts.with_body === 0)
    return "Emails stored but bodies empty — check RESEND_API_KEY and redeploy (webhook fetches body via Resend API).";
  if (counts.with_summary === 0)
    return "Bodies stored but no summaries — check GEMINI_API_KEY (primary) and OPENROUTER_API_KEY (fallback); see Vercel logs for [llm] failed.";
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
      llm_model_resolved = resolveModelFor(getProviderChain()[0]);
    } catch {
      /* model resolution optional */
    }

    const intervalDays = Number(process.env.DIGEST_INTERVAL_DAYS || 3);
    const lastDigest = await getLastDigestRun();
    const nextDigest = lastDigest ? lastDigest + intervalDays * 86400 : null;

    return Response.json({
      ok: counts.with_summary > 0,
      env: { ...env, llm_model_resolved },
      counts,
      recent,
      digest: {
        interval_days: intervalDays,
        window_days: Number(process.env.DIGEST_WINDOW_DAYS || intervalDays),
        last_run_at: lastDigest,
        next_run_at: nextDigest,
        digest_to: process.env.DIGEST_TO || "skyspeak@gmail.com (persona default)",
      },
      hint: pipelineHint(counts, env),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
