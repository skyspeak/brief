// lib/llm.js — provider chain: primary LLM, optional fallback (default: gemini only).

const DEFAULT_MODEL = {
  claude: "claude-sonnet-4-6",
  gemini: "gemini-2.0-flash",
  openrouter: "openrouter/free",
};

/** Always-free OpenRouter route used when Gemini is overloaded / rate-limited. */
const OPENROUTER_FREE_MODEL =
  process.env.OPENROUTER_FREE_MODEL || DEFAULT_MODEL.openrouter;

function normalizeFallback(value, primary) {
  if (value && /^(none|off|false|no)$/i.test(value)) return null;
  if (value === undefined || value === "") return null;
  if (value === primary) return null;
  // Stale Vercel configs often leave LLM_FALLBACK=openrouter — require explicit opt-in.
  if (value === "openrouter" && process.env.LLM_ENABLE_OPENROUTER_FALLBACK !== "1") {
    return null;
  }
  return value;
}

export function getProviderChain() {
  const primary = process.env.LLM_PROVIDER || "gemini";
  const fallback = normalizeFallback(process.env.LLM_FALLBACK, primary);

  const chain = [primary];
  if (fallback) chain.push(fallback);
  return chain;
}

export const PROVIDER = getProviderChain()[0];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const LLM_FETCH_TIMEOUT_MS = Number(process.env.LLM_FETCH_TIMEOUT_MS || 45_000);

async function fetchWithTimeout(url, options = {}, timeoutMs = LLM_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error(`LLM request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function resolveModelFor(provider) {
  if (provider === "openrouter") {
    return process.env.LLM_MODEL || DEFAULT_MODEL.openrouter;
  }
  if (provider === "gemini" && process.env.GEMINI_MODEL) {
    return process.env.GEMINI_MODEL;
  }
  if (provider === "claude" && process.env.CLAUDE_MODEL) {
    return process.env.CLAUDE_MODEL;
  }
  const m = DEFAULT_MODEL[provider];
  if (!m) {
    throw new Error(
      `Unknown provider "${provider}" (use claude | gemini | openrouter)`
    );
  }
  return m;
}

/** @deprecated use resolveModelFor(PROVIDER) */
export function resolveModel() {
  return resolveModelFor(PROVIDER);
}

async function callClaude({ model, system, user, maxTokens }) {
  const r = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

function buildGeminiGenerationConfig(model, maxTokens, json, thinkingMode = "disable") {
  const config = {
    maxOutputTokens: maxTokens,
    ...(json && { responseMimeType: "application/json" }),
  };
  if (thinkingMode === "disable" && /gemini-2\.5|gemini-3/i.test(model)) {
    config.thinkingConfig = { thinkingBudget: 0 };
  }
  return config;
}

async function callGemini({ model, system, user, maxTokens, json, googleSearch = false }) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const attempt = async (tokens, thinkingMode) => {
    // JSON mime type is incompatible with Google Search grounding.
    const useJson = json && !googleSearch;
    const r = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: buildGeminiGenerationConfig(model, tokens, useJson, thinkingMode),
          ...(googleSearch ? { tools: [{ google_search: {} }] } : {}),
        }),
      }
    );
    if (!r.ok) {
      const errText = await r.text();
      const err = new Error(formatGeminiError(r.status, errText));
      err.geminiStatus = r.status;
      err.geminiBody = errText;
      throw err;
    }
    const d = await r.json();
    const candidate = d.candidates?.[0];
    const text = (candidate?.content?.parts || []).map((p) => p.text || "").join("");
    return { text, finishReason: candidate?.finishReason, promptFeedback: d.promptFeedback };
  };

  const attemptWithTransientRetry = async (tokens, thinkingMode) => {
    const maxTries = 3;
    let lastErr;
    for (let i = 1; i <= maxTries; i++) {
      try {
        return await attempt(tokens, thinkingMode);
      } catch (e) {
        lastErr = e;
        const transient = e.geminiStatus === 429 || e.geminiStatus === 503;
        if (!transient || i === maxTries) throw e;
        const waitMs = 1500 * i * i;
        console.warn(`[llm] Gemini ${e.geminiStatus}; retry ${i}/${maxTries - 1} in ${waitMs}ms`);
        await sleep(waitMs);
      }
    }
    throw lastErr;
  };

  let result;
  try {
    result = await attemptWithTransientRetry(maxTokens, "disable");
  } catch (e) {
    if (e.geminiStatus === 400 && /thinking/i.test(e.geminiBody || e.message)) {
      result = await attemptWithTransientRetry(maxTokens, "omit");
    } else {
      throw e;
    }
  }

  if (!result.text.trim() && result.finishReason === "MAX_TOKENS") {
    result = await attemptWithTransientRetry(Math.max(maxTokens, 16384), "disable").catch(() =>
      attemptWithTransientRetry(Math.max(maxTokens, 16384), "omit")
    );
  }

  if (!result.text.trim()) {
    const reason =
      result.finishReason ||
      result.promptFeedback?.blockReason ||
      (result.promptFeedback?.safetyRatings?.length ? "safety" : "empty");
    throw new Error(
      `Gemini returned no content (${reason}) — try GEMINI_MODEL=gemini-2.0-flash in Vercel.`
    );
  }
  return result.text;
}

function formatGeminiError(status, text) {
  if (status === 429) return "Gemini rate limited — wait a minute and retry.";
  if (status === 503 || /high demand|UNAVAILABLE/i.test(text)) {
    return "Gemini overloaded (high demand) — retrying / falling back.";
  }
  if (status === 403) return "Gemini API key invalid or lacks permission — check GEMINI_API_KEY in Vercel.";
  if (status === 400 && /token|too long|max/i.test(text)) {
    return "Gemini input too large — reduce DIGEST_BATCH_SIZE or DIGEST_NEWSLETTER_CHARS.";
  }
  return `Gemini ${status}: ${text.slice(0, 300)}`;
}

async function callOpenRouter({ model, system, user, maxTokens, json, maxAttempts = 4 }) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not set");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        ...(json && { response_format: { type: "json_object" } }),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (r.ok) {
      const d = await r.json();
      return d.choices?.[0]?.message?.content || "";
    }

    const text = await r.text();
    if (r.status === 429 && attempt < maxAttempts) {
      let waitMs = 5000;
      try {
        const err = JSON.parse(text);
        const sec = err?.error?.metadata?.retry_after_seconds;
        if (sec) waitMs = Math.ceil(sec * 1000) + 500;
      } catch {
        const retryAfter = r.headers.get("retry-after");
        if (retryAfter) waitMs = Math.ceil(Number(retryAfter) * 1000) + 500;
      }
      await sleep(waitMs);
      continue;
    }

    throw new Error(formatOpenRouterError(r.status, text));
  }
}

function formatOpenRouterError(status, text) {
  if (status === 404 && /guardrail|data policy|privacy/i.test(text)) {
    return (
      "OpenRouter blocked by your privacy/guardrail settings (no matching models). " +
      "Loosen settings at https://openrouter.ai/settings/privacy " +
      "or wait for Gemini to recover."
    );
  }
  if (status === 402) {
    return (
      "OpenRouter needs free-model access (402). Set LLM_MODEL to a :free model " +
      "(e.g. openrouter/free), or add a small credit balance / verify phone at " +
      "https://openrouter.ai/settings/credits — free routes often require that now."
    );
  }
  if (status === 429) return `OpenRouter rate limited — wait ~30s, then try again. (${text.slice(0, 120)})`;
  return `OpenRouter ${status}: ${text}`;
}

async function callProvider(provider, { system, user, maxTokens, json, maxAttempts, googleSearch, model: modelOverride }) {
  const model = modelOverride || resolveModelFor(provider);
  if (provider === "claude") return callClaude({ model, system, user, maxTokens });
  if (provider === "gemini") {
    return callGemini({ model, system, user, maxTokens, json, googleSearch });
  }
  if (provider === "openrouter") {
    if (googleSearch) {
      throw new Error("Google Search grounding requires Gemini (set LLM_PROVIDER=gemini)");
    }
    return callOpenRouter({ model, system, user, maxTokens, json, maxAttempts });
  }
  throw new Error(`Unknown LLM provider "${provider}"`);
}

function providerReady(provider) {
  if (provider === "claude") return !!process.env.ANTHROPIC_API_KEY;
  if (provider === "gemini") return !!process.env.GEMINI_API_KEY;
  if (provider === "openrouter") return !!process.env.OPENROUTER_API_KEY;
  return false;
}

function isGeminiTransient(err) {
  if (!err) return false;
  if (err.geminiStatus === 429 || err.geminiStatus === 503) return true;
  return /Gemini.*(429|503)|Gemini rate limited|Gemini overloaded|high demand|UNAVAILABLE/i.test(
    err.message || ""
  );
}

async function callOpenRouterFree({ system, user, maxTokens, json, maxAttempts }) {
  // Cap tokens so free-tier accounts are less likely to trip credit checks.
  const tokens = Math.min(maxTokens || 2400, 2048);
  return callOpenRouter({
    model: OPENROUTER_FREE_MODEL,
    system,
    user,
    maxTokens: tokens,
    json,
    maxAttempts,
  });
}

export function llmEnvStatus() {
  const chain = getProviderChain();
  const active = chain.filter(providerReady);
  return {
    provider: chain[0],
    fallback: chain[1] || null,
    chain,
    active_chain: active,
    gemini_configured: providerReady("gemini"),
    openrouter_configured: providerReady("openrouter"),
    ok: active.length > 0,
  };
}

// Returns raw text. `json:true` nudges providers toward clean JSON output.
// `googleSearch:true` enables Gemini Google Search grounding (Gemini only).
// On Gemini 429/503, automatically tries OpenRouter free if OPENROUTER_API_KEY is set.
export async function callLLM({
  system,
  user,
  maxTokens = 2400,
  json = false,
  maxAttempts,
  googleSearch = false,
  model,
}) {
  const chain = (googleSearch ? ["gemini"] : getProviderChain()).filter(providerReady);
  if (chain.length === 0) {
    const wanted = googleSearch ? ["gemini"] : getProviderChain();
    throw new Error(
      `No LLM configured — set GEMINI_API_KEY in Vercel (wanted chain: ${wanted.join(" → ")}). ` +
        "OpenRouter fallback is off unless LLM_ENABLE_OPENROUTER_FALLBACK=1."
    );
  }

  let lastErr;
  let primaryErr;
  let triedOpenRouter = false;
  for (let i = 0; i < chain.length; i++) {
    const provider = chain[i];
    try {
      const text = await callProvider(provider, {
        system,
        user,
        maxTokens,
        json,
        maxAttempts,
        googleSearch: provider === "gemini" ? googleSearch : false,
        // Transient Gemini outages should hit a free OpenRouter route, not a paid LLM_MODEL.
        model:
          provider === "gemini"
            ? model
            : provider === "openrouter" && isGeminiTransient(primaryErr)
              ? OPENROUTER_FREE_MODEL
              : undefined,
      });
      if (i > 0) console.warn(`[llm] primary failed; succeeded via fallback (${provider})`);
      return text;
    } catch (e) {
      lastErr = e;
      if (i === 0) primaryErr = e;
      if (provider === "openrouter") triedOpenRouter = true;
      console.warn(`[llm] ${provider} failed: ${e.message}`);
      if (i < chain.length - 1) {
        console.warn(`[llm] trying fallback (${chain[i + 1]})`);
      }
    }
  }

  // Gemini 429/503 → free OpenRouter model when the chain didn't already try OpenRouter
  // (e.g. search-only Gemini path, or LLM_FALLBACK unset).
  if (isGeminiTransient(primaryErr || lastErr) && providerReady("openrouter") && !triedOpenRouter) {
    console.warn(
      `[llm] Gemini transient; falling back to OpenRouter free (${OPENROUTER_FREE_MODEL})` +
        (googleSearch ? " without Google Search grounding" : "")
    );
    try {
      return await callOpenRouterFree({ system, user, maxTokens, json, maxAttempts });
    } catch (e) {
      console.warn(`[llm] openrouter free fallback failed: ${e.message}`);
      throw new Error(
        `${(primaryErr || lastErr).message} (OpenRouter free fallback also failed: ${e.message})`
      );
    }
  }

  if (primaryErr && chain.length > 1 && lastErr !== primaryErr) {
    const fb = chain[1];
    throw new Error(`${primaryErr.message} (${fb} fallback also failed: ${lastErr.message})`);
  }
  throw lastErr;
}

export function parseJson(txt) {
  const s = txt.indexOf("{");
  if (s === -1) throw new Error("LLM returned no JSON:\n" + txt.slice(0, 400));
  const e = txt.lastIndexOf("}");
  if (e === -1 || e < s) {
    throw new Error("LLM returned truncated JSON:\n" + txt.slice(0, 400));
  }
  try {
    return JSON.parse(txt.slice(s, e + 1));
  } catch (err) {
    throw new Error(`LLM returned invalid JSON: ${err.message}\n${txt.slice(s, s + 400)}`);
  }
}
