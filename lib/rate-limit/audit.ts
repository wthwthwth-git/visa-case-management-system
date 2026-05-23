import type { RateLimitAuditInput } from "./types";

const auditThrottle = new Map<string, number>();
const AUDIT_THROTTLE_SECONDS = 60;

function buildAuditThrottleKey(input: RateLimitAuditInput): string {
  const windowBucket = Math.floor(Date.now() / (AUDIT_THROTTLE_SECONDS * 1000));
  return [
    input.routeGroup,
    input.method,
    input.path ?? "unknown",
    input.keyType,
    input.reason,
    windowBucket,
  ].join(":");
}

export function clearRateLimitAuditThrottleForTests() {
  auditThrottle.clear();
}

export async function writeRateLimitAudit(input: RateLimitAuditInput) {
  const throttleKey = buildAuditThrottleKey(input);

  if (auditThrottle.has(throttleKey)) {
    return;
  }

  auditThrottle.set(throttleKey, Date.now());

  try {
    const { writeAdminAuthAudit } = await import("../auth/audit");

    await writeAdminAuthAudit({
      adminUserId: input.adminUserId ?? null,
      email: input.email ?? null,
      eventType: "rate_limit_triggered",
      result: "blocked",
      requestPath: input.path,
      method: input.method,
      reason: input.reason,
      metadata: {
        routeGroup: input.routeGroup,
        method: input.method,
        path: input.path,
        keyType: input.keyType,
        limit: input.limit,
        windowSeconds: input.windowSeconds,
        retryAfterSeconds: input.retryAfterSeconds,
        reason: input.reason,
      },
    });
  } catch {
    // Rate limit audit must not mask the rate limit response or leak internals.
  }
}
