/**
 * Krea API client.
 *
 * Implements the public Krea AI HTTP contract documented at
 * https://docs.krea.ai/api-reference. All endpoints follow the same async job
 * pattern: POST returns `{ job_id, status }`, then we poll
 * `GET /jobs/{id}` until `status === "completed"` and the `result.urls[0]` is
 * the generated asset URL.
 *
 * Used by `server/pipeline.ts`. When the user has not configured a Krea API
 * key, the pipeline falls back to the built-in image helper (`generateImage`)
 * for image generation and to a poster-only video stub. When a key IS present,
 * the pipeline calls into this module which performs real HTTP calls.
 */
import type { ImageModelId, VideoModelId } from "@shared/catalog";

const BASE_URL = "https://api.krea.ai";

/** Mapping from our internal model ids to Krea API endpoint paths. */
const IMAGE_ENDPOINTS: Record<ImageModelId, string> = {
  "Krea 1": "/generate/image/bfl/flux-1-dev", // Krea 1 is served by Krea-tuned Flux dev
  "Flux": "/generate/image/bfl/flux-1-dev",
  "Flux Kontext": "/generate/image/bfl/flux-kontext",
  "Nano Banana Pro": "/generate/image/google/nano-banana-pro",
  "ChatGPT Image": "/generate/image/openai/chatgpt-image",
  "Seedream 4": "/generate/image/bytedance/seedream-4",
  "Imagen 4": "/generate/image/google/imagen-4",
  "Ideogram 3.0": "/generate/image/ideogram/ideogram-3.0",
};

const VIDEO_ENDPOINTS: Record<VideoModelId, string> = {
  "Veo 3.1": "/generate/video/google/veo-3.1",
  "Kling 2.6": "/generate/video/kling/kling-2.6",
  "Hailuo 2.3": "/generate/video/minimax/hailuo-2.3",
  "Hailuo 2.3 Fast": "/generate/video/minimax/hailuo-2.3-fast",
  "Seedance 2.0": "/generate/video/bytedance/seedance-2.0",
  "Wan 2.5": "/generate/video/alibaba/wan-2.5",
};

const TOPAZ_ENDPOINT = "/generate/image/topaz/topaz-generative";

interface JobResponse {
  job_id: string;
  status:
    | "backlogged"
    | "queued"
    | "scheduled"
    | "processing"
    | "sampling"
    | "intermediate-complete"
    | "completed"
    | "failed"
    | "cancelled";
  created_at: string;
  completed_at?: string | null;
  result?: { urls?: string[] } | null;
}

export class KreaApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    message?: string,
  ) {
    super(message ?? `Krea API error ${status}: ${body.slice(0, 200)}`);
    this.name = "KreaApiError";
  }
}

async function postJob(apiKey: string, path: string, body: unknown): Promise<string> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new KreaApiError(res.status, text);
  let parsed: JobResponse;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new KreaApiError(res.status, text, "Invalid JSON from Krea API");
  }
  return parsed.job_id;
}

async function pollJob(
  apiKey: string,
  jobId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<string> {
  const intervalMs = opts.intervalMs ?? 4000;
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;
  // Avoid infinite loop in tests by capping max iterations as well.
  const maxIter = Math.ceil(timeoutMs / intervalMs) + 2;
  let i = 0;
  while (Date.now() < deadline && i++ < maxIter) {
    const res = await fetch(`${BASE_URL}/jobs/${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const text = await res.text();
    if (!res.ok) throw new KreaApiError(res.status, text);
    const job = JSON.parse(text) as JobResponse;
    if (job.status === "completed") {
      const url = job.result?.urls?.[0];
      if (!url) throw new Error("Krea job completed without an output URL");
      return url;
    }
    if (job.status === "failed" || job.status === "cancelled") {
      throw new Error(`Krea job ${jobId} ${job.status}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Krea job ${jobId} timed out after ${timeoutMs}ms`);
}

export interface GenerateImageParams {
  apiKey: string;
  model: ImageModelId;
  prompt: string;
  /** Optional aspect-ratio hint translated to width/height. */
  aspectRatio?: "9:16" | "16:9" | "1:1";
  /** Optional reference image URLs (e.g. uploaded product photos). */
  referenceImageUrls?: string[];
  /** Polling overrides (mainly used by tests). */
  pollInterval?: number;
  pollTimeout?: number;
}

function dimsFor(aspect?: "9:16" | "16:9" | "1:1"): { width: number; height: number } {
  switch (aspect) {
    case "9:16":
      return { width: 768, height: 1344 };
    case "16:9":
      return { width: 1344, height: 768 };
    case "1:1":
    default:
      return { width: 1024, height: 1024 };
  }
}

/** Generates a single image using the Krea API. Returns the asset URL. */
export async function kreaGenerateImage(p: GenerateImageParams): Promise<string> {
  const path = IMAGE_ENDPOINTS[p.model];
  if (!path) throw new Error(`Unsupported image model: ${p.model}`);
  const { width, height } = dimsFor(p.aspectRatio);
  const body: Record<string, unknown> = {
    prompt: p.prompt.slice(0, 1800),
    width,
    height,
  };
  if (p.referenceImageUrls && p.referenceImageUrls.length > 0) {
    body.styleImages = p.referenceImageUrls.map((url) => ({ url }));
  }
  const jobId = await postJob(p.apiKey, path, body);
  return pollJob(p.apiKey, jobId, { intervalMs: p.pollInterval, timeoutMs: p.pollTimeout });
}

export interface GenerateVideoParams {
  apiKey: string;
  model: VideoModelId;
  prompt: string;
  startImageUrl: string;
  /** Clip duration in seconds (4–12). Defaults to 8. */
  duration?: number;
  aspectRatio?: "9:16" | "16:9";
  pollInterval?: number;
  pollTimeout?: number;
}

/** Generates a video clip from a start image. Returns the asset URL. */
export async function kreaGenerateVideo(p: GenerateVideoParams): Promise<string> {
  const path = VIDEO_ENDPOINTS[p.model];
  if (!path) throw new Error(`Unsupported video model: ${p.model}`);
  const body: Record<string, unknown> = {
    prompt: p.prompt.slice(0, 1800),
    startImage: p.startImageUrl,
    aspectRatio: p.aspectRatio ?? "9:16",
    duration: Math.max(4, Math.min(12, p.duration ?? 8)),
  };
  const jobId = await postJob(p.apiKey, path, body);
  return pollJob(p.apiKey, jobId, { intervalMs: p.pollInterval, timeoutMs: p.pollTimeout });
}

export interface UpscaleParams {
  apiKey: string;
  imageUrl: string;
  pollInterval?: number;
  pollTimeout?: number;
}

/** Runs Topaz Generative upscale on an image. Returns the upscaled asset URL. */
export async function kreaTopazUpscale(p: UpscaleParams): Promise<string> {
  const body = { imageUrl: p.imageUrl };
  const jobId = await postJob(p.apiKey, TOPAZ_ENDPOINT, body);
  return pollJob(p.apiKey, jobId, { intervalMs: p.pollInterval, timeoutMs: p.pollTimeout });
}
