import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, upsertUser } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

let localUserCache: User | null = null;

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  const localOpenId = "local-dev-user";
  const fallbackUser: User = {
    // Keep a stable fallback id so data ownership doesn't flip between requests.
    id: localUserCache?.id ?? 1,
    openId: localOpenId,
    name: "Local User",
    email: null,
    loginMethod: "local",
    role: "admin",
    createdAt: localUserCache?.createdAt ?? new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  try {
    await upsertUser({
      openId: localOpenId,
      name: "Local User",
      loginMethod: "local",
      role: "admin",
      lastSignedIn: new Date(),
    });
    // DB may be unavailable in local mode; keep auth usable with fallback user.
    const persistedUser = await getUserByOpenId(localOpenId);
    user = persistedUser ?? localUserCache ?? fallbackUser;
    localUserCache = user;
  } catch (error) {
    // Keep development unblocked even when user upsert fails without changing identity.
    try {
      const persistedUser = await getUserByOpenId(localOpenId);
      user = persistedUser ?? localUserCache ?? fallbackUser;
    } catch {
      user = localUserCache ?? fallbackUser;
    }
    localUserCache = user;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
