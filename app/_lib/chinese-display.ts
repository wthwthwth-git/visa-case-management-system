const visaTypeLabels: Record<string, string> = {
  "高度専門職 学术研究": "高度专业人才（学术研究）",
  "高度専門職 专业・技术": "高度专业人才（专业技术）",
  "高度専門職 经营・管理": "高度专业人才（经营管理）",
  "経営・管理": "经营管理",
  "技術・人文知識・国際業務": "技术・人文知识・国际业务",
  "企業内転勤": "企业内调动",
  "家族滞在": "家属滞在",
  "日本人の配偶者等": "日本人配偶者等",
  "永住者の配偶者等": "永住者配偶者等",
};

const japaneseVisaTypeLabels: Record<string, string> = {
  "无": "なし",
  "高度専門職 学术研究": "高度専門職（学術研究）",
  "高度専門職 专业・技术": "高度専門職（専門・技術）",
  "高度専門職 经营・管理": "高度専門職（経営・管理）",
  "経営・管理": "経営・管理",
  "技術・人文知識・国際業務": "技術・人文知識・国際業務",
  "企業内転勤": "企業内転勤",
  "技能": "技能",
  "特定技能": "特定技能",
  "留学": "留学",
  "家族滞在": "家族滞在",
  "日本人の配偶者等": "日本人の配偶者等",
  "永住者": "永住者",
  "永住者の配偶者等": "永住者の配偶者等",
  "定住者": "定住者",
};

const textReplacements: Array<[RegExp, string]> = [
  [/高度専門職 学术研究/g, "高度专业人才（学术研究）"],
  [/高度専門職 专业・技术/g, "高度专业人才（专业技术）"],
  [/高度専門職 经营・管理/g, "高度专业人才（经营管理）"],
  [/高度専門職/g, "高度专业人才"],
  [/経営・管理/g, "经营管理"],
  [/技術・人文知識・国際業務/g, "技术・人文知识・国际业务"],
  [/企業内転勤/g, "企业内调动"],
  [/家族滞在/g, "家属滞在"],
  [/日本人の配偶者等/g, "日本人配偶者等"],
  [/永住者の配偶者等/g, "永住者配偶者等"],
  [/\s*->\s*/g, " → "],
];

export function displayVisaType(value: string | null | undefined, locale: "zh" | "ja" = "zh"): string {
  if (!value) {
    return "-";
  }

  if (locale === "ja") {
    return japaneseVisaTypeLabels[value] ?? value;
  }

  return visaTypeLabels[value] ?? displayChineseText(value);
}

export function displayChineseText(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return textReplacements.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
}
