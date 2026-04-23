/**
 * Upload-Post API client.
 *
 * Implements the public Upload-Post HTTP contract documented at
 * https://docs.upload-post.com/api/upload-video/. The endpoint accepts a
 * `multipart/form-data` POST with `Authorization: Apikey <token>`. We use the
 * URL form (passing a remote `video` URL string) so we do not need to stream
 * the file from the sandbox.
 *
 * Used by `server/routers.ts > uploads.run`. When the user has not configured
 * an Upload-Post API key, the router falls back to the local simulation that
 * just transitions DB rows through queued → uploading → posted.
 */
import type { PlatformId } from "@shared/catalog";

const ENDPOINT = "https://api.upload-post.com/api/upload";

const PLATFORM_MAP: Record<PlatformId, string> = {
  TikTok: "tiktok",
  Instagram: "instagram",
  YouTube: "youtube",
  Facebook: "facebook",
};

export interface UploadParams {
  apiKey: string;
  /** Upload-Post connected user identifier (configured in their dashboard). */
  user: string;
  platforms: PlatformId[];
  videoUrl: string;
  title?: string;
  description?: string;
}

export interface UploadResult {
  success: boolean;
  results?: Record<string, unknown>;
  message?: string;
  /** Raw upstream response for debugging. */
  raw?: unknown;
}

export class UploadPostError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    message?: string,
  ) {
    super(message ?? `Upload-Post error ${status}: ${body.slice(0, 200)}`);
    this.name = "UploadPostError";
  }
}

/** Posts a video to the requested social platforms via Upload-Post. */
export async function uploadPostVideo(p: UploadParams): Promise<UploadResult> {
  if (p.platforms.length === 0) {
    throw new Error("At least one platform is required");
  }
  const form = new FormData();
  form.set("user", p.user);
  for (const platform of p.platforms) {
    const mapped = PLATFORM_MAP[platform];
    if (mapped) form.append("platform[]", mapped);
  }
  form.set("video", p.videoUrl);
  if (p.title) form.set("title", p.title);
  if (p.description) form.set("description", p.description);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Apikey ${p.apiKey}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new UploadPostError(res.status, text);
  let parsed: UploadResult;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UploadPostError(res.status, text, "Invalid JSON from Upload-Post");
  }
  parsed.raw = parsed.raw ?? parsed;
  return parsed;
}
