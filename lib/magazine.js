// lib/magazine.js — editorial print layout (renders the JSON issue to HTML).
import { PROVIDER, resolveModel } from "@/lib/llm";

const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pill = (e) => `<span class="pill pill-${esc(e)}">${esc(e)}</span>`;

export function renderMagazine(d, persona = null) {
  const title = process.env.DIGEST_TITLE || "THE BRIEF";

  const features = (d.features || [])
    .map(
      (f) => `
    <section class="feature">
      <div class="kicker">${esc(f.theme)}</div>
      ${(f.items || [])
        .map(
          (it) => `
        <article>
          <h3>${esc(it.headline)}</h3>
          <p>${esc(it.summary)}</p>
          <div class="src">${esc(it.source)}</div>
        </article>`
        )
        .join("")}
    </section>`
    )
    .join("");

  const actions = (d.action_plan || [])
    .map(
      (a) => `
    <tr><td class="act">${esc(a.action)}</td><td>${esc(a.why)}</td>
        <td class="eff">${pill(a.effort)}</td><td class="src">${esc(a.source)}</td></tr>`
    )
    .join("");

  const clicks = (d.worth_a_click || [])
    .map((c) => `<li><span>${esc(c.title)}</span><em>${esc(c.source)}</em></li>`)
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  :root{ --ink:#1a1714; --paper:#faf7f0; --accent:#9a2515; --rule:#c9bfae; --muted:#6b6356; }
  @page{ size:Letter; margin:14mm 14mm 12mm; }
  *{ box-sizing:border-box; }
  body{ margin:0; color:var(--ink); background:var(--paper);
        font:10.5px/1.5 Georgia,"Times New Roman",serif; }
  .sans{ font-family:"Helvetica Neue",Arial,sans-serif; }
  .mast{ text-align:center; border-bottom:3px double var(--ink); padding-bottom:6px; margin-bottom:10px; }
  .mast .top{ display:flex; justify-content:space-between; font-family:"Helvetica Neue",Arial,sans-serif;
              font-size:8px; letter-spacing:.18em; text-transform:uppercase; color:var(--muted);
              border-bottom:1px solid var(--rule); padding-bottom:4px; margin-bottom:6px; }
  .wordmark{ font-size:42px; letter-spacing:.06em; font-weight:700; line-height:1; }
  .coverline{ font-style:italic; color:var(--accent); font-size:13px; margin-top:4px; }
  .top-split{ display:grid; grid-template-columns:1.6fr 1fr; gap:14px; margin-bottom:12px; }
  .lede{ font-size:12px; }
  .lede::first-letter{ font-size:34px; float:left; line-height:.8; padding:2px 6px 0 0; font-weight:700; color:var(--accent); }
  .tldr{ background:#f1ebdd; border:1px solid var(--rule); padding:8px 10px; }
  .tldr h4{ margin:0 0 5px; font-family:"Helvetica Neue",Arial,sans-serif; font-size:8.5px;
            letter-spacing:.16em; text-transform:uppercase; color:var(--accent); }
  .tldr ul{ margin:0; padding-left:14px; } .tldr li{ margin-bottom:3px; }
  .features{ column-count:2; column-gap:16px; column-rule:1px solid var(--rule); }
  .feature{ break-inside:avoid; margin-bottom:10px; }
  .kicker{ font-family:"Helvetica Neue",Arial,sans-serif; font-size:8px; letter-spacing:.16em;
           text-transform:uppercase; color:var(--accent); border-top:2px solid var(--ink);
           padding-top:3px; margin-bottom:5px; }
  .feature h3{ font-size:13px; margin:0 0 3px; line-height:1.15; }
  .feature p{ margin:0 0 3px; } .src{ font-style:italic; color:var(--muted); font-size:8.5px; }
  .pull{ break-inside:avoid; text-align:center; font-size:18px; line-height:1.3; font-style:italic;
         color:var(--accent); border-top:2px solid var(--ink); border-bottom:2px solid var(--ink);
         padding:12px 18px; margin:12px 0; }
  .plan{ break-before:page; }
  .plan h2,.clicks h2{ font-family:"Helvetica Neue",Arial,sans-serif; font-size:11px; letter-spacing:.18em;
           text-transform:uppercase; border-bottom:2px solid var(--ink); padding-bottom:4px; }
  table{ width:100%; border-collapse:collapse; margin-top:6px; }
  th{ text-align:left; font-family:"Helvetica Neue",Arial,sans-serif; font-size:8px; letter-spacing:.12em;
      text-transform:uppercase; color:var(--muted); border-bottom:1px solid var(--rule); padding:4px 6px; }
  td{ vertical-align:top; padding:6px; border-bottom:1px solid var(--rule); }
  td.act{ font-weight:700; width:26%; } td.eff{ width:48px; text-align:center; }
  .pill{ display:inline-block; min-width:18px; padding:1px 6px; border-radius:9px; color:#fff;
         font-family:"Helvetica Neue",Arial,sans-serif; font-size:8px; font-weight:700; }
  .pill-S{ background:#3f7d3f; } .pill-M{ background:#b8860b; } .pill-L{ background:var(--accent); }
  .clicks{ margin-top:14px; } .clicks ul{ list-style:none; margin:6px 0 0; padding:0; column-count:2; column-gap:18px; }
  .clicks li{ break-inside:avoid; border-left:2px solid var(--accent); padding:2px 0 6px 8px; margin-bottom:4px; }
  .clicks li em{ display:block; color:var(--muted); font-size:8.5px; }
  .colophon{ text-align:center; color:var(--muted); font-size:8px; margin-top:14px;
             border-top:1px solid var(--rule); padding-top:6px; font-family:"Helvetica Neue",Arial,sans-serif; }
  </style></head><body>

  <header class="mast">
    <div class="top"><span>${esc(d.dateline || "")}</span><span>${esc(persona?.label || "Personal Intelligence Weekly")}</span><span>Vol. 1</span></div>
    <div class="wordmark sans">${esc(title)}</div>
    <div class="coverline">${esc(d.issue_title || "This Week in Review")}</div>
  </header>

  <div class="top-split">
    <p class="lede">${esc(d.lede || "")}</p>
    <aside class="tldr"><h4>In This Issue</h4><ul>${(d.tldr || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ul></aside>
  </div>

  <main class="features">${features}</main>

  ${d.pull_quote ? `<blockquote class="pull">${esc(d.pull_quote)}</blockquote>` : ""}

  <section class="plan">
    <h2>The Action Plan</h2>
    <table><thead><tr><th>Action</th><th>Why it matters</th><th>Effort</th><th>Source</th></tr></thead>
    <tbody>${actions}</tbody></table>
    <div class="clicks"><h2>Worth a Click</h2><ul>${clicks}</ul></div>
    <div class="colophon">Compiled by ${esc(PROVIDER)} · ${esc(resolveModel())} · delivered via Gmail</div>
  </section>
  </body></html>`;
}
