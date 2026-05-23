import { describe, expect, it } from "vitest";
import { jsonData } from "./response";

describe("api response helper", () => {
  it("wraps successful responses in data", async () => {
    const response = jsonData({
      id: "value",
    });

    await expect(response.json()).resolves.toEqual({
      data: {
        id: "value",
      },
    });
    expect(response.status).toBe(200);
  });
});
