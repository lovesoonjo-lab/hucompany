import type { Express } from "express";
import { ENV } from "./env";
import path from "node:path";
import { access } from "node:fs/promises";

const LOCAL_STORAGE_ROOT = path.resolve(process.cwd(), ".local-storage");

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as unknown as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      const safeKey = key.replace(/\.\./g, "").replace(/^\/+/, "");
      const localPath = path.join(LOCAL_STORAGE_ROOT, safeKey);
      try {
        await access(localPath);
        res.set("Cache-Control", "no-store");
        res.sendFile(localPath);
        return;
      } catch {
        res.status(404).send("Local storage file not found");
        return;
      }
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
