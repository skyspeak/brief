// lib/llm.js — provider chain: primary LLM, then optional fallback (gemini → openrouter).

const DEFAULT_MODEL = {
  claude: "claude-sonnet-4-6",
  gemini: "gemini-2.5-flash",
  openrouter: "openrouter/free",
};

export function getProviderChain() {
  const primary = process.env.LLM_PROVIDER || "gemini";

  // Default chain: gemini → openrouter (claude only when explicitly set via LLM_PROVIDER).
  let fallback = process.env.LLM_FALLBACK;
  if (fallback === undefined || fallback === "") {
    fallback = primary === "openrouter" ? null : "openrouter";
  }

  const chain = [primary];
  if (fallback && fallback !== primary) chain.push(fallback);
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
  // LLM_MODEL is the OpenRouter slug — only honor it when that provider is explicitly primary.
  if (process.env.LLM_MODEL && process.env.LLM_PROVIDER === provider) {
    return process.env.LLM_MODEL;
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

async function callGemini({ model, system, user, maxTokens, json }) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
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
        generationConfig: {
          maxOutputTokens: maxTokens,
          ...(json && { responseMimeType: "application/json" }),
        },
      }),
    }
  );
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
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

    throw new Error(`OpenRouter ${r.status}: ${text}`);
  }
}

async function callProvider(provider, { system, user, maxTokens, json, maxAttempts }) {
  const model = resolveModelFor(provider);
  if (provider === "claude") return callClaude({ model, system, user, maxTokens });
  if (provider === "gemini") return callGemini({ model, system, user, maxTokens, json });
  if (provider === "openrouter") {
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

export function llmEnvStatus() {
  const chain = getProviderChain();
  return {
    provider: chain[0],
    fallback: chain[1] || null,
    chain,
    ok: chain.some(providerReady),
  };
}

// Returns raw text. `json:true` nudges providers toward clean JSON output.
export async function callLLM({ system, user, maxTokens = 2400, json = false, maxAttempts }) {
  const chain = getProviderChain().filter(providerReady);
  if (chain.length === 0) {
    throw new Error("No LLM configured — set GEMINI_API_KEY (primary) and/or OPENROUTER_API_KEY (fallback)");
  }

  let lastErr;
  for (let i = 0; i < chain.length; i++) {
    const provider = chain[i];
    try {
      const text = await callProvider(provider, { system, user, maxTokens, json, maxAttempts });
      if (i > 0) console.warn(`[llm] primary failed; succeeded via fallback (${provider})`);
      return text;
    } catch (e) {
      lastErr = e;
      console.warn(`[llm] ${provider} failed: ${e.message}`);
      if (i < chain.length - 1) {
        console.warn(`[llm] trying fallback (${chain[i + 1]})`);
      }
    }
  }
  throw lastErr;
}

export function parseJson(txt) {
  const s = txt.indexOf("{");
  const e = txt.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("LLM returned no JSON:\n" + txt.slice(0, 400));
  return JSON.parse(txt.slice(s, e + 1));
}
