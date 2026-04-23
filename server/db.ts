import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertAsset,
  InsertProject,
  InsertScene,
  InsertUpload,
  InsertUser,
  InsertUserSettings,
  assets,
  projects,
  scenes,
  uploads,
  userSettings,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

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
    console.warn("[Database] Cannot upsert user: database not available");
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
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/* -------------------------------------------------------------------------- */
/* User settings                                                              */
/* -------------------------------------------------------------------------- */

export async function getUserSettings(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return rows[0];
}

export async function upsertUserSettings(input: InsertUserSettings) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const updateSet: Record<string, unknown> = {};
  if (input.kreaApiKey !== undefined) updateSet.kreaApiKey = input.kreaApiKey;
  if (input.uploadPostApiKey !== undefined) updateSet.uploadPostApiKey = input.uploadPostApiKey;
  if (input.gcsProjectId !== undefined) updateSet.gcsProjectId = input.gcsProjectId;
  if (input.gcsBucketName !== undefined) updateSet.gcsBucketName = input.gcsBucketName;
  if (input.gcsServiceAccountEmail !== undefined) updateSet.gcsServiceAccountEmail = input.gcsServiceAccountEmail;
  if (input.gcsPrivateKey !== undefined) updateSet.gcsPrivateKey = input.gcsPrivateKey;
  if (input.gcsVerifiedAt !== undefined) updateSet.gcsVerifiedAt = input.gcsVerifiedAt;

  await db.insert(userSettings).values(input).onDuplicateKeyUpdate({ set: updateSet });
  return getUserSettings(input.userId);
}

/* -------------------------------------------------------------------------- */
/* Projects                                                                   */
/* -------------------------------------------------------------------------- */

export async function listProjects(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.updatedAt));
}

export async function getProject(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.id, projectId)))
    .limit(1);
  return rows[0];
}

export async function createProject(input: InsertProject) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(projects).values(input);
  const insertId = Number((result as unknown as { insertId?: number }).insertId ?? 0);
  if (!insertId) throw new Error("Failed to create project");
  const rows = await db.select().from(projects).where(eq(projects.id, insertId)).limit(1);
  return rows[0];
}

export async function updateProject(
  userId: number,
  projectId: number,
  patch: Partial<InsertProject>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(projects)
    .set(patch)
    .where(and(eq(projects.userId, userId), eq(projects.id, projectId)));
  return getProject(userId, projectId);
}

export async function deleteProject(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
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
  if (!db) return [];
  return db.select().from(scenes).where(eq(scenes.projectId, projectId)).orderBy(scenes.sceneIndex);
}

export async function getScene(sceneId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(scenes).where(eq(scenes.id, sceneId)).limit(1);
  return rows[0];
}

export async function createScene(input: InsertScene) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(scenes).values(input);
  const insertId = Number((result as unknown as { insertId?: number }).insertId ?? 0);
  if (!insertId) throw new Error("Failed to insert scene");
  const rows = await db.select().from(scenes).where(eq(scenes.id, insertId)).limit(1);
  return rows[0];
}

export async function updateScene(sceneId: number, patch: Partial<InsertScene>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(scenes).set(patch).where(eq(scenes.id, sceneId));
  return getScene(sceneId);
}

export async function deleteScenesByProject(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(scenes).where(eq(scenes.projectId, projectId));
}

/* -------------------------------------------------------------------------- */
/* Assets                                                                     */
/* -------------------------------------------------------------------------- */

export async function listAssets(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(assets).where(eq(assets.projectId, projectId)).orderBy(desc(assets.createdAt));
}

export async function createAsset(input: InsertAsset) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(assets).values(input);
  const insertId = Number((result as unknown as { insertId?: number }).insertId ?? 0);
  const rows = await db.select().from(assets).where(eq(assets.id, insertId)).limit(1);
  return rows[0];
}

export async function deleteAsset(userId: number, assetId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(assets).where(and(eq(assets.id, assetId), eq(assets.userId, userId)));
}

/* -------------------------------------------------------------------------- */
/* Uploads                                                                    */
/* -------------------------------------------------------------------------- */

export async function getUpload(uploadId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(uploads).where(eq(uploads.id, uploadId)).limit(1);
  return rows[0];
}

export async function listUploads(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(uploads).where(eq(uploads.projectId, projectId)).orderBy(desc(uploads.createdAt));
}

export async function createUpload(input: InsertUpload) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(uploads).values(input);
  const insertId = Number((result as unknown as { insertId?: number }).insertId ?? 0);
  const rows = await db.select().from(uploads).where(eq(uploads.id, insertId)).limit(1);
  return rows[0];
}

export async function updateUpload(uploadId: number, patch: Partial<InsertUpload>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(uploads).set(patch).where(eq(uploads.id, uploadId));
  const rows = await db.select().from(uploads).where(eq(uploads.id, uploadId)).limit(1);
  return rows[0];
}
