/** Parse fetch responses safely — Vercel timeouts return HTML, not JSON. */
export async function parseApiResponse(res) {
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text), text };
  } catch {
    return { ok: res.ok, status: res.status, data: null, text };
  }
}

export function apiError(parsed, fallback = "request failed") {
  if (parsed.data?.error) return parsed.data.error;
  const text = parsed.text || "";
  if (/429|rate.?limit/i.test(text)) {
    return "OpenRouter rate limited — wait ~30s, then click Summarize again.";
  }
  if (text.startsWith("An error")) {
    return "Server timed out — click Summarize again (runs 1 newsletter at a time).";
  }
  return text.slice(0, 200) || `${fallback} (HTTP ${parsed.status})`;
}
