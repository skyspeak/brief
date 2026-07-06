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
  const fromData = parsed.data?.error;
  if (typeof fromData === "string") {
    if (/guardrail|data policy|privacy/i.test(fromData)) {
      return (
        "OpenRouter blocked by privacy settings — Gemini is your primary; remove OPENROUTER_API_KEY " +
        "or adjust https://openrouter.ai/settings/privacy"
      );
    }
    if (/OpenRouter.*429|rate.?limit/i.test(fromData)) {
      return "OpenRouter rate limited — wait ~30s, then try again.";
    }
    if (/Gemini.*429|rate.?limit/i.test(fromData)) {
      return "Gemini rate limited — wait a minute and retry.";
    }
    return fromData;
  }
  const text = parsed.text || "";
  if (/429|rate.?limit/i.test(text)) {
    return "Rate limited — wait ~30s, then try again.";
  }
  if (/guardrail|data policy|privacy/i.test(text)) {
    return (
      "OpenRouter blocked by privacy settings — use Gemini only or adjust " +
      "https://openrouter.ai/settings/privacy"
    );
  }
  if (text.startsWith("An error") || /FUNCTION_INVOCATION_TIMEOUT|504|502/i.test(text)) {
    return "Server timed out — try again. Digests and briefings run in small batches; if this keeps happening, wait a minute and retry.";
  }
  return text.slice(0, 200) || `${fallback} (HTTP ${parsed.status})`;
}
