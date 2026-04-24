import { InsertYoutubeChannel } from "../drizzle/schema";
import {
  listYoutubeChannelsForStatsRefresh,
  updateYoutubeChannelStats,
  upsertYoutubeChannels,
  YoutubeTopic,
} from "./db";

const COUNTRIES = ["KR", "US", "AU", "CA", "NZ", "MX", "CN", "JP", "IN", "ID", "VN"] as const;
const TOPICS: YoutubeTopic[] = [
  "shopping",
  "news",
  "info",
  "psychology",
  "economics",
  "beauty",
  "cooking",
  "tech",
  "music",
  "vlog",
  "animation",
  "kids",
];

const TOPIC_QUERY: Record<YoutubeTopic, string> = {
  shopping: "shopping haul review unboxing",
  news: "news current affairs",
  info: "knowledge documentary explain",
  psychology: "psychology mind behavior",
  economics: "economics finance market",
  beauty: "beauty makeup skincare",
  cooking: "cooking recipe food",
  tech: "tech gadget review",
  music: "music cover live",
  vlog: "vlog daily life",
  animation: "animation cartoon anime",
  kids: "kids family children",
};

type YouTubeErrorPayload = { error?: { message?: string; errors?: Array<{ reason?: string; message?: string }> } };

function isQuotaExceeded(payload: YouTubeErrorPayload): boolean {
  const message = payload.error?.message?.toLowerCase() ?? "";
  const reason = payload.error?.errors?.[0]?.reason?.toLowerCase() ?? "";
  return message.includes("quota") || reason.includes("quota") || reason.includes("dailylimitexceeded");
}

async function fetchJson(url: URL) {
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & YouTubeErrorPayload;
  if (!res.ok) {
    const message = json.error?.message ?? "YouTube API request failed";
    const err = new Error(message);
    (err as Error & { quotaExceeded?: boolean }).quotaExceeded = isQuotaExceeded(json);
    throw err;
  }
  return json;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

export async function syncYoutubeCatalog(input: {
  apiKey: string;
  countries?: string[];
  topics?: YoutubeTopic[];
  maxResultsPerPair?: number;
}) {
  const countries = (input.countries?.length ? input.countries : [...COUNTRIES]) as string[];
  const topics = input.topics?.length ? input.topics : TOPICS;
  const maxResults = Math.min(Math.max(input.maxResultsPerPair ?? 12, 1), 25);

  const discovered = new Map<string, { country: string; topic: YoutubeTopic }>();
  let quotaExceeded = false;
  let searchCalls = 0;
  let channelCalls = 0;

  for (const country of countries) {
    for (const topic of topics) {
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("type", "channel");
      url.searchParams.set("order", "relevance");
      url.searchParams.set("regionCode", country);
      url.searchParams.set("q", TOPIC_QUERY[topic]);
      url.searchParams.set("maxResults", String(maxResults));
      url.searchParams.set("key", input.apiKey);

      try {
        const json = (await fetchJson(url)) as {
          items?: Array<{ id?: { channelId?: string } }>;
        };
        searchCalls += 1;
        for (const item of json.items ?? []) {
          const channelId = item.id?.channelId;
          if (!channelId || discovered.has(channelId)) continue;
          discovered.set(channelId, { country, topic });
        }
      } catch (error) {
        const quota = (error as Error & { quotaExceeded?: boolean }).quotaExceeded === true;
        if (quota) {
          console.warn("[youtube-sync] quotaExceeded while searching channels");
          quotaExceeded = true;
          break;
        }
        console.warn("[youtube-sync] search failed:", error);
      }
    }
    if (quotaExceeded) break;
  }

  const discoveredIds = Array.from(discovered.keys());
  const upserts: InsertYoutubeChannel[] = [];
  for (const batch of chunk(discoveredIds, 50)) {
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("part", "snippet,statistics,brandingSettings");
    url.searchParams.set("id", batch.join(","));
    url.searchParams.set("key", input.apiKey);
    try {
      const json = (await fetchJson(url)) as {
        items?: Array<{
          id?: string;
          snippet?: { title?: string; description?: string; thumbnails?: { high?: { url?: string }; default?: { url?: string } } };
          brandingSettings?: { channel?: { country?: string } };
          statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
        }>;
      };
      channelCalls += 1;
      for (const item of json.items ?? []) {
        const channelId = item.id ?? "";
        if (!channelId) continue;
        const meta = discovered.get(channelId);
        if (!meta) continue;
        upserts.push({
          youtubeChannelId: channelId,
          title: item.snippet?.title ?? "Unknown channel",
          description: item.snippet?.description ?? "",
          thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url ?? "",
          country: item.brandingSettings?.channel?.country ?? meta.country,
          topic: meta.topic,
          subscriberCount: Number(item.statistics?.subscriberCount ?? 0),
          viewCount: Number(item.statistics?.viewCount ?? 0),
          videoCount: Number(item.statistics?.videoCount ?? 0),
          lastSyncedAt: new Date(),
        });
      }
    } catch (error) {
      const quota = (error as Error & { quotaExceeded?: boolean }).quotaExceeded === true;
      if (quota) {
        console.warn("[youtube-sync] quotaExceeded while fetching channel stats");
        quotaExceeded = true;
        break;
      }
      console.warn("[youtube-sync] channels.list failed:", error);
    }
  }

  if (upserts.length > 0) {
    await upsertYoutubeChannels(upserts);
  }

  return {
    discoveredCount: discoveredIds.length,
    upsertedCount: upserts.length,
    quotaExceeded,
    searchCalls,
    channelCalls,
  };
}

export async function refreshYoutubeChannelStats(input: { apiKey: string; maxChannels?: number }) {
  const rows = await listYoutubeChannelsForStatsRefresh(input.maxChannels ?? 300);
  const channelIds = rows.map(row => row.youtubeChannelId);
  if (!channelIds.length) return { updatedCount: 0, quotaExceeded: false };

  let quotaExceeded = false;
  let updatedCount = 0;

  for (const batch of chunk(channelIds, 50)) {
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("part", "statistics");
    url.searchParams.set("id", batch.join(","));
    url.searchParams.set("key", input.apiKey);
    try {
      const json = (await fetchJson(url)) as {
        items?: Array<{ id?: string; statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string } }>;
      };
      const updates = (json.items ?? [])
        .filter(item => !!item.id)
        .map(item => ({
          youtubeChannelId: item.id as string,
          subscriberCount: Number(item.statistics?.subscriberCount ?? 0),
          viewCount: Number(item.statistics?.viewCount ?? 0),
          videoCount: Number(item.statistics?.videoCount ?? 0),
        }));
      await updateYoutubeChannelStats(updates);
      updatedCount += updates.length;
    } catch (error) {
      const quota = (error as Error & { quotaExceeded?: boolean }).quotaExceeded === true;
      if (quota) {
        console.warn("[youtube-sync] quotaExceeded while refreshing stats");
        quotaExceeded = true;
        break;
      }
      console.warn("[youtube-sync] refresh stats failed:", error);
    }
  }

  return { updatedCount, quotaExceeded };
}

