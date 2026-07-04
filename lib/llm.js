// lib/llm.js — one interface, three providers (claude | gemini | openrouter)

export const PROVIDER = process.env.LLM_PROVIDER || "claude";

const DEFAULT_MODEL = {
  claude: "claude-sonnet-4-6",
  gemini: "gemini-2.5-flash",
  openrouter: null, // slugs drift — caller must set LLM_MODEL
};

export function resolveModel() {
  if (process.env.LLM_MODEL) return process.env.LLM_MODEL;
  const m = DEFAULT_MODEL[PROVIDER];
  if (!m)
    throw new Error(
      `Set LLM_MODEL for provider "${PROVIDER}" (e.g. anthropic/claude-sonnet-4.5 or google/gemini-3.5-flash — see openrouter.ai/models)`
    );
  return m;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openRouterChat({ model, system, user, maxTokens, json, maxAttempts = 4 }) {

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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

// Returns raw text. `json:true` nudges providers toward clean JSON output.
export async function callLLM({ system, user, maxTokens = 2400, json = false, maxAttempts }) {
  const model = resolveModel();

  if (PROVIDER === "claude") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
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

  if (PROVIDER === "gemini") {
    const r = await fetch(
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

  if (PROVIDER === "openrouter") {
    return openRouterChat({ model, system, user, maxTokens, json, maxAttempts });
  }

  throw new Error(`Unknown LLM_PROVIDER "${PROVIDER}" (use claude | gemini | openrouter)`);
}

export function parseJson(txt) {
  const s = txt.indexOf("{");
  const e = txt.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("LLM returned no JSON:\n" + txt.slice(0, 400));
  return JSON.parse(txt.slice(s, e + 1));
}
