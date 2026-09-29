// lib/bartma.js — The Bartma Brief: research → verify → write → send → track.
import { createHash } from "crypto";
import { callLLM, parseJson } from "@/lib/llm";
import { sendHtmlEmail } from "@/lib/gmail";
import {
  bartmaOpportunityExists,
  getBartmaIssueNumber,
  listBartmaOpportunities,
  setBartmaIssueNumber,
  upsertBartmaOpportunity,
} from "@/lib/db";
import {
  researchSystemPrompt,
  researchUserPrompt,
  writeSystemPrompt,
  writeUserPrompt,
} from "@/lib/bartma-prompts";

export const BARTMA_TO = () =>
  (process.env.BARTMA_TO || "skyspeak@gmail.com").trim();
export const BARTMA_CC = () =>
  (process.env.BARTMA_CC || "stuymusty@gmail.com").trim();

function opportunityId({ company, role, url }) {
  const key = `${(company || "").toLowerCase().trim()}|${(role || "").toLowerCase().trim()}|${(url || "").toLowerCase().trim()}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 24);
}

function weekOfLabel(d = new Date()) {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

function bartmaModel() {
  return (
    process.env.BARTMA_GEMINI_MODEL ||
    process.env.GEMINI_MODEL ||
    "gemini-2.0-flash"
  );
}

/** Soft URL check — drop inventable / dead links. */
export async function verifyUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "BartmaBrief/1.0 (+career-digest)" },
    }).catch(() => null);
    if (!res || res.status === 405 || res.status === 403) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": "BartmaBrief/1.0 (+career-digest)" },
      });
    }
    clearTimeout(timer);
    return res.ok || (res.status >= 200 && res.status < 400);
  } catch {
    return false;
  }
}

async function researchOpportunities(alreadySent) {
  const text = await callLLM({
    system: researchSystemPrompt(),
    user: researchUserPrompt({ alreadySent, weekOf: weekOfLabel() }),
    maxTokens: 8192,
    googleSearch: true,
    model: bartmaModel(),
  });
  const data = parseJson(text);
  return {
    market_read: typeof data.market_read === "string" ? data.market_read : "",
    opportunities: Array.isArray(data.opportunities) ? data.opportunities : [],
    watchlist: Array.isArray(data.watchlist) ? data.watchlist : [],
  };
}

async function filterAndVerify(opportunities, { forceResend = false } = {}) {
  const kept = [];
  for (const raw of opportunities) {
    const company = String(raw.company || "").trim();
    const role = String(raw.role || "").trim();
    const url = String(raw.url || "").trim();
    if (!company || !role || !url) continue;

    const id = opportunityId({ company, role, url });
    const existing = await bartmaOpportunityExists({ id, url });
    if (existing && existing.status === "Sent" && !forceResend) continue;

    const ok = await verifyUrl(url);
    if (!ok) {
      console.warn(`[bartma] drop unverified url: ${url}`);
      continue;
    }

    kept.push({
      id,
      company,
      role,
      track: String(raw.track || "").trim() || null,
      url,
      score: Number(raw.score) || null,
      rationale: String(raw.rationale || "").trim() || null,
      warm_path: String(raw.warm_path || "").trim() || null,
      caveat: String(raw.caveat || "").trim() || null,
    });
  }
  // Highest score first; cap at 10.
  kept.sort((a, b) => (b.score || 0) - (a.score || 0));
  return kept.slice(0, 10);
}

async function writeEdition({ issueNumber, marketRead, opportunities, watchlist }) {
  const text = await callLLM({
    system: writeSystemPrompt(),
    user: writeUserPrompt({
      issueNumber,
      weekOf: weekOfLabel(),
      marketRead,
      opportunities,
      watchlist,
    }),
    maxTokens: 8192,
    json: true,
    model: bartmaModel(),
  });
  const data = parseJson(text);
  const headline =
    typeof data.headline === "string" && data.headline.trim()
      ? data.headline.trim()
      : "This week's opportunities";
  const html = typeof data.html === "string" ? data.html.trim() : "";
  if (!html) throw new Error("Bartma writer returned empty html");
  return {
    headline,
    market_read: data.market_read || marketRead,
    do_this_week: Array.isArray(data.do_this_week) ? data.do_this_week : [],
    html,
  };
}

function fallbackHtml({ issueNumber, marketRead, opportunities, watchlist, doThisWeek }) {
  const rows = opportunities
    .map(
      (o) => `
      <tr>
        <td style="font-family:Georgia,serif;font-size:28px;color:#1a365d;padding:12px 16px 12px 0;vertical-align:top;width:48px">${o.score ?? "—"}</td>
        <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;vertical-align:top">
          <div style="font-family:ui-monospace,monospace;font-size:11px;color:#64748b;text-transform:uppercase">${o.track || "role"}</div>
          <div style="font-family:Georgia,serif;font-size:18px;color:#0f172a;margin:4px 0">${o.role} — ${o.company}</div>
          <p style="font-family:Georgia,serif;font-size:14px;color:#334155;margin:6px 0">${o.rationale || ""}</p>
          ${o.caveat ? `<p style="font-family:Georgia,serif;font-size:13px;color:#b45309;margin:6px 0"><em>Caveat:</em> ${o.caveat}</p>` : ""}
          ${o.warm_path ? `<p style="font-family:Georgia,serif;font-size:13px;color:#1a365d;margin:6px 0"><em>Warm path:</em> ${o.warm_path}</p>` : ""}
          <a href="${o.url}" style="font-family:ui-monospace,monospace;font-size:12px;color:#1a365d">${o.url}</a>
        </td>
      </tr>`
    )
    .join("");

  const watch = (watchlist || [])
    .map(
      (w) =>
        `<li style="margin-bottom:8px"><strong>${w.company}</strong> — ${w.trigger}${w.url ? ` (<a href="${w.url}">source</a>)` : ""}</li>`
    )
    .join("");

  const moves = (doThisWeek || [])
    .map((m) => `<li style="margin-bottom:8px">${m}</li>`)
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#fff;color:#0f172a">
  <div style="max-width:640px;margin:0 auto;padding:32px 24px">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:32px;color:#1a365d">The Bartma Brief</div>
    <div style="font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#64748b;letter-spacing:0.04em;margin:8px 0 24px;border-bottom:2px solid #1a365d;padding-bottom:12px">
      VOL. 1 &nbsp;·&nbsp; NO. ${issueNumber} &nbsp;·&nbsp; ${weekOfLabel()}
    </div>
    <p style="font-family:Georgia,serif;font-size:16px;line-height:1.55;color:#1e293b">${marketRead || ""}</p>
    <table style="width:100%;border-collapse:collapse;margin-top:24px">${rows}</table>
    ${watch ? `<h2 style="font-family:Georgia,serif;font-size:20px;color:#1a365d;margin-top:32px">Watchlist</h2><ul style="font-family:Georgia,serif;font-size:14px;color:#334155">${watch}</ul>` : ""}
    ${moves ? `<h2 style="font-family:Georgia,serif;font-size:20px;color:#1a365d;margin-top:32px">Do this week</h2><ol style="font-family:Georgia,serif;font-size:14px;color:#334155">${moves}</ol>` : ""}
  </div></body></html>`;
}

/**
 * Produce and email one Bartma Brief edition.
 * @param {{ test?: boolean, dryRun?: boolean, force?: boolean }} opts
 */
export async function runBartmaBrief({ test = false, dryRun = false, force = false } = {}) {
  void test; // reserved: keep recipient contract identical for test + prod runs
  const previousIssue = await getBartmaIssueNumber();
  const issueNumber = previousIssue + 1;
  const alreadySent = await listBartmaOpportunities({ limit: 300 });

  const research = await researchOpportunities(alreadySent);
  const opportunities = await filterAndVerify(research.opportunities, {
    forceResend: force,
  });

  if (!opportunities.length && !force) {
    return {
      skipped: true,
      reason: "no verified new opportunities",
      market_read: research.market_read,
      issue_number: issueNumber,
    };
  }

  let edition;
  try {
    edition = await writeEdition({
      issueNumber,
      marketRead: research.market_read,
      opportunities,
      watchlist: research.watchlist,
    });
  } catch (e) {
    console.warn(`[bartma] writer failed, using fallback html: ${e.message}`);
    edition = {
      headline: research.market_read?.slice(0, 80) || "This week's opportunities",
      market_read: research.market_read,
      do_this_week: [],
      html: fallbackHtml({
        issueNumber,
        marketRead: research.market_read,
        opportunities,
        watchlist: research.watchlist,
        doThisWeek: [],
      }),
    };
  }

  // Prefer model HTML; if it somehow lacks structure, wrap isn't needed — we send as-is.
  const html = edition.html.includes("<")
    ? edition.html
    : fallbackHtml({
        issueNumber,
        marketRead: edition.market_read,
        opportunities,
        watchlist: research.watchlist,
        doThisWeek: edition.do_this_week,
      });

  const to = BARTMA_TO();
  const cc = BARTMA_CC();
  const subject = `The Bartma Brief — Vol. 1, No. ${issueNumber}: ${edition.headline}`;

  if (dryRun) {
    return {
      skipped: false,
      dry_run: true,
      issue_number: issueNumber,
      subject,
      to,
      cc,
      opportunity_count: opportunities.length,
      opportunities,
      watchlist: research.watchlist,
      html,
    };
  }

  let sendResult;
  try {
    sendResult = await sendHtmlEmail({
      to,
      cc,
      subject,
      html,
      fromName: "The Bartma Brief",
    });
  } catch (e) {
    return {
      skipped: false,
      sent: false,
      error: e.message || String(e),
      issue_number: issueNumber,
      subject,
      opportunity_count: opportunities.length,
      opportunities,
    };
  }

  const now = Math.floor(Date.now() / 1000);
  for (const o of opportunities) {
    await upsertBartmaOpportunity({
      ...o,
      status: "Sent",
      issue_number: issueNumber,
      sent_at: now,
      created_at: now,
    });
  }
  for (const w of research.watchlist || []) {
    if (!w.company) continue;
    const id = opportunityId({
      company: w.company,
      role: `watchlist:${w.trigger || "trigger"}`,
      url: w.url || "",
    });
    await upsertBartmaOpportunity({
      id,
      company: w.company,
      role: w.trigger || "Watchlist",
      track: w.track || null,
      url: w.url || null,
      status: "Watchlist",
      rationale: w.trigger || null,
      issue_number: issueNumber,
      created_at: now,
    });
  }

  await setBartmaIssueNumber(issueNumber);

  return {
    skipped: false,
    sent: true,
    via: "gmail",
    id: sendResult.id,
    from: sendResult.from,
    to: sendResult.to,
    cc: sendResult.cc,
    issue_number: issueNumber,
    subject,
    opportunity_count: opportunities.length,
    opportunities,
    watchlist: research.watchlist,
  };
}
