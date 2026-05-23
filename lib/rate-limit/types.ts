export type RateLimitRouteGroup =
  | "portal_case"
  | "portal_signed_url"
  | "portal_upload"
  | "portal_confirmation"
  | "admin_mutation"
  | "admin_destructive"
  | "admin_token_mutation"
  | "admin_upload"
  | "admin_login"
  | "auth_callback";

export type RateLimitKeyType =
  | "admin"
  | "admin_upload"
  | "ip"
  | "portal"
  | "portal_upload";

export type RateLimitPolicy = {
  routeGroup: RateLimitRouteGroup;
  limit: number;
  windowSeconds: number;
};

export type RateLimitIncrementInput = {
  key: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitHit = {
  count: number;
  limit: number;
  windowSeconds: number;
  resetAt: Date;
  retryAfterSeconds: number | null;
  allowed: boolean;
};

export type RateLimitAdapter = {
  increment(input: RateLimitIncrementInput): Promise<RateLimitHit>;
};

export type RateLimitAuditInput = {
  routeGroup: RateLimitRouteGroup;
  method: string;
  path: string | null;
  keyType: RateLimitKeyType;
  limit: number;
  windowSeconds: number;
  retryAfterSeconds: number | null;
  reason: string;
  adminUserId?: string | null;
  email?: string | null;
};
