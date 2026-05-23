import { describe, expect, it } from "vitest";
import { displayChineseText, displayVisaType } from "./chinese-display";

describe("Chinese display helpers", () => {
  it("maps Japanese visa type labels to Chinese display labels", () => {
    expect(displayVisaType("高度専門職 学术研究")).toBe("高度专业人才（学术研究）");
    expect(displayVisaType("経営・管理")).toBe("经营管理");
    expect(displayVisaType("技術・人文知識・国際業務")).toBe("技术・人文知识・国际业务");
    expect(displayVisaType("日本人の配偶者等")).toBe("日本人配偶者等");
  });

  it("normalizes template titles and material text for display", () => {
    expect(displayChineseText("无 -> 高度専門職 专业・技术")).toBe(
      "无 → 高度专业人才（专业技术）",
    );
    expect(displayChineseText("使用高度専門職 1 号ロ积分表。")).toBe(
      "使用高度专业人才 1 号ロ积分表。",
    );
  });
});
