import { describe, expect, it } from "vitest";
import { mapRequirementStatusToPortalStatus } from "./types";

describe("mapRequirementStatusToPortalStatus", () => {
  it("maps approved to accepted", () => {
    expect(mapRequirementStatusToPortalStatus("approved")).toBe("accepted");
  });

  it("keeps other statuses unchanged for portal display", () => {
    expect(mapRequirementStatusToPortalStatus("not_submitted")).toBe("not_submitted");
    expect(mapRequirementStatusToPortalStatus("submitted")).toBe("submitted");
    expect(mapRequirementStatusToPortalStatus("needs_more")).toBe("needs_more");
    expect(mapRequirementStatusToPortalStatus("not_applicable")).toBe("not_applicable");
  });
});
