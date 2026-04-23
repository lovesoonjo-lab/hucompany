/**
 * Integration tests for the core tRPC routers (projects / scenes / uploads / settings).
 *
 * The DB layer (`./db`) and the pipeline LLM/image helpers (`./pipeline`) are mocked so
 * the tests exercise the router input validation, ownership checks, status transitions
 * and overall orchestration logic — without touching MySQL or external services.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

// ---------------- Mocks ----------------
type ProjectRow = {
  id: number;
  userId: number;
  title: string;
  description: string | null;
  aspectRatio: "9:16" | "16:9" | "1:1";
  targetPlatforms: string[] | null;
  script: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type SceneRow = {
  id: number;
  projectId: number;
  sceneIndex: number;
  scriptExcerpt: string | null;
  visualElements: unknown;
  mood: string | null;
  cameraAngle: string | null;
  imagePrompt: string | null;
  imageModel: string | null;
  imageUrl: string | null;
  imageStatus: "pending" | "generating" | "ready" | "failed";
  videoModel: string | null;
  videoUrl: string | null;
  videoStatus: "pending" | "generating" | "ready" | "failed";
  upscaled: boolean;
};

type UploadRow = {
  id: number;
  projectId: number;
  userId: number;
  platform: string;
  caption: string | null;
  hashtags: string | null;
  status: "pending" | "uploading" | "success" | "failed";
  externalUrl: string | null;
  createdAt: Date;
};

let nextProjectId = 1;
let nextSceneId = 1;
let nextUploadId = 1;
const projectsStore = new Map<number, ProjectRow>();
const scenesStore = new Map<number, SceneRow>();
const uploadsStore = new Map<number, UploadRow>();
const settingsStore = new Map<number, { userId: number; kreaApiKey?: string | null; uploadPostApiKey?: string | null }>();
const assetsStore = new Map<number, { id: number; projectId: number; userId: number; kind: "product" | "person" }>();

vi.mock("./db", () => ({
  listProjects: vi.fn(async (userId: number) =>
    [...projectsStore.values()].filter(p => p.userId === userId),
  ),
  getProject: vi.fn(async (userId: number, projectId: number) => {
    const p = projectsStore.get(projectId);
    return p && p.userId === userId ? p : undefined;
  }),
  createProject: vi.fn(async (input: Partial<ProjectRow> & { userId: number; title: string }) => {
    const id = nextProjectId++;
    const row: ProjectRow = {
      id,
      userId: input.userId,
      title: input.title,
      description: input.description ?? null,
      aspectRatio: (input.aspectRatio as ProjectRow["aspectRatio"]) ?? "9:16",
      targetPlatforms: (input.targetPlatforms as string[] | undefined) ?? null,
      script: input.script ?? null,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    projectsStore.set(id, row);
    return row;
  }),
  updateProject: vi.fn(async (userId: number, projectId: number, patch: Partial<ProjectRow>) => {
    const p = projectsStore.get(projectId);
    if (!p || p.userId !== userId) return undefined;
    Object.assign(p, patch, { updatedAt: new Date() });
    return p;
  }),
  deleteProject: vi.fn(async (userId: number, projectId: number) => {
    const p = projectsStore.get(projectId);
    if (p && p.userId === userId) projectsStore.delete(projectId);
  }),
  listScenes: vi.fn(async (projectId: number) =>
    [...scenesStore.values()].filter(s => s.projectId === projectId),
  ),
  getScene: vi.fn(async (sceneId: number) => scenesStore.get(sceneId)),
  createScene: vi.fn(async (input: Partial<SceneRow> & { projectId: number; sceneIndex: number }) => {
    const id = nextSceneId++;
    const row: SceneRow = {
      id,
      projectId: input.projectId,
      sceneIndex: input.sceneIndex,
      scriptExcerpt: input.scriptExcerpt ?? null,
      visualElements: input.visualElements ?? null,
      mood: input.mood ?? null,
      cameraAngle: input.cameraAngle ?? null,
      imagePrompt: null,
      imageModel: null,
      imageUrl: null,
      imageStatus: "pending",
      videoModel: null,
      videoUrl: null,
      videoStatus: "pending",
      upscaled: false,
    };
    scenesStore.set(id, row);
    return row;
  }),
  updateScene: vi.fn(async (sceneId: number, patch: Partial<SceneRow>) => {
    const s = scenesStore.get(sceneId);
    if (!s) return undefined;
    Object.assign(s, patch);
    return s;
  }),
  deleteScenesByProject: vi.fn(async (projectId: number) => {
    for (const [id, s] of scenesStore) if (s.projectId === projectId) scenesStore.delete(id);
  }),
  listAssets: vi.fn(async (projectId: number) =>
    [...assetsStore.values()].filter(a => a.projectId === projectId),
  ),
  createAsset: vi.fn(),
  deleteAsset: vi.fn(),
  listUploads: vi.fn(async (projectId: number) =>
    [...uploadsStore.values()].filter(u => u.projectId === projectId),
  ),
  getUpload: vi.fn(async (uploadId: number) => uploadsStore.get(uploadId)),
  createUpload: vi.fn(async (input: Partial<UploadRow> & { projectId: number; userId: number; platform: string }) => {
    const id = nextUploadId++;
    const row: UploadRow = {
      id,
      projectId: input.projectId,
      userId: input.userId,
      platform: input.platform,
      caption: input.caption ?? null,
      hashtags: input.hashtags ?? null,
      status: "pending",
      externalUrl: null,
      createdAt: new Date(),
    };
    uploadsStore.set(id, row);
    return row;
  }),
  updateUpload: vi.fn(async (uploadId: number, patch: Partial<UploadRow>) => {
    const u = uploadsStore.get(uploadId);
    if (!u) return undefined;
    Object.assign(u, patch);
    return u;
  }),
  getUserSettings: vi.fn(async (userId: number) => settingsStore.get(userId)),
  upsertUserSettings: vi.fn(async (input: { userId: number; kreaApiKey?: string; uploadPostApiKey?: string }) => {
    const prev = settingsStore.get(input.userId) ?? { userId: input.userId };
    const next = { ...prev, ...input };
    settingsStore.set(input.userId, next);
    return next;
  }),
}));

vi.mock("./pipeline", () => ({
  analyzeScript: vi.fn(async () => [
    {
      sceneIndex: 1,
      scriptExcerpt: "햇살 카페",
      visualElements: { characters: ["여성"], backgrounds: ["카페"], props: [], products: ["세럼"], actions: ["바르기"] },
      mood: "포근한",
      cameraAngle: "미디엄샷",
    },
    {
      sceneIndex: 2,
      scriptExcerpt: "제품 클로즈업",
      visualElements: { characters: [], backgrounds: ["스튜디오"], props: [], products: ["세럼"], actions: ["회전"] },
      mood: "고급스러운",
      cameraAngle: "클로즈업",
    },
  ]),
  generateImagePrompt: vi.fn(async () => "an elegant scene of a young woman applying serum, --ar 9:16"),
  generateSceneImage: vi.fn(async () => ({ url: "/manus-storage/scene.png", provider: "builtin" })),
  generateSceneVideo: vi.fn(async (input: { imageUrl: string }) => ({ url: input.imageUrl, provider: "poster" })),
  upscaleSceneImage: vi.fn(async (input: { imageUrl: string }) => ({ url: input.imageUrl, provider: "noop" })),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn(async (key: string) => ({ key, url: `/manus-storage/${key}` })),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createCtx(userId = 42): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `open-${userId}`,
      email: `u${userId}@example.com`,
      name: "Tester",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

beforeEach(() => {
  projectsStore.clear();
  scenesStore.clear();
  uploadsStore.clear();
  settingsStore.clear();
  assetsStore.clear();
  nextProjectId = 1;
  nextSceneId = 1;
  nextUploadId = 1;
});

describe("settings router", () => {
  it("returns empty defaults when no settings exist", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.settings.get();
    expect(result).toEqual({
      kreaApiKey: "",
      uploadPostApiKey: "",
      gcsProjectId: "",
      gcsBucketName: "",
      gcsServiceAccountEmail: "",
      gcsPrivateKey: "",
      gcsVerifiedAt: null,
    });
  });

  it("persists Krea and Upload-Post API keys", async () => {
    const caller = appRouter.createCaller(createCtx());
    await caller.settings.save({ kreaApiKey: "krea-xyz", uploadPostApiKey: "up-abc" });
    const result = await caller.settings.get();
    expect(result.kreaApiKey).toBe("krea-xyz");
    expect(result.uploadPostApiKey).toBe("up-abc");
  });
});

describe("projects router", () => {
  it("creates a project with target platforms and lists it back", async () => {
    const caller = appRouter.createCaller(createCtx(1));
    const created = await caller.projects.create({
      title: "봄 신제품",
      description: "비타민C 세럼",
      aspectRatio: "9:16",
      targetPlatforms: ["TikTok", "Instagram"],
    });
    expect(created.title).toBe("봄 신제품");
    expect(created.targetPlatforms).toEqual(["TikTok", "Instagram"]);

    const list = await caller.projects.list();
    expect(list).toHaveLength(1);
  });

  it("rejects empty title via Zod", async () => {
    const caller = appRouter.createCaller(createCtx());
    await expect(
      caller.projects.create({ title: "", aspectRatio: "9:16", targetPlatforms: ["TikTok"] }),
    ).rejects.toThrow();
  });

  it("isolates projects across users (NOT_FOUND on cross-user fetch)", async () => {
    const a = appRouter.createCaller(createCtx(1));
    const b = appRouter.createCaller(createCtx(2));
    const p = await a.projects.create({
      title: "user-1 project",
      aspectRatio: "9:16",
      targetPlatforms: ["TikTok"],
    });
    await expect(b.projects.get({ projectId: p.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const aGet = await a.projects.get({ projectId: p.id });
    expect(aGet.project.id).toBe(p.id);
  });

  it("updates targetPlatforms via the update mutation", async () => {
    const caller = appRouter.createCaller(createCtx());
    const p = await caller.projects.create({
      title: "x",
      aspectRatio: "9:16",
      targetPlatforms: ["TikTok"],
    });
    const updated = await caller.projects.update({
      projectId: p.id,
      targetPlatforms: ["YouTube", "Facebook"],
    });
    expect(updated?.targetPlatforms).toEqual(["YouTube", "Facebook"]);
  });

  it("removes a project", async () => {
    const caller = appRouter.createCaller(createCtx());
    const p = await caller.projects.create({
      title: "to-delete",
      aspectRatio: "9:16",
      targetPlatforms: ["TikTok"],
    });
    await caller.projects.remove({ projectId: p.id });
    expect(await caller.projects.list()).toHaveLength(0);
  });
});

describe("scenes router", () => {
  it("analyzes script and creates scene rows + bumps project status", async () => {
    const caller = appRouter.createCaller(createCtx());
    const p = await caller.projects.create({
      title: "x",
      aspectRatio: "9:16",
      targetPlatforms: ["TikTok"],
    });
    const created = await caller.scenes.analyze({
      projectId: p.id,
      script: "긴 대본 텍스트입니다 테스트용".repeat(2),
    });
    expect(created).toHaveLength(2);
    const refetched = await caller.projects.get({ projectId: p.id });
    expect(refetched.project.status).toBe("prompting");
    expect(refetched.scenes).toHaveLength(2);
  });

  it("generates a prompt and persists it on the scene", async () => {
    const caller = appRouter.createCaller(createCtx());
    const p = await caller.projects.create({
      title: "x",
      aspectRatio: "9:16",
      targetPlatforms: ["TikTok"],
    });
    await caller.scenes.analyze({ projectId: p.id, script: "어떤 대본 텍스트입니다 테스트용" });
    const allScenes = (await caller.projects.get({ projectId: p.id })).scenes;
    const prompted = await caller.scenes.generatePrompt({ sceneId: allScenes[0].id });
    expect(prompted?.imagePrompt).toMatch(/--ar 9:16/);
  });

  it("generates image with selected model and marks status=ready", async () => {
    const caller = appRouter.createCaller(createCtx());
    const p = await caller.projects.create({
      title: "x",
      aspectRatio: "9:16",
      targetPlatforms: ["TikTok"],
    });
    await caller.scenes.analyze({ projectId: p.id, script: "대본 본문 내용 데이터 테스트" });
    const scene = (await caller.projects.get({ projectId: p.id })).scenes[0];
    await caller.scenes.updatePrompt({ sceneId: scene.id, imagePrompt: "a beautiful scene --ar 9:16" });
    const out = await caller.scenes.generateImage({ sceneId: scene.id, model: "Nano Banana Pro" });
    expect(out?.imageStatus).toBe("ready");
    expect(out?.imageUrl).toBeTruthy();
    expect(out?.imageModel).toBe("Nano Banana Pro");
  });

  it("rejects video generation when no image is ready yet", async () => {
    const caller = appRouter.createCaller(createCtx());
    const p = await caller.projects.create({
      title: "x",
      aspectRatio: "9:16",
      targetPlatforms: ["TikTok"],
    });
    await caller.scenes.analyze({ projectId: p.id, script: "대본 본문 내용 데이터 테스트" });
    const scene = (await caller.projects.get({ projectId: p.id })).scenes[0];
    await expect(
      caller.scenes.generateVideo({ sceneId: scene.id, model: "Kling 2.6", durationSec: 6 }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("upscales image after generation (sets upscaled=true)", async () => {
    const caller = appRouter.createCaller(createCtx());
    const p = await caller.projects.create({
      title: "x",
      aspectRatio: "9:16",
      targetPlatforms: ["TikTok"],
    });
    await caller.scenes.analyze({ projectId: p.id, script: "대본 본문 내용 데이터 테스트" });
    const scene = (await caller.projects.get({ projectId: p.id })).scenes[0];
    await caller.scenes.updatePrompt({ sceneId: scene.id, imagePrompt: "a scene --ar 9:16" });
    await caller.scenes.generateImage({ sceneId: scene.id, model: "Krea 1" });
    const upscaled = await caller.scenes.upscaleImage({ sceneId: scene.id });
    expect(upscaled?.upscaled).toBe(true);
  });
});

describe("uploads router", () => {
  it("creates one upload row per platform and runs them to success", async () => {
    const caller = appRouter.createCaller(createCtx());
    const p = await caller.projects.create({
      title: "x",
      aspectRatio: "9:16",
      targetPlatforms: ["TikTok", "Instagram", "YouTube", "Facebook"],
    });
    const rows = await caller.uploads.create({
      projectId: p.id,
      platforms: ["TikTok", "Instagram", "YouTube", "Facebook"],
      caption: "안녕하세요",
      hashtags: "#shorts",
    });
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map(r => r.platform))).toEqual(
      new Set(["TikTok", "Instagram", "YouTube", "Facebook"]),
    );
    for (const r of rows) {
      const ran = await caller.uploads.run({ uploadId: r.id });
      expect(ran?.status).toBe("success");
      expect(ran?.externalUrl).toMatch(/upload-post/);
    }
  });

  it("requires at least one platform", async () => {
    const caller = appRouter.createCaller(createCtx());
    const p = await caller.projects.create({
      title: "x",
      aspectRatio: "9:16",
      targetPlatforms: ["TikTok"],
    });
    await expect(
      caller.uploads.create({ projectId: p.id, platforms: [] }),
    ).rejects.toThrow();
  });

  it("blocks uploads against another user's project", async () => {
    const a = appRouter.createCaller(createCtx(1));
    const b = appRouter.createCaller(createCtx(2));
    const p = await a.projects.create({
      title: "owned",
      aspectRatio: "9:16",
      targetPlatforms: ["TikTok"],
    });
    await expect(
      b.uploads.create({ projectId: p.id, platforms: ["TikTok"] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
