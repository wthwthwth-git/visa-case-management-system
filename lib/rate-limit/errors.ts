import type { RateLimitRouteGroup } from "./types";

export class RateLimitExceededError extends Error {
  readonly routeGroup: RateLimitRouteGroup;
  readonly retryAfterSeconds: number | null;

  constructor(input: { routeGroup: RateLimitRouteGroup; retryAfterSeconds: number | null }) {
    super("Too many requests. Please try again later.");
    this.name = "RateLimitExceededError";
    this.routeGroup = input.routeGroup;
    this.retryAfterSeconds = input.retryAfterSeconds;
  }
}
