// app/api/status/route.js — pipeline health: email counts + recent ingest state.
//   /api/status?key=<CRON_SECRET>
import { emailStatus, getLastDigestRun, getLastGmailSync } from "@/lib/db";
import { llmEnvStatus, resolveModelFor, getProviderChain } from "@/lib/llm";
import { isGmailConnected, getGmailEmail } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return new URL(req.url).searchParams.get("key") === secret;
}

async function envCheck() {
  const llm = llmEnvStatus();
  const gmailConnected = await isGmailConnected();

  return {
    turso: !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN),
    gmail_oauth: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    gmail_connected: gmailConnected,
    gmail_email: gmailConnected ? await getGmailEmail() : null,
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
  if (!env.gmail_oauth) return "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then connect Gmail on Setup.";
  if (!env.gmail_connected) return "Connect Gmail on the Setup page — newsletters are read from that inbox.";
  if (counts.total === 0) return "No emails synced yet — subscribe newsletters to your Gmail address, then Sync inbox.";
  if (counts.with_body === 0) return "Emails stored but bodies empty — try Sync inbox again.";
  if (counts.with_summary === 0)
    return "Bodies stored but no summaries — check GEMINI_API_KEY (primary) and OPENROUTER_API_KEY (fallback).";
  if (counts.with_summary < counts.total)
    return "Some emails lack summaries — tap Read on Inbox or run Generate briefing.";
  return "Pipeline healthy.";
}

export async function GET(req) {
  if (!authorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const env = await envCheck();
    if (!env.turso) {
      return Response.json({
        ok: false,
        env,
        hint: pipelineHint({ total: 0, with_body: 0, with_summary: 0, digested: 0 }, env),
      });
    }

    const { counts, recent } = await emailStatus(10);
    const chain = getProviderChain();
    let llm_model_resolved = null;
    const llm_models_resolved = {};
    try {
      llm_model_resolved = resolveModelFor(chain[0]);
      for (const p of chain) llm_models_resolved[p] = resolveModelFor(p);
    } catch {
      /* model resolution optional */
    }

    const intervalDays = Number(process.env.DIGEST_INTERVAL_DAYS || 3);
    const lastDigest = await getLastDigestRun();
    const nextDigest = lastDigest ? lastDigest + intervalDays * 86400 : null;
    const lastSync = await getLastGmailSync();

    return Response.json({
      ok: counts.with_summary > 0,
      env: { ...env, llm_model_resolved, llm_models_resolved },
      counts,
      recent,
      gmail: {
        connected: env.gmail_connected,
        email: env.gmail_email,
        last_sync_at: lastSync,
        label: process.env.GMAIL_LABEL || null,
      },
      digest: {
        interval_days: intervalDays,
        window_days: Number(process.env.DIGEST_WINDOW_DAYS || intervalDays),
        last_run_at: lastDigest,
        next_run_at: nextDigest,
        digest_to: process.env.DIGEST_TO || "connected Gmail (default)",
      },
      hint: pipelineHint(counts, env),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
