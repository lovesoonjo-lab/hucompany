import "dotenv/config";
import { refreshYoutubeChannelStats, syncYoutubeCatalog } from "../youtubeCatalogSync";

async function run() {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY is required");
  }

  const synced = await syncYoutubeCatalog({
    apiKey,
    maxResultsPerPair: 12,
  });
  console.log("[syncYoutubeChannels] full-sync:", synced);

  const refreshed = await refreshYoutubeChannelStats({
    apiKey,
    maxChannels: 500,
  });
  console.log("[syncYoutubeChannels] refresh-stats:", refreshed);
}

run().catch(error => {
  console.error("[syncYoutubeChannels] failed:", error);
  process.exitCode = 1;
});

