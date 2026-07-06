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
    return "OpenRouter rate limited — wait ~30s, then try again.";
  }
  if (text.startsWith("An error") || /FUNCTION_INVOCATION_TIMEOUT|504|502/i.test(text)) {
    return "Server timed out — try again. Digests and briefings run in small batches; if this keeps happening, wait a minute and retry.";
  }
  return text.slice(0, 200) || `${fallback} (HTTP ${parsed.status})`;
}
