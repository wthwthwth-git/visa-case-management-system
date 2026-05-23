import { Redis } from "@upstash/redis";
import { getOptionalEnv, MissingEnvironmentVariableError } from "@/lib/env";
import { inMemoryRateLimitAdapter } from "./in-memory";
import { UpstashRateLimitAdapter } from "./upstash";
import type { RateLimitAdapter } from "./types";

export type RateLimitBackend = "memory" | "upstash";

export class RateLimitConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitConfigurationError";
  }
}

export function getRateLimitBackend(): RateLimitBackend {
  const backend = getOptionalEnv("RATE_LIMIT_BACKEND") ?? defaultRateLimitBackend();

  if (backend !== "memory" && backend !== "upstash") {
    throw new RateLimitConfigurationError("Invalid RATE_LIMIT_BACKEND.");
  }

  if (backend === "memory" && process.env.NODE_ENV === "production") {
    throw new RateLimitConfigurationError("RATE_LIMIT_BACKEND=memory is not allowed in production.");
  }

  return backend;
}

export function createRateLimitAdapterFromEnv(): RateLimitAdapter {
  const backend = getRateLimitBackend();

  if (backend === "memory") {
    return inMemoryRateLimitAdapter;
  }

  const url = getOptionalEnv("UPSTASH_REDIS_REST_URL");
  const token = getOptionalEnv("UPSTASH_REDIS_REST_TOKEN");

  if (!url) {
    throw new MissingEnvironmentVariableError("UPSTASH_REDIS_REST_URL");
  }

  if (!token) {
    throw new MissingEnvironmentVariableError("UPSTASH_REDIS_REST_TOKEN");
  }

  return new UpstashRateLimitAdapter(
    new Redis({
      url,
      token,
    }),
  );
}

function defaultRateLimitBackend(): RateLimitBackend {
  if (process.env.NODE_ENV === "production") {
    throw new RateLimitConfigurationError("RATE_LIMIT_BACKEND=upstash is required in production.");
  }

  return "memory";
}
