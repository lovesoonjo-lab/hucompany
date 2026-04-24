import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  Asset,
  InsertAsset,
  InsertProject,
  InsertScene,
  InsertUpload,
  InsertUser,
  InsertUserSettings,
  Project,
  Scene,
  Upload,
  YoutubeChannel,
  InsertYoutubeChannel,
  User,
  UserSettings,
  assets,
  projects,
  scenes,
  uploads,
  youtubeChannels,
  userSettings,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let memProjectId = 1;
let memSceneId = 1;
let memAssetId = 1;
let memUploadId = 1;
let memUserId = 1;
let memYoutubeChannelId = 1;
const memUsers: User[] = [];
const memUserSettings: UserSettings[] = [];
const memProjects: Project[] = [];
const memScenes: Scene[] = [];
const memAssets: Asset[] = [];
const memUploads: Upload[] = [];
const memYoutubeChannels: YoutubeChannel[] = [];

function readInsertId(result: unknown): number {
  if (!result || typeof result !== "object") return 0;
  const direct = Number((result as { insertId?: unknown }).insertId ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const first = Array.isArray(result) ? result[0] : null;
  const nested = Number((first as { insertId?: unknown } | null)?.insertId ?? 0);
  if (Number.isFinite(nested) && nested > 0) return nested;
  return 0;
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    const existingIdx = memUsers.findIndex(u => u.openId === user.openId);
    const now = new Date();
    const base: User = {
      id: existingIdx >= 0 ? memUsers[existingIdx].id : memUserId++,
      openId: user.openId,
      name: user.name ?? null,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? null,
      role: (user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user")) as "user" | "admin",
      createdAt: existingIdx >= 0 ? memUsers[existingIdx].createdAt : now,
      updatedAt: now,
      lastSignedIn: user.lastSignedIn ?? now,
    };
    if (existingIdx >= 0) memUsers[existingIdx] = { ...memUsers[existingIdx], ...base };
    else memUsers.push(base);
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return memUsers.find(u => u.openId === openId);
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/* -------------------------------------------------------------------------- */
/* User settings                                                              */
/* -------------------------------------------------------------------------- */

export async function getUserSettings(userId: number) {
  const db = await getDb();
  if (!db) return memUserSettings.find(s => s.userId === userId);
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return rows[0];
}

export async function upsertUserSettings(input: InsertUserSettings) {
  const db = await getDb();
  if (!db) {
    const existingIdx = memUserSettings.findIndex(s => s.userId === input.userId);
    const now = new Date();
    const next: UserSettings = {
      id: existingIdx >= 0 ? memUserSettings[existingIdx].id : memUserSettings.length + 1,
      userId: input.userId,
      kreaApiKey: input.kreaApiKey ?? null,
      openRouterApiKey: input.openRouterApiKey ?? null,
      youtubeApiKey: input.youtubeApiKey ?? null,
      uploadPostApiKey: input.uploadPostApiKey ?? null,
      gcsProjectId: input.gcsProjectId ?? null,
      gcsBucketName: input.gcsBucketName ?? null,
      gcsServiceAccountEmail: input.gcsServiceAccountEmail ?? null,
      gcsPrivateKey: input.gcsPrivateKey ?? null,
      gcsVerifiedAt: input.gcsVerifiedAt ?? null,
      createdAt: existingIdx >= 0 ? memUserSettings[existingIdx].createdAt : now,
      updatedAt: now,
    };
    if (existingIdx >= 0) memUserSettings[existingIdx] = { ...memUserSettings[existingIdx], ...next };
    else memUserSettings.push(next);
    return getUserSettings(input.userId);
  }
  const updateSet: Record<string, unknown> = {};
  if (input.kreaApiKey !== undefined) updateSet.kreaApiKey = input.kreaApiKey;
  if (input.openRouterApiKey !== undefined) updateSet.openRouterApiKey = input.openRouterApiKey;
  if (input.youtubeApiKey !== undefined) updateSet.youtubeApiKey = input.youtubeApiKey;
  if (input.uploadPostApiKey !== undefined) updateSet.uploadPostApiKey = input.uploadPostApiKey;
  if (input.gcsProjectId !== undefined) updateSet.gcsProjectId = input.gcsProjectId;
  if (input.gcsBucketName !== undefined) updateSet.gcsBucketName = input.gcsBucketName;
  if (input.gcsServiceAccountEmail !== undefined) updateSet.gcsServiceAccountEmail = input.gcsServiceAccountEmail;
  if (input.gcsPrivateKey !== undefined) updateSet.gcsPrivateKey = input.gcsPrivateKey;
  if (input.gcsVerifiedAt !== undefined) updateSet.gcsVerifiedAt = input.gcsVerifiedAt;

  await db.insert(userSettings).values(input).onDuplicateKeyUpdate({ set: updateSet });
  return getUserSettings(input.userId);
}

export type YoutubeTopic =
  | "shopping"
  | "news"
  | "info"
  | "psychology"
  | "economics"
  | "beauty"
  | "cooking"
  | "tech"
  | "music"
  | "vlog"
  | "animation"
  | "kids";

export type YoutubeSort = "subscribers_desc" | "subscribers_asc" | "views_desc";

export async function listYoutubeChannelsFromDb(input: {
  country: string;
  topic: YoutubeTopic;
  sort: YoutubeSort;
  limit?: number;
  cursor?: number;
}) {
  const db = await getDb();
  const limit = Math.min(Math.max(input.limit ?? 24, 1), 100);
  const cursor = input.cursor ?? null;

  if (!db) {
    const sorted = [...memYoutubeChannels]
      .filter(row => row.country === input.country && row.topic === input.topic)
      .sort((a, b) => {
        if (input.sort === "subscribers_asc") return a.subscriberCount - b.subscriberCount;
        if (input.sort === "views_desc") return b.viewCount - a.viewCount;
        return b.subscriberCount - a.subscriberCount;
      });
    const sliced = sorted.slice(cursor ?? 0, (cursor ?? 0) + limit);
    const nextCursor = (cursor ?? 0) + sliced.length < sorted.length ? (cursor ?? 0) + sliced.length : null;
    return { items: sliced, nextCursor };
  }

  const whereClause = [
    eq(youtubeChannels.country, input.country),
    eq(youtubeChannels.topic, input.topic),
  ];
  if (cursor) whereClause.push(lt(youtubeChannels.id, cursor));

  const orderByClause =
    input.sort === "subscribers_asc"
      ? [asc(youtubeChannels.subscriberCount), desc(youtubeChannels.id)]
      : input.sort === "views_desc"
        ? [desc(youtubeChannels.viewCount), desc(youtubeChannels.id)]
        : [desc(youtubeChannels.subscriberCount), desc(youtubeChannels.id)];

  const rows = await db
    .select()
    .from(youtubeChannels)
    .where(and(...whereClause))
    .orderBy(...orderByClause)
    .limit(limit);

  const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
  return { items: rows, nextCursor };
}

export async function upsertYoutubeChannels(rows: Array<InsertYoutubeChannel>) {
  if (!rows.length) return;
  const db = await getDb();
  const now = new Date();

  if (!db) {
    for (const row of rows) {
      const idx = memYoutubeChannels.findIndex(item => item.youtubeChannelId === row.youtubeChannelId);
      const next: YoutubeChannel = {
        id: idx >= 0 ? memYoutubeChannels[idx].id : memYoutubeChannelId++,
        youtubeChannelId: row.youtubeChannelId!,
        title: row.title!,
        description: row.description ?? null,
        thumbnailUrl: row.thumbnailUrl ?? null,
        country: row.country!,
        topic: row.topic as YoutubeTopic,
        subscriberCount: row.subscriberCount ?? 0,
        viewCount: row.viewCount ?? 0,
        videoCount: row.videoCount ?? 0,
        lastSyncedAt: row.lastSyncedAt ?? now,
        createdAt: idx >= 0 ? memYoutubeChannels[idx].createdAt : now,
        updatedAt: now,
      };
      if (idx >= 0) memYoutubeChannels[idx] = next;
      else memYoutubeChannels.push(next);
    }
    return;
  }

  await db.insert(youtubeChannels).values(rows).onDuplicateKeyUpdate({
    set: {
      title: sql`values(title)`,
      description: sql`values(description)`,
      thumbnailUrl: sql`values(thumbnailUrl)`,
      country: sql`values(country)`,
      topic: sql`values(topic)`,
      subscriberCount: sql`values(subscriberCount)`,
      viewCount: sql`values(viewCount)`,
      videoCount: sql`values(videoCount)`,
      lastSyncedAt: sql`values(lastSyncedAt)`,
    },
  });
}

export async function listYoutubeChannelsForStatsRefresh(limit = 300) {
  const db = await getDb();
  if (!db) {
    return [...memYoutubeChannels]
      .sort((a, b) => +a.lastSyncedAt - +b.lastSyncedAt)
      .slice(0, Math.min(limit, 1000));
  }
  return db
    .select()
    .from(youtubeChannels)
    .orderBy(asc(youtubeChannels.lastSyncedAt))
    .limit(Math.min(limit, 1000));
}

export async function updateYoutubeChannelStats(
  rows: Array<{ youtubeChannelId: string; subscriberCount: number; viewCount: number; videoCount: number }>
) {
  if (!rows.length) return;
  const db = await getDb();
  const now = new Date();
  if (!db) {
    for (const row of rows) {
      const idx = memYoutubeChannels.findIndex(item => item.youtubeChannelId === row.youtubeChannelId);
      if (idx < 0) continue;
      memYoutubeChannels[idx] = {
        ...memYoutubeChannels[idx],
        subscriberCount: row.subscriberCount,
        viewCount: row.viewCount,
        videoCount: row.videoCount,
        lastSyncedAt: now,
        updatedAt: now,
      };
    }
    return;
  }

  for (const row of rows) {
    await db
      .update(youtubeChannels)
      .set({
        subscriberCount: row.subscriberCount,
        viewCount: row.viewCount,
        videoCount: row.videoCount,
        lastSyncedAt: now,
      })
      .where(eq(youtubeChannels.youtubeChannelId, row.youtubeChannelId));
  }
}

/* -------------------------------------------------------------------------- */
/* Projects                                                                   */
/* -------------------------------------------------------------------------- */

export async function listProjects(userId: number) {
  const db = await getDb();
  if (!db) return memProjects.filter(p => p.userId === userId).sort((a, b) => +b.updatedAt - +a.updatedAt);
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.updatedAt));
}

export async function getProject(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) return memProjects.find(p => p.userId === userId && p.id === projectId);
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.id, projectId)))
    .limit(1);
  return rows[0];
}

export async function createProject(input: InsertProject) {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const row: Project = {
      id: memProjectId++,
      userId: input.userId!,
      title: input.title!,
      description: input.description ?? null,
      aspectRatio: (input.aspectRatio ?? "9:16") as "9:16" | "16:9" | "1:1",
      targetPlatforms: (input.targetPlatforms ?? ["TikTok", "Instagram", "YouTube"]) as string[] | null,
      script: input.script ?? null,
      status: (input.status ?? "draft") as Project["status"],
      createdAt: now,
      updatedAt: now,
    };
    memProjects.push(row);
    return row;
  }
  const result = await db.insert(projects).values(input);
  const insertId = readInsertId(result);
  if (insertId) {
    const rows = await db.select().from(projects).where(eq(projects.id, insertId)).limit(1);
    if (rows[0]) return rows[0];
  }
  const fallbackRows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, input.userId!), eq(projects.title, input.title!)))
    .orderBy(desc(projects.id))
    .limit(1);
  if (fallbackRows[0]) return fallbackRows[0];
  throw new Error("Failed to create project");
}

export async function updateProject(
  userId: number,
  projectId: number,
  patch: Partial<InsertProject>
) {
  const db = await getDb();
  if (!db) {
    const idx = memProjects.findIndex(p => p.userId === userId && p.id === projectId);
    if (idx < 0) return undefined;
    memProjects[idx] = { ...memProjects[idx], ...patch, updatedAt: new Date() };
    return memProjects[idx];
  }
  await db
    .update(projects)
    .set(patch)
    .where(and(eq(projects.userId, userId), eq(projects.id, projectId)));
  return getProject(userId, projectId);
}

export async function deleteProject(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) {
    const projectIdx = memProjects.findIndex(p => p.userId === userId && p.id === projectId);
    if (projectIdx >= 0) memProjects.splice(projectIdx, 1);
    for (let i = memScenes.length - 1; i >= 0; i--) if (memScenes[i].projectId === projectId) memScenes.splice(i, 1);
    for (let i = memAssets.length - 1; i >= 0; i--) if (memAssets[i].projectId === projectId) memAssets.splice(i, 1);
    for (let i = memUploads.length - 1; i >= 0; i--) if (memUploads[i].projectId === projectId) memUploads.splice(i, 1);
    return;
  }
  // Cascade: delete scenes, assets, uploads belonging to project
  await db.delete(scenes).where(eq(scenes.projectId, projectId));
  await db.delete(assets).where(eq(assets.projectId, projectId));
  await db.delete(uploads).where(eq(uploads.projectId, projectId));
  await db
    .delete(projects)
    .where(and(eq(projects.userId, userId), eq(projects.id, projectId)));
}

/* -------------------------------------------------------------------------- */
/* Scenes                                                                     */
/* -------------------------------------------------------------------------- */

export async function listScenes(projectId: number) {
  const db = await getDb();
  if (!db) return memScenes.filter(s => s.projectId === projectId).sort((a, b) => a.sceneIndex - b.sceneIndex);
  return db.select().from(scenes).where(eq(scenes.projectId, projectId)).orderBy(scenes.sceneIndex);
}

export async function getScene(sceneId: number) {
  const db = await getDb();
  if (!db) return memScenes.find(s => s.id === sceneId);
  const rows = await db.select().from(scenes).where(eq(scenes.id, sceneId)).limit(1);
  return rows[0];
}

export async function createScene(input: InsertScene) {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const row: Scene = {
      id: memSceneId++,
      projectId: input.projectId!,
      sceneIndex: input.sceneIndex!,
      scriptExcerpt: input.scriptExcerpt ?? null,
      visualElements: input.visualElements ?? null,
      mood: input.mood ?? null,
      cameraAngle: input.cameraAngle ?? null,
      imagePrompt: input.imagePrompt ?? null,
      imageModel: input.imageModel ?? null,
      imageUrl: input.imageUrl ?? null,
      imageStatus: (input.imageStatus ?? "pending") as Scene["imageStatus"],
      upscaled: input.upscaled ?? false,
      videoModel: input.videoModel ?? null,
      videoDuration: input.videoDuration ?? 6,
      videoUrl: input.videoUrl ?? null,
      videoStatus: (input.videoStatus ?? "pending") as Scene["videoStatus"],
      createdAt: now,
      updatedAt: now,
    };
    memScenes.push(row);
    return row;
  }
  const result = await db.insert(scenes).values(input);
  const insertId = readInsertId(result);
  if (insertId) {
    const rows = await db.select().from(scenes).where(eq(scenes.id, insertId)).limit(1);
    if (rows[0]) return rows[0];
  }
  const fallbackRows = await db
    .select()
    .from(scenes)
    .where(and(eq(scenes.projectId, input.projectId!), eq(scenes.sceneIndex, input.sceneIndex!)))
    .orderBy(desc(scenes.id))
    .limit(1);
  if (fallbackRows[0]) return fallbackRows[0];
  throw new Error("Failed to insert scene");
}

export async function updateScene(sceneId: number, patch: Partial<InsertScene>) {
  const db = await getDb();
  if (!db) {
    const idx = memScenes.findIndex(s => s.id === sceneId);
    if (idx < 0) return undefined;
    memScenes[idx] = { ...memScenes[idx], ...patch, updatedAt: new Date() };
    return memScenes[idx];
  }
  await db.update(scenes).set(patch).where(eq(scenes.id, sceneId));
  return getScene(sceneId);
}

export async function deleteScenesByProject(projectId: number) {
  const db = await getDb();
  if (!db) {
    for (let i = memScenes.length - 1; i >= 0; i--) if (memScenes[i].projectId === projectId) memScenes.splice(i, 1);
    return;
  }
  await db.delete(scenes).where(eq(scenes.projectId, projectId));
}

/* -------------------------------------------------------------------------- */
/* Assets                                                                     */
/* -------------------------------------------------------------------------- */

export async function listAssets(projectId: number) {
  const db = await getDb();
  if (!db) return memAssets.filter(a => a.projectId === projectId).sort((a, b) => +b.createdAt - +a.createdAt);
  return db.select().from(assets).where(eq(assets.projectId, projectId)).orderBy(desc(assets.createdAt));
}

export async function createAsset(input: InsertAsset) {
  const db = await getDb();
  if (!db) {
    const row: Asset = {
      id: memAssetId++,
      projectId: input.projectId!,
      userId: input.userId!,
      kind: input.kind!,
      fileKey: input.fileKey!,
      url: input.url!,
      filename: input.filename ?? null,
      mimeType: input.mimeType ?? null,
      createdAt: new Date(),
    };
    memAssets.push(row);
    return row;
  }
  const result = await db.insert(assets).values(input);
  const insertId = readInsertId(result);
  if (insertId) {
    const rows = await db.select().from(assets).where(eq(assets.id, insertId)).limit(1);
    if (rows[0]) return rows[0];
  }
  const fallbackRows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.projectId, input.projectId!), eq(assets.fileKey, input.fileKey!)))
    .orderBy(desc(assets.id))
    .limit(1);
  return fallbackRows[0];
}

export async function deleteAsset(userId: number, assetId: number) {
  const db = await getDb();
  if (!db) {
    const idx = memAssets.findIndex(a => a.id === assetId && a.userId === userId);
    if (idx >= 0) memAssets.splice(idx, 1);
    return;
  }
  await db.delete(assets).where(and(eq(assets.id, assetId), eq(assets.userId, userId)));
}

/* -------------------------------------------------------------------------- */
/* Uploads                                                                    */
/* -------------------------------------------------------------------------- */

export async function getUpload(uploadId: number) {
  const db = await getDb();
  if (!db) return memUploads.find(u => u.id === uploadId);
  const rows = await db.select().from(uploads).where(eq(uploads.id, uploadId)).limit(1);
  return rows[0];
}

export async function listUploads(projectId: number) {
  const db = await getDb();
  if (!db) return memUploads.filter(u => u.projectId === projectId).sort((a, b) => +b.createdAt - +a.createdAt);
  return db.select().from(uploads).where(eq(uploads.projectId, projectId)).orderBy(desc(uploads.createdAt));
}

export async function createUpload(input: InsertUpload) {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const row: Upload = {
      id: memUploadId++,
      projectId: input.projectId!,
      userId: input.userId!,
      platform: input.platform!,
      caption: input.caption ?? null,
      hashtags: input.hashtags ?? null,
      status: (input.status ?? "pending") as Upload["status"],
      externalUrl: input.externalUrl ?? null,
      errorMessage: input.errorMessage ?? null,
      createdAt: now,
      updatedAt: now,
    };
    memUploads.push(row);
    return row;
  }
  const result = await db.insert(uploads).values(input);
  const insertId = readInsertId(result);
  if (insertId) {
    const rows = await db.select().from(uploads).where(eq(uploads.id, insertId)).limit(1);
    if (rows[0]) return rows[0];
  }
  const fallbackRows = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.projectId, input.projectId!), eq(uploads.platform, input.platform!)))
    .orderBy(desc(uploads.id))
    .limit(1);
  return fallbackRows[0];
}

export async function updateUpload(uploadId: number, patch: Partial<InsertUpload>) {
  const db = await getDb();
  if (!db) {
    const idx = memUploads.findIndex(u => u.id === uploadId);
    if (idx < 0) return undefined;
    memUploads[idx] = { ...memUploads[idx], ...patch, updatedAt: new Date() };
    return memUploads[idx];
  }
  await db.update(uploads).set(patch).where(eq(uploads.id, uploadId));
  const rows = await db.select().from(uploads).where(eq(uploads.id, uploadId)).limit(1);
  return rows[0];
}
