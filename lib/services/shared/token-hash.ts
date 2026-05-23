import { createHmac, randomBytes } from "node:crypto";
import { getRequiredEnv } from "@/lib/env";

export function generatePortalToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPortalToken(
  token: string,
  secret = getRequiredEnv("TOKEN_HASH_SECRET"),
): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}
