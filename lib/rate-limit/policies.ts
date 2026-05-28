import type { RateLimitPolicy, RateLimitRouteGroup } from "./types";

export const rateLimitPolicies: Record<RateLimitRouteGroup, RateLimitPolicy> = {
  portal_case: {
    routeGroup: "portal_case",
    limit: 60,
    windowSeconds: 300,
  },
  portal_signed_url: {
    routeGroup: "portal_signed_url",
    limit: 60,
    windowSeconds: 300,
  },
  portal_upload: {
    routeGroup: "portal_upload",
    limit: 120,
    windowSeconds: 600,
  },
  portal_confirmation: {
    routeGroup: "portal_confirmation",
    limit: 40,
    windowSeconds: 600,
  },
  admin_mutation: {
    routeGroup: "admin_mutation",
    limit: 200,
    windowSeconds: 600,
  },
  admin_destructive: {
    routeGroup: "admin_destructive",
    limit: 100,
    windowSeconds: 600,
  },
  admin_token_mutation: {
    routeGroup: "admin_token_mutation",
    limit: 100,
    windowSeconds: 600,
  },
  admin_upload: {
    routeGroup: "admin_upload",
    limit: 100,
    windowSeconds: 600,
  },
  admin_login: {
    routeGroup: "admin_login",
    limit: 50,
    windowSeconds: 600,
  },
  auth_callback: {
    routeGroup: "auth_callback",
    limit: 50,
    windowSeconds: 600,
  },
};

export function getRateLimitPolicy(routeGroup: RateLimitRouteGroup): RateLimitPolicy {
  return rateLimitPolicies[routeGroup];
}
