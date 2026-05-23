import { writeRateLimitAudit } from "./audit";
import { createRateLimitAdapterFromEnv } from "./config";
import { inMemoryRateLimitAdapter } from "./in-memory";
import {
  buildAdminRateLimitKey,
  buildAdminUploadRateLimitKey,
  buildIpRateLimitKey,
  buildPortalRateLimitKey,
  buildPortalUploadRateLimitKey,
  getRequestPath,
} from "./keys";
import { getRateLimitPolicy } from "./policies";
import { RateLimitExceededError } from "./errors";
import type { RateLimitAdapter, RateLimitKeyType, RateLimitRouteGroup } from "./types";

type RateLimitKeyInput = {
  key: string;
  keyType: RateLimitKeyType;
};

let activeRateLimitAdapter: RateLimitAdapter = inMemoryRateLimitAdapter;
let hasExplicitRateLimitAdapter = false;

export function setRateLimitAdapterForTests(adapter: RateLimitAdapter) {
  activeRateLimitAdapter = adapter;
  hasExplicitRateLimitAdapter = true;
}

export function resetRateLimitAdapterForTests() {
  activeRateLimitAdapter = inMemoryRateLimitAdapter;
  hasExplicitRateLimitAdapter = true;
  inMemoryRateLimitAdapter.clear();
}

export function resetRateLimitAdapterFromEnvForTests() {
  hasExplicitRateLimitAdapter = false;
  inMemoryRateLimitAdapter.clear();
}

function getActiveRateLimitAdapter() {
  if (!hasExplicitRateLimitAdapter) {
    activeRateLimitAdapter = createRateLimitAdapterFromEnv();
    hasExplicitRateLimitAdapter = true;
  }

  return activeRateLimitAdapter;
}

async function requireRateLimit(input: {
  request: Request;
  routeGroup: RateLimitRouteGroup;
  rateLimitKey: RateLimitKeyInput;
  adminUserId?: string | null;
  email?: string | null;
  reason?: string;
}) {
  const policy = getRateLimitPolicy(input.routeGroup);
  const hit = await getActiveRateLimitAdapter().increment({
    key: input.rateLimitKey.key,
    limit: policy.limit,
    windowSeconds: policy.windowSeconds,
  });

  if (hit.allowed) {
    return hit;
  }

  const auditPath = getSafeRateLimitAuditPath(getRequestPath(input.request));

  await writeRateLimitAudit({
    routeGroup: input.routeGroup,
    method: input.request.method,
    path: auditPath,
    keyType: input.rateLimitKey.keyType,
    limit: hit.limit,
    windowSeconds: hit.windowSeconds,
    retryAfterSeconds: hit.retryAfterSeconds,
    reason: input.reason ?? "rate_limit_exceeded",
    adminUserId: input.adminUserId ?? null,
    email: input.email ?? null,
  });

  throw new RateLimitExceededError({
    routeGroup: input.routeGroup,
    retryAfterSeconds: hit.retryAfterSeconds,
  });
}

function getSafeRateLimitAuditPath(path: string | null): string | null {
  if (!path) {
    return null;
  }

  return path.replace(/^\/api\/portal\/[^/]+/, "/api/portal/[token]");
}

export async function requireAdminRateLimit(
  request: Request,
  input: {
    adminId: string;
    email?: string | null;
    routeGroup: "admin_mutation" | "admin_destructive" | "admin_token_mutation";
  },
) {
  return requireRateLimit({
    request,
    routeGroup: input.routeGroup,
    rateLimitKey: buildAdminRateLimitKey({
      adminId: input.adminId,
      routeGroup: input.routeGroup,
    }),
    adminUserId: input.adminId,
    email: input.email ?? null,
  });
}

export async function requireAdminUploadRateLimit(
  request: Request,
  input: {
    adminId: string;
    email?: string | null;
    requirementId: string;
  },
) {
  return requireRateLimit({
    request,
    routeGroup: "admin_upload",
    rateLimitKey: buildAdminUploadRateLimitKey({
      adminId: input.adminId,
      requirementId: input.requirementId,
    }),
    adminUserId: input.adminId,
    email: input.email ?? null,
  });
}

export async function requirePortalPreValidationRateLimit(
  request: Request,
  routeGroup: "portal_case" | "portal_signed_url" | "portal_upload" | "portal_confirmation",
) {
  return requireRateLimit({
    request,
    routeGroup,
    rateLimitKey: buildIpRateLimitKey(request, routeGroup),
    reason: "portal_pre_validation_rate_limit_exceeded",
  });
}

export async function requirePortalPostValidationRateLimit(
  request: Request,
  input: {
    routeGroup: "portal_case" | "portal_signed_url" | "portal_confirmation";
    tokenId: string;
    caseId: string;
  },
) {
  return requireRateLimit({
    request,
    routeGroup: input.routeGroup,
    rateLimitKey: buildPortalRateLimitKey({
      tokenId: input.tokenId,
      caseId: input.caseId,
      routeGroup: input.routeGroup,
    }),
    reason: "portal_post_validation_rate_limit_exceeded",
  });
}

export async function requirePortalUploadRateLimit(
  request: Request,
  input: {
    tokenId: string;
    requirementId: string;
  },
) {
  return requireRateLimit({
    request,
    routeGroup: "portal_upload",
    rateLimitKey: buildPortalUploadRateLimitKey({
      tokenId: input.tokenId,
      requirementId: input.requirementId,
    }),
    reason: "portal_upload_rate_limit_exceeded",
  });
}
