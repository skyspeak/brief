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
  if (parsed.text?.startsWith("An error")) {
    return "Server timed out or crashed — try again (summarize runs 3 at a time).";
  }
  return parsed.text?.slice(0, 200) || `${fallback} (HTTP ${parsed.status})`;
}
