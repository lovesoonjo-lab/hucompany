import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, upsertUser } from "../db";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  if (ENV.useManusAuth) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      // Authentication is optional for public procedures.
      user = null;
    }
  } else {
    const localOpenId = "local-dev-user";
    try {
      await upsertUser({
        openId: localOpenId,
        name: "Local User",
        loginMethod: "local",
        role: "admin",
        lastSignedIn: new Date(),
      });
      user = (await getUserByOpenId(localOpenId)) ?? null;
    } catch (error) {
      // Keep development unblocked even when DB user upsert fails.
      user = {
        id: 0,
        openId: localOpenId,
        name: "Local User",
        email: null,
        loginMethod: "local",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
