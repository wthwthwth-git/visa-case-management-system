import { afterEach, describe, expect, it, vi } from "vitest";
import { MissingEnvironmentVariableError } from "@/lib/env";
import { generatePortalToken, hashPortalToken } from "./token-hash";

describe("portal token hash", () => {
  const secret = "seed-test-token-hash-secret";

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("generates a random base64url token", () => {
    const token = generatePortalToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it("returns the same hash for the same token and secret", () => {
    const token = "seed-plaintext-token";

    expect(hashPortalToken(token, secret)).toBe(hashPortalToken(token, secret));
  });

  it("returns different hashes for different tokens", () => {
    expect(hashPortalToken("seed-token-a", secret)).not.toBe(
      hashPortalToken("seed-token-b", secret),
    );
  });

  it("does not include the original token in the hash", () => {
    const token = "seed-plaintext-token";
    const hash = hashPortalToken(token, secret);

    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("throws a clear environment error when TOKEN_HASH_SECRET is missing", () => {
    vi.stubEnv("TOKEN_HASH_SECRET", "");

    expect(() => hashPortalToken("seed-plaintext-token")).toThrow(
      MissingEnvironmentVariableError,
    );
  });
});
