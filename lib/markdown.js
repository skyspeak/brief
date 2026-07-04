// lib/markdown.js — minimal markdown → email-safe HTML.
const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export function markdownToEmailHtml(md, subtitle = "") {
  const lines = md.split("\n");
  const out = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    if (line.startsWith("# ")) {
      closeList();
      out.push(`<h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 8px">${inline(line.slice(2))}</h1>`);
    } else if (line.startsWith("## ")) {
      closeList();
      out.push(`<h2 style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:16px;margin:24px 0 8px;border-bottom:2px solid #1a1714;padding-bottom:4px">${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith("### ")) {
      closeList();
      out.push(`<h3 style="font-size:14px;margin:16px 0 6px">${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith("- ")) {
      if (!inList) {
        out.push('<ul style="margin:8px 0;padding-left:20px;line-height:1.55">');
        inList = true;
      }
      out.push(`<li style="margin-bottom:8px">${inline(line.slice(2))}</li>`);
    } else {
      closeList();
      out.push(`<p style="margin:8px 0;line-height:1.55">${inline(line)}</p>`);
    }
  }
  closeList();

  return `<!doctype html><html><body style="font-family:Georgia,serif;color:#1a1714;background:#faf7f0;margin:0;padding:24px">
<div style="max-width:640px;margin:0 auto;background:#fff;padding:28px;border:1px solid #c9bfae">
${subtitle ? `<div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6b6356;margin-bottom:12px">${esc(subtitle)}</div>` : ""}
${out.join("\n")}
<div style="margin-top:28px;padding-top:12px;border-top:1px solid #c9bfae;font-size:11px;color:#6b6356;font-family:'Helvetica Neue',Arial,sans-serif">Compiled by THE BRIEF</div>
</div></body></html>`;
}

export function digestTitleFromMarkdown(md) {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "Digest";
}
