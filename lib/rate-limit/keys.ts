import { createHash } from "node:crypto";
import type { RateLimitKeyType, RateLimitRouteGroup } from "./types";

export type RateLimitKey = {
  key: string;
  keyType: RateLimitKeyType;
};

function normalizePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9:_-]/g, "_");
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function getRequestPath(request: Request): string | null {
  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    const firstForwardedIp = forwardedFor.split(",")[0]?.trim();

    if (firstForwardedIp) {
      return firstForwardedIp;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || "unknown";
}

export function buildIpRateLimitKey(request: Request, routeGroup: RateLimitRouteGroup): RateLimitKey {
  return {
    key: `ip:${hashValue(getClientIp(request))}:${routeGroup}`,
    keyType: "ip",
  };
}

export function buildAdminRateLimitKey(input: {
  adminId: string;
  routeGroup: RateLimitRouteGroup;
}): RateLimitKey {
  return {
    key: `admin:${normalizePart(input.adminId)}:${input.routeGroup}`,
    keyType: "admin",
  };
}

export function buildAdminUploadRateLimitKey(input: {
  adminId: string;
  requirementId: string;
}): RateLimitKey {
  return {
    key: `admin-upload:${normalizePart(input.adminId)}:${normalizePart(input.requirementId)}`,
    keyType: "admin_upload",
  };
}

export function buildPortalRateLimitKey(input: {
  tokenId: string;
  caseId: string;
  routeGroup: RateLimitRouteGroup;
}): RateLimitKey {
  return {
    key: `portal:${normalizePart(input.tokenId)}:${normalizePart(input.caseId)}:${input.routeGroup}`,
    keyType: "portal",
  };
}

export function buildPortalUploadRateLimitKey(input: {
  tokenId: string;
  requirementId: string;
}): RateLimitKey {
  return {
    key: `portal-upload:${normalizePart(input.tokenId)}:${normalizePart(input.requirementId)}`,
    keyType: "portal_upload",
  };
}
