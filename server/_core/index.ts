import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { listYoutubeChannelsFromDb } from "../db";
import { refreshYoutubeChannelStats, syncYoutubeCatalog } from "../youtubeCatalogSync";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  // tRPC API
  app.get("/api/channels", async (req, res) => {
    try {
      const country = String(req.query.country ?? "KR").toUpperCase();
      const topic = String(req.query.topic ?? "shopping");
      const sortParam = String(req.query.sort ?? "subscribers");
      const sort =
        sortParam === "subscribers_asc" || sortParam === "subscribers-low"
          ? "subscribers_asc"
          : sortParam === "views" || sortParam === "views_desc"
            ? "views_desc"
            : "subscribers_desc";
      const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 24;

      const result = await listYoutubeChannelsFromDb({
        country,
        topic: topic as Parameters<typeof listYoutubeChannelsFromDb>[0]["topic"],
        sort,
        cursor,
        limit,
      });

      res.json({
        items: result.items.map(row => ({
          channelId: row.youtubeChannelId,
          title: row.title,
          thumbnails: row.thumbnailUrl,
          country: row.country,
          topic: row.topic,
          subscriberCount: row.subscriberCount,
          viewCount: row.viewCount,
          videoCount: row.videoCount,
          lastSyncedAt: row.lastSyncedAt,
        })),
        nextCursor: result.nextCursor,
      });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to load channels" });
    }
  });

  app.post("/api/admin/sync-channels", async (req, res) => {
    const token = process.env.ADMIN_SYNC_TOKEN?.trim();
    const authHeader = req.headers.authorization ?? "";
    if (token && authHeader !== `Bearer ${token}`) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const apiKey = process.env.YOUTUBE_API_KEY?.trim();
    if (!apiKey) {
      return res.status(400).json({ message: "YOUTUBE_API_KEY is required" });
    }
    try {
      const refreshOnly = req.query.refreshOnly === "1";
      if (refreshOnly) {
        const stats = await refreshYoutubeChannelStats({ apiKey, maxChannels: 500 });
        return res.json({ mode: "refresh-stats", ...stats });
      }
      const synced = await syncYoutubeCatalog({ apiKey, maxResultsPerPair: 12 });
      return res.json({ mode: "full-sync", ...synced });
    } catch (error) {
      return res.status(500).json({ message: error instanceof Error ? error.message : "Sync failed" });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
