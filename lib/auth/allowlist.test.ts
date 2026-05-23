import { describe, expect, it } from "vitest";
import { isAdminEmailAllowed, normalizeAdminEmail, parseAdminEmailAllowlist } from "./allowlist";

describe("admin auth allowlist", () => {
  it("normalizes emails", () => {
    expect(normalizeAdminEmail(" Admin@Example.COM ")).toBe("admin@example.com");
  });

  it("parses comma-separated allowlist values", () => {
    expect([...parseAdminEmailAllowlist("Admin@Example.com, owner@example.com, ")]).toEqual([
      "admin@example.com",
      "owner@example.com",
    ]);
  });

  it("allows only normalized matching emails", () => {
    expect(isAdminEmailAllowed("ADMIN@example.com", "admin@example.com")).toBe(true);
    expect(isAdminEmailAllowed("other@example.com", "admin@example.com")).toBe(false);
  });

  it("does not allow anyone when allowlist is empty", () => {
    expect(isAdminEmailAllowed("admin@example.com", "")).toBe(false);
    expect(isAdminEmailAllowed("admin@example.com", undefined)).toBe(false);
  });
});
