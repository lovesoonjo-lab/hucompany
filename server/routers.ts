import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import sharp from "sharp";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createAsset,
  createProject,
  createScene,
  createUpload,
  deleteAsset,
  deleteProject,
  deleteScenesByProject,
  getProject,
  getScene,
  getUserSettings,
  listAssets,
  listProjects,
  getUpload,
  listScenes,
  listUploads,
  updateProject,
  updateScene,
  updateUpload,
  upsertUserSettings,
  listYoutubeChannelsFromDb,
} from "./db";
import {
  analyzeScript,
  generateImagePrompt,
  generateSceneImage,
  generateSceneVideo,
  upscaleSceneImage,
} from "./pipeline";
import { storagePut } from "./storage";
import { verifyGcsCredentials } from "./gcsClient";
import { uploadPostVideo, UploadPostError } from "./uploadPostClient";
import { refreshYoutubeChannelStats, syncYoutubeCatalog } from "./youtubeCatalogSync";

const aspectRatioSchema = z.enum(["9:16", "16:9", "1:1"]);

const imageModelSchema = z.enum([
  "Krea 1",
  "Nano Banana Pro",
  "Nano Banana 2",
  "Flux",
  "ChatGPT Image",
  "Seedream 4",
  "Imagen 4",
  "Ideogram 3.0",
  "Flux Kontext",
]);

const videoModelSchema = z.enum([
  "Veo 3.1",
  "Kling 2.6",
  "Hailuo 2.3",
  "Seedance 2.0",
  "Wan 2.5",
  "Hailuo 2.3 Fast",
]);

const activeAnalyzeProjects = new Set<number>();
const canceledAnalyzeProjects = new Set<number>();

const platformSchema = z.enum(["TikTok", "Instagram", "YouTube", "Facebook"]);
const youtubeRegionSchema = z.enum(["KR", "US", "AU", "CA", "NZ", "MX", "CN", "JP", "IN", "ID", "VN"]);
const youtubeChannelCategorySchema = z.enum([
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
]);

type YoutubeChannelItem = {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  country: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  channelUrl: string;
};

function scoreChannelByCategory(
  text: string,
  keywords: string[],
  antiKeywords: string[] = [],
): number {
  const normalized = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (!kw) continue;
    if (normalized.includes(kw.toLowerCase())) score += 2;
  }
  for (const kw of antiKeywords) {
    if (!kw) continue;
    if (normalized.includes(kw.toLowerCase())) score -= 1;
  }
  return score;
}

type YoutubeApiErrorPayload = {
  message?: string;
  errors?: Array<{ reason?: string; message?: string }>;
};

function attachVideoActionLine(
  prompt: string,
  scene: { scriptExcerpt?: string | null; visualElements?: { actions?: string[] } | null },
): string {
  const trimmed = (prompt ?? "").trim();
  if (!trimmed) return trimmed;
  if (/video\s*action\s*:/i.test(trimmed)) return trimmed;

  const actions = scene.visualElements?.actions?.filter(Boolean) ?? [];
  const actionText = actions.join(", ").trim() || (scene.scriptExcerpt ?? "").trim();
  if (!actionText) return trimmed;

  return `${trimmed}\nVideo Action: ${actionText}`;
}

function extractSceneImagePromptFromScript(script: string, sceneIndex: number): string {
  const lines = script.split(/\r?\n/);
  let currentScene: number | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const sceneMatch = line.match(/(?:Scene|씬)\s*(\d+)/i);
    if (sceneMatch) {
      currentScene = Number(sceneMatch[1]);
      continue;
    }

    if (currentScene !== sceneIndex) continue;
    const promptMatch = line.match(
      /^(?:[-*]\s*)?(?:\d+\.\s*)?(?:📸\s*)?(?:Image Prompt|이미지 프롬프트)\s*:\s*(.+)$/i
    );
    if (promptMatch?.[1]) return promptMatch[1].trim();
  }

  return "";
}

function toFriendlyYoutubeError(error: YoutubeApiErrorPayload | undefined, fallback: string): string {
  const raw = (error?.message ?? fallback).replace(/<[^>]*>/g, "").trim();
  const reason = error?.errors?.[0]?.reason ?? "";
  const normalized = `${reason} ${raw}`.toLowerCase();

  if (normalized.includes("quota") || normalized.includes("dailylimitexceeded")) {
    return "YouTube API 일일 사용량(쿼터)을 초과했습니다. 잠시 후 다시 시도하거나 Google Cloud에서 YouTube Data API 쿼터를 늘려주세요.";
  }
  if (normalized.includes("apikey") || normalized.includes("keyinvalid") || normalized.includes("forbidden")) {
    return "YouTube API 키가 유효하지 않거나 권한이 없습니다. 설정의 YouTube API key를 다시 확인해주세요.";
  }

  return raw || fallback;
}

async function listYoutubeChannelsByRegion(_params: {
  apiKey: string;
  regionCode: z.infer<typeof youtubeRegionSchema>;
  category: z.infer<typeof youtubeChannelCategorySchema>;
  maxResults?: number;
  pageToken?: string;
}): Promise<{ channels: YoutubeChannelItem[]; nextPageToken: string | null }> {
  // Deprecated: runtime queries now read from DB only.
  return { channels: [], nextPageToken: null };
}

/**
 * Product images are normalized to transparent PNGs so downstream prompt/image
 * generation gets cleaner cutouts. We apply a lightweight bright-background
 * removal pass (good for white studio backgrounds) and keep original buffer on
 * processing failure.
 */
async function normalizeProductImage(buffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Naive bright-background matting: convert near-white pixels to transparent.
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const isBrightBackground = r > 245 && g > 245 && b > 245;
    if (isBrightBackground) data[i + 3] = 0;
  }

  const normalized = await sharp(Buffer.from(data), {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();
  return Buffer.from(normalized);
}

async function requireProjectOwnership(userId: number, projectId: number) {
  const project = await getProject(userId, projectId);
  if (!project) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  }
  return project;
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  settings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const s = await getUserSettings(ctx.user.id);
      if (!s) {
        return {
          kreaApiKey: "",
          openRouterApiKey: "",
          youtubeApiKey: "",
          uploadPostApiKey: "",
          gcsProjectId: "",
          gcsBucketName: "",
          gcsServiceAccountEmail: "",
          gcsPrivateKey: "",
          gcsVerifiedAt: null as Date | null,
        };
      }
      return {
        kreaApiKey: s.kreaApiKey ?? "",
        openRouterApiKey: s.openRouterApiKey ?? "",
        youtubeApiKey: s.youtubeApiKey ?? "",
        uploadPostApiKey: s.uploadPostApiKey ?? "",
        gcsProjectId: s.gcsProjectId ?? "",
        gcsBucketName: s.gcsBucketName ?? "",
        gcsServiceAccountEmail: s.gcsServiceAccountEmail ?? "",
        gcsPrivateKey: s.gcsPrivateKey ?? "",
        gcsVerifiedAt: s.gcsVerifiedAt ?? null,
      };
    }),
    save: protectedProcedure
      .input(
        z.object({
          kreaApiKey: z.string().optional(),
          openRouterApiKey: z.string().optional(),
          youtubeApiKey: z.string().optional(),
          uploadPostApiKey: z.string().optional(),
          gcsProjectId: z.string().optional(),
          gcsBucketName: z.string().optional(),
          gcsServiceAccountEmail: z.string().optional(),
          gcsPrivateKey: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const prev = await getUserSettings(ctx.user.id);
        await upsertUserSettings({
          userId: ctx.user.id,
          kreaApiKey: input.kreaApiKey ?? prev?.kreaApiKey ?? undefined,
          openRouterApiKey: input.openRouterApiKey ?? prev?.openRouterApiKey ?? undefined,
          youtubeApiKey: input.youtubeApiKey ?? prev?.youtubeApiKey ?? undefined,
          uploadPostApiKey: input.uploadPostApiKey ?? prev?.uploadPostApiKey ?? undefined,
          gcsProjectId: input.gcsProjectId ?? prev?.gcsProjectId ?? undefined,
          gcsBucketName: input.gcsBucketName ?? prev?.gcsBucketName ?? undefined,
          gcsServiceAccountEmail: input.gcsServiceAccountEmail ?? prev?.gcsServiceAccountEmail ?? undefined,
          gcsPrivateKey: input.gcsPrivateKey ?? prev?.gcsPrivateKey ?? undefined,
        });
        return { success: true } as const;
      }),
    verifyGcs: protectedProcedure
      .input(
        z.object({
          projectId: z.string().min(1, "Project ID\uB294 \uD544\uC218\uC785\uB2C8\uB2E4"),
          bucketName: z.string().min(1, "Bucket Name\uB294 \uD544\uC218\uC785\uB2C8\uB2E4"),
          serviceAccountEmail: z.string().email("\uC62C\uBC14\uB978 \uC774\uBA54\uC77C \uD615\uC2DD\uC774 \uC544\uB2D9\uB2C8\uB2E4"),
          privateKey: z.string().min(1, "Private Key\uB294 \uD544\uC218\uC785\uB2C8\uB2E4"),
          persist: z.boolean().default(true),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const result = await verifyGcsCredentials({
            projectId: input.projectId,
            bucketName: input.bucketName,
            serviceAccountEmail: input.serviceAccountEmail,
            privateKey: input.privateKey,
          });
          if (input.persist) {
            await upsertUserSettings({
              userId: ctx.user.id,
              gcsProjectId: input.projectId,
              gcsBucketName: input.bucketName,
              gcsServiceAccountEmail: input.serviceAccountEmail,
              gcsPrivateKey: input.privateKey,
              gcsVerifiedAt: result.ok ? new Date() : undefined,
            });
          }
          return result;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            ok: false,
            bucketExists: false,
            createdFolders: [] as string[],
            message: `\uAC80\uC99D \uC2E4\uD328: ${message}`,
          };
        }
      }),
  }),

  videoAnalysis: router({
    channelsByCountry: protectedProcedure
      .input(
        z.object({
          regionCode: youtubeRegionSchema,
          category: youtubeChannelCategorySchema.default("shopping"),
          maxResults: z.number().int().min(1).max(50).optional(),
          sort: z.enum(["subscribers_desc", "subscribers_asc", "views_desc"]).default("subscribers_desc"),
          cursor: z.number().int().positive().optional(),
        }),
      )
      .query(async ({ input }) => {
        const result = await listYoutubeChannelsFromDb({
          country: input.regionCode,
          topic: input.category,
          sort: input.sort,
          limit: input.maxResults ?? 12,
          cursor: input.cursor,
        });
        const channels = result.items.map(row => ({
          id: row.youtubeChannelId,
          title: row.title,
          description: row.description ?? "",
          thumbnailUrl: row.thumbnailUrl ?? "",
          country: row.country,
          subscriberCount: row.subscriberCount,
          videoCount: row.videoCount,
          viewCount: row.viewCount,
          channelUrl: `https://www.youtube.com/channel/${row.youtubeChannelId}`,
        }));
        return { channels, nextCursor: result.nextCursor };
      }),
    syncChannels: protectedProcedure
      .input(
        z.object({
          countries: z.array(youtubeRegionSchema).optional(),
          topics: z.array(youtubeChannelCategorySchema).optional(),
          maxResultsPerPair: z.number().int().min(1).max(25).optional(),
          refreshStatsOnly: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const settings = await getUserSettings(ctx.user.id);
        const apiKey = settings?.youtubeApiKey?.trim() || process.env.YOUTUBE_API_KEY?.trim();
        if (!apiKey) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "YouTube API key is required for sync.",
          });
        }

        if (input.refreshStatsOnly) {
          const stats = await refreshYoutubeChannelStats({ apiKey, maxChannels: 500 });
          return { mode: "refresh-stats", ...stats };
        }

        const synced = await syncYoutubeCatalog({
          apiKey,
          countries: input.countries,
          topics: input.topics,
          maxResultsPerPair: input.maxResultsPerPair ?? 12,
        });
        return { mode: "full-sync", ...synced };
      }),
  }),

  projects: router({
    list: protectedProcedure.query(({ ctx }) => listProjects(ctx.user.id)),
    get: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const project = await requireProjectOwnership(ctx.user.id, input.projectId);
        const [scenesRows, assetsRows, uploadsRows] = await Promise.all([
          listScenes(project.id),
          listAssets(project.id),
          listUploads(project.id),
        ]);
        return { project, scenes: scenesRows, assets: assetsRows, uploads: uploadsRows };
      }),
    create: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1).max(255),
          description: z.string().optional(),
          aspectRatio: aspectRatioSchema.default("9:16"),
          targetPlatforms: z.array(platformSchema).default(["TikTok", "Instagram", "YouTube"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const project = await createProject({
          userId: ctx.user.id,
          title: input.title,
          description: input.description ?? null,
          aspectRatio: input.aspectRatio,
          targetPlatforms: input.targetPlatforms,
        });
        return project!;
      }),
    update: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          title: z.string().min(1).max(255).optional(),
          description: z.string().optional(),
          aspectRatio: aspectRatioSchema.optional(),
          targetPlatforms: z.array(platformSchema).optional(),
          script: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await requireProjectOwnership(ctx.user.id, input.projectId);
        const { projectId, ...patch } = input;
        return updateProject(ctx.user.id, projectId, patch);
      }),
    remove: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await requireProjectOwnership(ctx.user.id, input.projectId);
        await deleteProject(ctx.user.id, input.projectId);
        return { success: true } as const;
      }),
  }),

  scenes: router({
    analyze: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          script: z.string().min(10),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await requireProjectOwnership(ctx.user.id, input.projectId);
        activeAnalyzeProjects.add(input.projectId);
        canceledAnalyzeProjects.delete(input.projectId);
        const project = await getProject(ctx.user.id, input.projectId);
        const assetsRows = await listAssets(input.projectId);
        const hasProduct = assetsRows.some(a => a.kind === "product");
        const hasPerson = assetsRows.some(a => a.kind === "person");
        await updateProject(ctx.user.id, input.projectId, {
          script: input.script,
          status: "analyzing",
        });

        try {
          const settings = await getUserSettings(ctx.user.id);
          const openRouterApiKey = settings?.openRouterApiKey?.trim();
          const analyses = await analyzeScript(
            input.script,
            openRouterApiKey
              ? {
                  apiKey: openRouterApiKey,
                  apiBaseUrl: "https://openrouter.ai/api/v1",
                  model: "openai/gpt-4o-mini",
                  appName: "shopping-shorts",
                  siteUrl: "http://localhost:3000",
                }
              : undefined,
          );

          // Replace prior scenes for deterministic re-analysis
          await deleteScenesByProject(input.projectId);

          if (canceledAnalyzeProjects.has(input.projectId)) {
            await updateProject(ctx.user.id, input.projectId, { status: "draft" });
            return { cancelled: true, scenes: [] as Array<unknown> };
          }

          const created = [];
          for (const a of analyses) {
            if (canceledAnalyzeProjects.has(input.projectId)) {
              await updateProject(ctx.user.id, input.projectId, { status: "draft" });
              return { cancelled: true, scenes: created };
            }
            const autoPrompt = await generateImagePrompt(
              {
                analysis: a,
                aspectRatio: (project?.aspectRatio ?? "9:16") as "9:16" | "16:9" | "1:1",
                hasProductPhoto: hasProduct,
                hasPersonPhoto: hasPerson,
              },
              openRouterApiKey
                ? {
                    apiKey: openRouterApiKey,
                    apiBaseUrl: "https://openrouter.ai/api/v1",
                    model: "openai/gpt-4o-mini",
                    appName: "shopping-shorts",
                    siteUrl: "http://localhost:3000",
                  }
                : undefined,
            );
            const scriptImagePrompt = extractSceneImagePromptFromScript(input.script, a.sceneIndex);
            const finalImagePrompt = scriptImagePrompt || autoPrompt;
            const row = await createScene({
              projectId: input.projectId,
              sceneIndex: a.sceneIndex,
              scriptExcerpt: a.scriptExcerpt,
              visualElements: a.visualElements,
              mood: a.mood,
              cameraAngle: a.cameraAngle,
              imagePrompt: attachVideoActionLine(finalImagePrompt, {
                scriptExcerpt: a.scriptExcerpt,
                visualElements: { actions: a.visualElements.actions ?? [] },
              }),
            });
            created.push(row!);
          }

          await updateProject(ctx.user.id, input.projectId, { status: "prompting" });
          return { cancelled: false, scenes: created };
        } finally {
          activeAnalyzeProjects.delete(input.projectId);
          canceledAnalyzeProjects.delete(input.projectId);
        }
      }),
    cancelAnalyze: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await requireProjectOwnership(ctx.user.id, input.projectId);
        if (!activeAnalyzeProjects.has(input.projectId)) {
          return { requested: false, message: "현재 실행 중인 장면 분리 작업이 없습니다." } as const;
        }
        canceledAnalyzeProjects.add(input.projectId);
        return { requested: true, message: "중지 요청을 보냈습니다. 곧 작업이 중단됩니다." } as const;
      }),

    generatePrompt: protectedProcedure
      .input(z.object({ sceneId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const scene = await getScene(input.sceneId);
        if (!scene) throw new TRPCError({ code: "NOT_FOUND" });
        const project = await requireProjectOwnership(ctx.user.id, scene.projectId);

        const assetsRows = await listAssets(project.id);
        const hasProduct = assetsRows.some(a => a.kind === "product");
        const hasPerson = assetsRows.some(a => a.kind === "person");

        const analysis = {
          sceneIndex: scene.sceneIndex,
          scriptExcerpt: scene.scriptExcerpt ?? "",
          visualElements: (scene.visualElements as {
            characters?: string[];
            backgrounds?: string[];
            props?: string[];
            products?: string[];
            actions?: string[];
          }) || {
            characters: [],
            backgrounds: [],
            props: [],
            products: [],
            actions: [],
          },
          mood: scene.mood ?? "natural",
          cameraAngle: scene.cameraAngle ?? "誘몃뵒?꾩꺑",
        };

        const settings = await getUserSettings(ctx.user.id);
        const openRouterApiKey = settings?.openRouterApiKey?.trim();
        const prompt = await generateImagePrompt(
          {
            analysis: {
              sceneIndex: analysis.sceneIndex,
              scriptExcerpt: analysis.scriptExcerpt,
              visualElements: {
                characters: analysis.visualElements.characters ?? [],
                backgrounds: analysis.visualElements.backgrounds ?? [],
                props: analysis.visualElements.props ?? [],
                products: analysis.visualElements.products ?? [],
                actions: analysis.visualElements.actions ?? [],
              },
              mood: analysis.mood,
              cameraAngle: analysis.cameraAngle,
            },
            aspectRatio: project.aspectRatio,
            hasProductPhoto: hasProduct,
            hasPersonPhoto: hasPerson,
          },
          openRouterApiKey
            ? {
                apiKey: openRouterApiKey,
                apiBaseUrl: "https://openrouter.ai/api/v1",
                model: "openai/gpt-4o-mini",
                appName: "shopping-shorts",
                siteUrl: "http://localhost:3000",
              }
            : undefined,
        );

        return updateScene(scene.id, {
          imagePrompt: attachVideoActionLine(prompt, {
            scriptExcerpt: analysis.scriptExcerpt,
            visualElements: { actions: analysis.visualElements.actions ?? [] },
          }),
        });
      }),

    updatePrompt: protectedProcedure
      .input(
        z.object({
          sceneId: z.number().int().positive(),
          imagePrompt: z.string(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const scene = await getScene(input.sceneId);
        if (!scene) throw new TRPCError({ code: "NOT_FOUND" });
        await requireProjectOwnership(ctx.user.id, scene.projectId);
        return updateScene(scene.id, { imagePrompt: input.imagePrompt });
      }),

    generateImage: protectedProcedure
      .input(
        z.object({
          sceneId: z.number().int().positive(),
          model: imageModelSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const scene = await getScene(input.sceneId);
        if (!scene) throw new TRPCError({ code: "NOT_FOUND" });
        const project = await requireProjectOwnership(ctx.user.id, scene.projectId);
        if (!scene.imagePrompt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "?꾨＼?꾪듃媛 鍮꾩뼱 ?덉뒿?덈떎" });
        }

        await updateScene(scene.id, {
          imageStatus: "generating",
          imageModel: input.model,
        });

        try {
          const assetsRows = await listAssets(project.id);
          const refs = assetsRows
            .slice(0, 2)
            .map(a => ({ url: a.url, mimeType: a.mimeType ?? undefined }));

          const settings = await getUserSettings(ctx.user.id);
          const { url } = await generateSceneImage({
            prompt: scene.imagePrompt,
            model: input.model,
            referenceImages: refs,
            kreaApiKey: settings?.kreaApiKey || undefined,
            aspectRatio: project.aspectRatio as "9:16" | "16:9" | "1:1",
          });

          return updateScene(scene.id, {
            imageStatus: "ready",
            imageUrl: url,
            upscaled: false,
          });
        } catch (err) {
          await updateScene(scene.id, { imageStatus: "failed" });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: (err as Error).message,
          });
        }
      }),

    upscaleImage: protectedProcedure
      .input(z.object({ sceneId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const scene = await getScene(input.sceneId);
        if (!scene) throw new TRPCError({ code: "NOT_FOUND" });
        await requireProjectOwnership(ctx.user.id, scene.projectId);
        if (!scene.imageUrl) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "?낆뒪耳?쇳븷 ?대?吏媛 ?놁뒿?덈떎" });
        }
        // When a Krea API key is configured we run Topaz Generative upscale via Krea
        // and persist the new high-resolution URL. Without a key we just toggle the
        // "upscaled" flag so the UI can show the badge against the original asset.
        const upSettings = await getUserSettings(ctx.user.id);
        const upRes = await upscaleSceneImage({
          imageUrl: scene.imageUrl,
          kreaApiKey: upSettings?.kreaApiKey || undefined,
        });
        return updateScene(scene.id, {
          upscaled: true,
          imageUrl: upRes.url,
        });
      }),

    generateVideo: protectedProcedure
      .input(
        z.object({
          sceneId: z.number().int().positive(),
          model: videoModelSchema,
          durationSec: z.number().int().min(5).max(12),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const scene = await getScene(input.sceneId);
        if (!scene) throw new TRPCError({ code: "NOT_FOUND" });
        await requireProjectOwnership(ctx.user.id, scene.projectId);
        if (!scene.imageUrl) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Generate image before generating video." });
        }

        await updateScene(scene.id, {
          videoStatus: "generating",
          videoModel: input.model,
          videoDuration: input.durationSec,
        });

        try {
          const vSettings = await getUserSettings(ctx.user.id);
          const project = await getProject(ctx.user.id, scene.projectId);
          const aspect = (project?.aspectRatio === "16:9" ? "16:9" : "9:16") as "9:16" | "16:9";
          const { url } = await generateSceneVideo({
            imageUrl: scene.imageUrl,
            model: input.model,
            durationSec: input.durationSec,
            prompt: scene.imagePrompt ?? undefined,
            aspectRatio: aspect,
            kreaApiKey: vSettings?.kreaApiKey || undefined,
          });
          return updateScene(scene.id, { videoStatus: "ready", videoUrl: url });
        } catch (err) {
          await updateScene(scene.id, { videoStatus: "failed" });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: (err as Error).message,
          });
        }
      }),
  }),

  assets: router({
    upload: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          kind: z.enum(["product", "person"]),
          filename: z.string().min(1).max(255),
          mimeType: z.string().min(1).max(128),
          // base64-encoded file content (without data: prefix)
          dataBase64: z.string().min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await requireProjectOwnership(ctx.user.id, input.projectId);

        const sourceBuffer = Buffer.from(input.dataBase64, "base64");
        if (sourceBuffer.byteLength > 8 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "File must be 8MB or smaller." });
        }

        let uploadBuffer: Buffer = sourceBuffer;
        let uploadMimeType = input.mimeType;
        let uploadFilename = input.filename;
        if (input.kind === "product") {
          try {
            uploadBuffer = Buffer.from(await normalizeProductImage(sourceBuffer));
            uploadMimeType = "image/png";
            uploadFilename = input.filename.replace(/\.[^.]+$/, "") + ".png";
          } catch (error) {
            console.warn("[assets.upload] Product image normalization failed, using original", error);
          }
        }

        const keyBase = `user-${ctx.user.id}/project-${input.projectId}/${input.kind}-${Date.now()}-${uploadFilename}`;
        const { key, url } = await storagePut(keyBase, uploadBuffer, uploadMimeType);

        return createAsset({
          projectId: input.projectId,
          userId: ctx.user.id,
          kind: input.kind,
          fileKey: key,
          url,
          filename: uploadFilename,
          mimeType: uploadMimeType,
        });
      }),
    remove: protectedProcedure
      .input(z.object({ assetId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await deleteAsset(ctx.user.id, input.assetId);
        return { success: true } as const;
      }),
  }),

  uploads: router({
    create: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          platforms: z.array(platformSchema).min(1),
          caption: z.string().optional(),
          hashtags: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await requireProjectOwnership(ctx.user.id, input.projectId);
        const created = [];
        for (const platform of input.platforms) {
          const row = await createUpload({
            projectId: input.projectId,
            userId: ctx.user.id,
            platform,
            caption: input.caption ?? null,
            hashtags: input.hashtags ?? null,
            status: "pending",
          });
          created.push(row!);
        }
        return created;
      }),
    run: protectedProcedure
      .input(
        z.object({
          uploadId: z.number().int().positive(),
          /** Upload-Post connected user identifier. Required for real dispatch. */
          uploadPostUser: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await updateUpload(input.uploadId, { status: "uploading" });

        // Fetch the row to know which project/platform/caption to dispatch.
        const row = await getUpload(input.uploadId);
        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "?낅줈????ぉ??李얠쓣 ???놁뒿?덈떎" });
        }
        await requireProjectOwnership(ctx.user.id, row.projectId);

        const settings = await getUserSettings(ctx.user.id);
        const apiKey = settings?.uploadPostApiKey;

        if (!apiKey || !input.uploadPostUser) {
          // Fallback path: keep the simulation so the UI flow stays demonstrable
          // when keys are not configured yet.
          await new Promise(r => setTimeout(r, 600));
          return updateUpload(input.uploadId, {
            status: "success",
            externalUrl: `https://upload-post.example.com/job/${input.uploadId}`,
            errorMessage: apiKey ? null : "Upload-Post API key媛 ?ㅼ젙?섏? ?딆븘 ?쒕??덉씠?섏쑝濡??꾨즺?덉뒿?덈떎",
          });
        }

        try {
          // Aggregate scenes -> use the first scene's videoUrl as the published video.
          const scenesRows = await listScenes(row.projectId);
          const videoUrl = scenesRows.find(s => s.videoUrl)?.videoUrl ?? "";
          if (!videoUrl) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "?낅줈?쒗븷 ?곸긽???놁뒿?덈떎",
            });
          }
          const result = await uploadPostVideo({
            apiKey,
            user: input.uploadPostUser,
            platforms: [row.platform as "TikTok" | "Instagram" | "YouTube" | "Facebook"],
            videoUrl,
            title: row.caption ?? undefined,
            description: row.hashtags ?? undefined,
          });
          return updateUpload(input.uploadId, {
            status: "success",
            externalUrl: `https://app.upload-post.com/uploads/${input.uploadId}`,
            errorMessage: null,
          });
        } catch (err) {
          const msg =
            err instanceof UploadPostError ? `${err.status}: ${err.body.slice(0, 200)}` : (err as Error).message;
          await updateUpload(input.uploadId, { status: "failed", errorMessage: msg });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;




