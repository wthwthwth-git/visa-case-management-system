import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getOptionalEnv,
  getRequiredEnv,
  getRequiredNumberEnv,
  MissingEnvironmentVariableError,
} from "./env";

describe("env helper", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a required environment variable when present", () => {
    vi.stubEnv("SEED_REQUIRED_ENV", "present-value");

    expect(getRequiredEnv("SEED_REQUIRED_ENV")).toBe("present-value");
  });

  it("returns undefined for an optional missing or blank environment variable", () => {
    vi.stubEnv("SEED_OPTIONAL_ENV", "");

    expect(getOptionalEnv("SEED_MISSING_OPTIONAL_ENV")).toBeUndefined();
    expect(getOptionalEnv("SEED_OPTIONAL_ENV")).toBeUndefined();
  });

  it("throws MissingEnvironmentVariableError when a required variable is missing", () => {
    expect(() => getRequiredEnv("SEED_MISSING_SECRET")).toThrow(
      MissingEnvironmentVariableError,
    );
  });

  it("does not include environment values in missing variable errors", () => {
    vi.stubEnv("SEED_SECRET_VALUE", "super-secret-value");

    let error: unknown;
    try {
      getRequiredEnv("SEED_MISSING_SECRET");
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(MissingEnvironmentVariableError);
    expect(String(error)).toContain("SEED_MISSING_SECRET");
    expect(String(error)).not.toContain("super-secret-value");
  });

  it("parses a required number environment variable", () => {
    vi.stubEnv("SEED_NUMBER_ENV", "42");

    expect(getRequiredNumberEnv("SEED_NUMBER_ENV")).toBe(42);
  });

  it("throws the same safe error for invalid number variables", () => {
    vi.stubEnv("SEED_INVALID_NUMBER_ENV", "not-a-number");

    expect(() => getRequiredNumberEnv("SEED_INVALID_NUMBER_ENV")).toThrow(
      MissingEnvironmentVariableError,
    );
  });
});
