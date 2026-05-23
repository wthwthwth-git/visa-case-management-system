import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRateLimitAdapterFromEnv,
  getRateLimitBackend,
  RateLimitConfigurationError,
} from "./config";
import { InMemoryRateLimitAdapter } from "./in-memory";
import { UpstashRateLimitAdapter } from "./upstash";

describe("rate limit backend config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to memory outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("RATE_LIMIT_BACKEND", "");

    expect(getRateLimitBackend()).toBe("memory");
    expect(createRateLimitAdapterFromEnv()).toBeInstanceOf(InMemoryRateLimitAdapter);
  });

  it("forbids memory backend in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_LIMIT_BACKEND", "memory");

    expect(() => getRateLimitBackend()).toThrow(RateLimitConfigurationError);
  });

  it("requires explicit production backend", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_LIMIT_BACKEND", "");

    expect(() => getRateLimitBackend()).toThrow(RateLimitConfigurationError);
  });

  it("requires Upstash env when backend is upstash", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("RATE_LIMIT_BACKEND", "upstash");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

    expect(() => createRateLimitAdapterFromEnv()).toThrow("UPSTASH_REDIS_REST_URL");
  });

  it("creates Upstash adapter when Upstash env exists", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("RATE_LIMIT_BACKEND", "upstash");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");

    expect(createRateLimitAdapterFromEnv()).toBeInstanceOf(UpstashRateLimitAdapter);
  });

  it("rejects unknown backend values", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("RATE_LIMIT_BACKEND", "postgres");

    expect(() => getRateLimitBackend()).toThrow(RateLimitConfigurationError);
  });
});
