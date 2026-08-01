// app/api/ingest-rss/route.js — daily cron: pull RSS feeds into the emails corpus.
import {
  listActiveFeeds,
  insertRssItem,
  markFeedNotModified,
  markFeedOk,
  markFeedFailure,
} from "@/lib/db";
import { fetchFeed, mapLimit, itemTimestamp } from "@/lib/feed-fetch";
import { itemHash, canonicalUrl, stripHtml } from "@/lib/canonical";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WINDOW_DAYS = Number(process.env.RSS_WINDOW_DAYS || 2);
const CONCURRENCY = Number(process.env.RSS_CONCURRENCY || 6);

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret || url.searchParams.get("key") === secret;
}

export async function GET(req) {
  if (!authorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const cutoff = started - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const feeds = await listActiveFeeds();

  let inserted = 0;
  let skippedDuplicate = 0;
  let skippedStale = 0;
  const failures = [];

  await mapLimit(feeds, CONCURRENCY, async (feed) => {
    const result = await fetchFeed(feed);

    if (result.status === "not_modified") {
      await markFeedNotModified(feed.id);
      return;
    }

    if (result.status !== "ok") {
      failures.push({ feed: feed.name, status: result.status, error: result.error });
      await markFeedFailure(feed.id, result.status, result.error, feed.consecutive_failures || 0);
      return;
    }

    const cap = feed.max_items || 10;
    let taken = 0;

    for (const item of result.items) {
      if (taken >= cap) break;

      const ts = itemTimestamp(item);
      if (ts !== null && ts < cutoff) {
        skippedStale++;
        continue;
      }

      const url = canonicalUrl(item.link || item.guid);
      const title = (item.title || "").trim();
      if (!url && !title) continue;

      const hash = itemHash({ url, sourceName: feed.name, title });
      const body = stripHtml(
        item.contentEncoded ||
          item["content:encoded"] ||
          item.content ||
          item.contentSnippet ||
          item.summary ||
          ""
      );

      const ok = await insertRssItem({
        hash,
        sourceName: feed.name,
        title: title || null,
        url,
        body,
        receivedAtSec: Math.floor((ts ?? started) / 1000),
      });

      if (ok) {
        inserted++;
        taken++;
      } else {
        skippedDuplicate++;
      }
    }

    await markFeedOk(feed.id, result.etag, result.lastModified);
  });

  return Response.json({
    ok: true,
    feeds: feeds.length,
    inserted,
    skippedDuplicate,
    skippedStale,
    failures,
    ms: Date.now() - started,
  });
}

export const POST = GET;
