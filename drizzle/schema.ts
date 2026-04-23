import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * User-level settings — stores Krea AI API key and preferences.
 * NOTE: For demo purposes we persist the API key in plaintext. In production use envelope encryption.
 */
export const userSettings = mysqlTable("user_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  kreaApiKey: text("kreaApiKey"),
  uploadPostApiKey: text("uploadPostApiKey"),
  // --- Google Cloud Storage (GCS) auto-upload configuration ---
  // Stored at the user level. Project-scoped artifacts (reference/, scripts/,
  // audio/, subtitles/, images/, videos/, final/) are pushed to this bucket
  // when configured. Private key is the JSON private_key value (with \n
  // line breaks preserved) issued for the service account.
  gcsProjectId: varchar("gcsProjectId", { length: 255 }),
  gcsBucketName: varchar("gcsBucketName", { length: 255 }),
  gcsServiceAccountEmail: varchar("gcsServiceAccountEmail", { length: 320 }),
  gcsPrivateKey: text("gcsPrivateKey"),
  gcsVerifiedAt: timestamp("gcsVerifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = typeof userSettings.$inferInsert;

/**
 * A project (a.k.a. campaign) — groups scenes, assets and uploads.
 */
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  aspectRatio: mysqlEnum("aspectRatio", ["9:16", "16:9", "1:1"]).default("9:16").notNull(),
  targetPlatforms: json("targetPlatforms").$type<string[]>(),
  script: text("script"),
  status: mysqlEnum("status", ["draft", "analyzing", "prompting", "imaging", "video", "uploading", "done"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

/**
 * A scene within a project.
 */
export const scenes = mysqlTable("scenes", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  sceneIndex: int("sceneIndex").notNull(),
  scriptExcerpt: text("scriptExcerpt"),
  // Scene analysis (stored as JSON)
  visualElements: json("visualElements"), // { characters, backgrounds, props, products, actions }
  mood: varchar("mood", { length: 255 }),
  cameraAngle: varchar("cameraAngle", { length: 255 }),
  // Prompt
  imagePrompt: text("imagePrompt"),
  // Image generation
  imageModel: varchar("imageModel", { length: 64 }),
  imageUrl: text("imageUrl"),
  imageStatus: mysqlEnum("imageStatus", ["pending", "generating", "ready", "failed"]).default("pending").notNull(),
  upscaled: boolean("upscaled").default(false).notNull(),
  // Video generation
  videoModel: varchar("videoModel", { length: 64 }),
  videoDuration: int("videoDuration").default(6).notNull(),
  videoUrl: text("videoUrl"),
  videoStatus: mysqlEnum("videoStatus", ["pending", "generating", "ready", "failed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Scene = typeof scenes.$inferSelect;
export type InsertScene = typeof scenes.$inferInsert;

/**
 * Uploaded assets (product photos, reference person photos).
 */
export const assets = mysqlTable("assets", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  kind: mysqlEnum("kind", ["product", "person"]).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  url: varchar("url", { length: 512 }).notNull(),
  filename: varchar("filename", { length: 255 }),
  mimeType: varchar("mimeType", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Asset = typeof assets.$inferSelect;
export type InsertAsset = typeof assets.$inferInsert;

/**
 * SNS upload records.
 */
export const uploads = mysqlTable("uploads", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  // Enum keeps legacy labels ("Instagram Reels", "YouTube Shorts") so historical
  // rows remain readable; new writes always use the canonical ids.
  platform: mysqlEnum("platform", [
    "TikTok",
    "Instagram",
    "YouTube",
    "Facebook",
    "Instagram Reels",
    "YouTube Shorts",
  ]).notNull(),
  caption: text("caption"),
  hashtags: text("hashtags"),
  status: mysqlEnum("status", ["pending", "uploading", "success", "failed"]).default("pending").notNull(),
  externalUrl: text("externalUrl"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Upload = typeof uploads.$inferSelect;
export type InsertUpload = typeof uploads.$inferInsert;
