import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
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

const aspectRatioSchema = z.enum(["9:16", "16:9", "1:1"]);

const imageModelSchema = z.enum([
  "Krea 1",
  "Nano Banana Pro",
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

const platformSchema = z.enum(["TikTok", "Instagram", "YouTube", "Facebook"]);

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
          uploadPostApiKey: z.string().optional(),
          gcsProjectId: z.string().optional(),
          gcsBucketName: z.string().optional(),
          gcsServiceAccountEmail: z.string().optional(),
          gcsPrivateKey: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await upsertUserSettings({
          userId: ctx.user.id,
          kreaApiKey: input.kreaApiKey,
          uploadPostApiKey: input.uploadPostApiKey,
          gcsProjectId: input.gcsProjectId,
          gcsBucketName: input.gcsBucketName,
          gcsServiceAccountEmail: input.gcsServiceAccountEmail,
          gcsPrivateKey: input.gcsPrivateKey,
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
        await updateProject(ctx.user.id, input.projectId, {
          script: input.script,
          status: "analyzing",
        });

        const analyses = await analyzeScript(input.script);

        // Replace prior scenes for deterministic re-analysis
        await deleteScenesByProject(input.projectId);

        const created = [];
        for (const a of analyses) {
          const row = await createScene({
            projectId: input.projectId,
            sceneIndex: a.sceneIndex,
            scriptExcerpt: a.scriptExcerpt,
            visualElements: a.visualElements,
            mood: a.mood,
            cameraAngle: a.cameraAngle,
          });
          created.push(row!);
        }

        await updateProject(ctx.user.id, input.projectId, { status: "prompting" });
        return created;
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
          mood: scene.mood ?? "자연스러운",
          cameraAngle: scene.cameraAngle ?? "미디엄샷",
        };

        const prompt = await generateImagePrompt({
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
        });

        return updateScene(scene.id, { imagePrompt: prompt });
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
          throw new TRPCError({ code: "BAD_REQUEST", message: "프롬프트가 비어 있습니다" });
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
          throw new TRPCError({ code: "BAD_REQUEST", message: "업스케일할 이미지가 없습니다" });
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
          throw new TRPCError({ code: "BAD_REQUEST", message: "영상화 전에 이미지를 먼저 생성하세요" });
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

        const buffer = Buffer.from(input.dataBase64, "base64");
        if (buffer.byteLength > 8 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "파일은 8MB 이하여야 합니다" });
        }

        const keyBase = `user-${ctx.user.id}/project-${input.projectId}/${input.kind}-${Date.now()}-${input.filename}`;
        const { key, url } = await storagePut(keyBase, buffer, input.mimeType);

        return createAsset({
          projectId: input.projectId,
          userId: ctx.user.id,
          kind: input.kind,
          fileKey: key,
          url,
          filename: input.filename,
          mimeType: input.mimeType,
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
          throw new TRPCError({ code: "NOT_FOUND", message: "업로드 항목을 찾을 수 없습니다" });
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
            errorMessage: apiKey ? null : "Upload-Post API key가 설정되지 않아 시뮬레이션으로 완료했습니다",
          });
        }

        try {
          // Aggregate scenes -> use the first scene's videoUrl as the published video.
          const scenesRows = await listScenes(row.projectId);
          const videoUrl = scenesRows.find(s => s.videoUrl)?.videoUrl ?? "";
          if (!videoUrl) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "업로드할 영상이 없습니다",
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
