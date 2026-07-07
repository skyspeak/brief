// lib/markdown.js — digest markdown → plain text or HTML email bodies.

const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function stripMarkdownInline(s = "") {
  return String(s)
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\*(.+?)\*/g, "$1");
}

/** Plain-text email body from digest markdown. */
export function markdownToPlainText(md, subtitle = "") {
  const lines = [];
  if (subtitle) lines.push(subtitle.toUpperCase(), "");

  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      lines.push("");
      continue;
    }
    if (line.startsWith("# ")) {
      lines.push(stripMarkdownInline(line.slice(2)), "");
    } else if (line.startsWith("## ")) {
      lines.push(stripMarkdownInline(line.slice(3)), "");
    } else if (line.startsWith("### ")) {
      lines.push(stripMarkdownInline(line.slice(4)), "");
    } else if (line.startsWith("---")) {
      lines.push("—".repeat(48), "");
    } else if (line.startsWith("- ")) {
      lines.push(`• ${stripMarkdownInline(line.slice(2))}`);
    } else {
      lines.push(stripMarkdownInline(line));
    }
  }

  lines.push("", "—", "Compiled by THE BRIEF");
  return lines.join("\n").trim();
}

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#8b2942">$1</a>');
}

const LENS_STYLES = {
  GM: "#4a5568",
  Sales: "#2b6cb0",
  Marketing: "#9b2c2c",
  Engineering: "#276749",
  Product: "#744210",
};

function lensBadge(text) {
  const m = text.match(/ · (GM|Sales|Marketing|Engineering|Product)$/);
  if (!m) return inline(text);
  const label = m[1];
  const rest = text.replace(/ · (GM|Sales|Marketing|Engineering|Product)$/, "");
  const color = LENS_STYLES[label] || "#6b6356";
  return `${inline(rest)} <span style="display:inline-block;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${color};border:1px solid ${color};border-radius:3px;padding:1px 6px;margin-left:4px">${label}</span>`;
}

export function markdownToEmailHtml(md, subtitle = "") {
  const lines = md.split("\n");
  const out = [];
  let inList = false;
  let cardNum = 0;

  const closeList = () => {
    if (inList) {
      out.push("</div>");
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
      out.push(
        `<h1 style="font-family:'Crimson Text',Georgia,serif;font-size:28px;font-weight:600;margin:0 0 4px;color:#1a1714;line-height:1.2">${inline(line.slice(2))}</h1>`
      );
    } else if (line.startsWith("## ")) {
      closeList();
      out.push(
        `<h2 style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#6b6356;margin:28px 0 10px">${inline(line.slice(3))}</h2>`
      );
    } else if (/^\d+\.\s\*\*/.test(line.trim())) {
      if (!inList) {
        out.push('<div style="margin:16px 0">');
        inList = true;
      }
      cardNum++;
      const body = line.trim().replace(/^\d+\.\s/, "");
      out.push(
        `<div style="margin-bottom:14px;padding:14px 16px;background:#faf7f0;border-left:3px solid #8b2942;border-radius:0 4px 4px 0">
<span style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;color:#8b2942;margin-right:8px">${cardNum}</span>
<span style="font-family:'Crimson Text',Georgia,serif;font-size:16px;line-height:1.45;color:#1a1714">${inline(body)}</span>
</div>`
      );
    } else if (line.startsWith("- ")) {
      if (!inList) {
        out.push('<ul style="margin:8px 0;padding-left:20px;line-height:1.55">');
        inList = true;
      }
      out.push(`<li style="margin-bottom:8px;font-family:'Crimson Text',Georgia,serif">${inline(line.slice(2))}</li>`);
    } else if (line.trim().startsWith("*") && line.trim().endsWith("*") && !line.includes("**")) {
      closeList();
      const inner = line.trim().slice(1, -1);
      const isFooter = inner.toLowerCase().includes("grounded in");
      out.push(
        `<p style="margin:${isFooter ? "24px" : "4px"} 0 0 ${isFooter ? "0" : "16px"};font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:${isFooter ? "12px" : "13px"};color:#6b6356;line-height:1.5;font-style:${isFooter ? "normal" : "italic"}">${lensBadge(inner)}</p>`
      );
    } else if (line.startsWith("---")) {
      closeList();
      out.push('<hr style="border:none;border-top:1px solid #e8e0d4;margin:24px 0">');
    } else {
      closeList();
      out.push(
        `<p style="margin:8px 0;font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.55;color:#3d3830">${inline(line)}</p>`
      );
    }
  }
  closeList();

  return `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"></head>
<body style="font-family:'Crimson Text',Georgia,serif;color:#1a1714;background:#f5f0e8;margin:0;padding:24px">
<div style="max-width:640px;margin:0 auto;background:#fff;padding:32px 28px;border:1px solid #e8e0d4;box-shadow:0 1px 3px rgba(0,0,0,.06)">
${subtitle ? `<div style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8b2942;margin-bottom:16px;font-weight:600">${esc(subtitle)}</div>` : ""}
${out.join("\n")}
<div style="margin-top:32px;padding-top:14px;border-top:1px solid #e8e0d4;font-size:11px;color:#9a9088;font-family:Inter,'Helvetica Neue',Arial,sans-serif">Compiled by THE BRIEF</div>
</div></body></html>`;
}

export function digestTitleFromMarkdown(md) {
  const m = md.match(/^#\s+(.+)$/m);
  if (!m) return "Digest";
  return m[1].replace(/^THE BRIEF\s*—\s*/i, "").trim() || "Digest";
}
