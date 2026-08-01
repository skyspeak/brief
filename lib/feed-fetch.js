import Parser from "rss-parser";

const parser = new Parser({
  timeout: 12_000,
  headers: { "User-Agent": USER_AGENT() },
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["dc:creator", "creator"],
    ],
  },
});

function USER_AGENT() {
  return (
    process.env.FEED_USER_AGENT ||
    "brief/1.0 (+personal digest; contact via site)"
  );
}

/**
 * Fetch and parse one feed with a hard timeout and conditional-GET support.
 *
 * Returns one of:
 *   { status: "ok", items, etag, lastModified }
 *   { status: "not_modified" }
 *   { status: "http_<code>" | "network_error" | "parse_error", error }
 *
 * Never throws. Callers loop over many feeds and one bad host should not take
 * the run down.
 */
export async function fetchFeed(feed, { timeoutMs = 15_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      "User-Agent": USER_AGENT(),
      Accept:
        "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
    };
    if (feed.etag) headers["If-None-Match"] = feed.etag;
    if (feed.last_modified) headers["If-Modified-Since"] = feed.last_modified;

    const res = await fetch(feed.feed_url, {
      headers,
      signal: controller.signal,
      redirect: "follow",
    });

    if (res.status === 304) return { status: "not_modified" };
    if (!res.ok) {
      return { status: `http_${res.status}`, error: res.statusText || "" };
    }

    const xml = await res.text();
    let parsed;
    try {
      parsed = await parser.parseString(xml);
    } catch (e) {
      return { status: "parse_error", error: String(e?.message || e).slice(0, 300) };
    }

    return {
      status: "ok",
      items: parsed.items || [],
      feedTitle: parsed.title || null,
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
    };
  } catch (e) {
    const msg = e?.name === "AbortError" ? "timeout" : String(e?.message || e);
    return { status: "network_error", error: msg.slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

/** Bounded-concurrency map. Keeps us polite and inside Vercel's exec window. */
export async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= list.length) return;
      out[i] = await fn(list[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Best-effort publication timestamp for a feed item. */
export function itemTimestamp(item) {
  const raw = item.isoDate || item.pubDate || item.published || item.updated;
  const ts = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(ts) ? ts : null;
}
