import fs from "node:fs/promises";
import path from "node:path";

const workspaceRoot = process.cwd();
const reviewPath = path.join(
  workspaceRoot,
  "outputs",
  "template-editing",
  "visa-template-review-simple.md",
);
const catalogPath = path.join(workspaceRoot, "data", "visa-templates", "visa-template-catalog.json");
const jaOutputPath = path.join(
  workspaceRoot,
  "data",
  "visa-templates",
  "visa-template-translations-ja.json",
);

const fieldLabels = [
  "处理方式",
  "原归属",
  "修改后归属",
  "原材料名",
  "修改后材料名",
  "日语材料名",
  "修改后日语材料名",
  "原说明",
  "修改后说明",
  "日语说明",
  "修改后日语说明",
  "原排序",
  "修改后排序",
  "原必填",
  "修改后必填",
  "原文件类型说明",
  "修改后文件类型说明",
  "修改备注",
];

const visaTypeJa = new Map([
  ["无", "なし"],
  ["高度専門職 学术研究", "高度専門職（学術研究）"],
  ["高度専門職 专业・技术", "高度専門職（専門・技術）"],
  ["高度専門職 经营・管理", "高度専門職（経営・管理）"],
  ["経営・管理", "経営・管理"],
  ["技术・人文知识・国际业务", "技術・人文知識・国際業務"],
  ["企业内转勤", "企業内転勤"],
  ["技能", "技能"],
  ["特定技能", "特定技能"],
  ["留学", "留学"],
  ["家族滞在", "家族滞在"],
  ["日本人配偶者等", "日本人の配偶者等"],
  ["永住者", "永住者"],
  ["永住者配偶者等", "永住者の配偶者等"],
  ["定住者", "定住者"],
]);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readLineValue(block, label) {
  const pattern = new RegExp(`^- ${escapeRegex(label)}：([^\\n]*)`, "m");
  const match = block.match(pattern);
  return match ? match[1].trim() : "";
}

function normalizeEmpty(value) {
  const trimmed = value.trim();
  return !trimmed || trimmed === "无" ? "" : trimmed;
}

function parseParty(value) {
  const normalized = normalizeEmpty(value);
  if (normalized.startsWith("客户")) {
    return "customer";
  }
  if (normalized.startsWith("事务所")) {
    return "office";
  }
  throw new Error(`Unknown responsible party: ${value}`);
}

function parseRequired(value) {
  const normalized = normalizeEmpty(value);
  if (normalized === "是") {
    return true;
  }
  if (normalized === "否") {
    return false;
  }
  throw new Error(`Unknown required value: ${value}`);
}

function parseSortOrder(value, fallback) {
  const normalized = normalizeEmpty(value);
  if (!normalized) {
    return fallback;
  }
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid sort order: ${value}`);
  }
  return parsed;
}

function getTemplateItemKey(block) {
  const match = block.match(/<!--\s*templateKey=([^\s]+)\s+version=(\d+)\s+itemKey=([^\s]+)\s*-->/);
  if (!match) {
    return null;
  }
  return {
    templateKey: match[1],
    version: Number.parseInt(match[2], 10),
    itemKey: match[3],
  };
}

function parseReviewBlocks(markdown) {
  const reviewItems = new Map();
  const blocks = markdown.split(/(?=^#### )/m);

  for (const block of blocks) {
    if (!block.startsWith("#### ")) {
      continue;
    }

    const ref = getTemplateItemKey(block);
    if (!ref) {
      continue;
    }

    const key = `${ref.templateKey}:${ref.version}:${ref.itemKey}`;
    const fields = Object.fromEntries(fieldLabels.map((label) => [label, readLineValue(block, label)]));
    reviewItems.set(key, { ...ref, fields });
  }

  return reviewItems;
}

function buildTemplateTitleJa(template) {
  const current = visaTypeJa.get(template.currentVisaType) ?? template.currentVisaType;
  const target = visaTypeJa.get(template.targetVisaType) ?? template.targetVisaType;

  if (template.currentVisaType === "无") {
    return `${target} 認定申請`;
  }

  if (template.currentVisaType === template.targetVisaType) {
    return `${target} 更新申請`;
  }

  return `${current}から${target}への変更申請`;
}

function updateCounts(catalog) {
  let detailItemCount = 0;
  let customerItemCount = 0;
  let officeItemCount = 0;
  let manualReviewItemCount = 0;
  const uniqueTitles = new Set();

  for (const template of catalog.templates) {
    template.items.sort((left, right) => left.sortOrder - right.sortOrder);
    template.itemCount = template.items.length;
    template.customerItemCount = template.items.filter((item) => item.responsibleParty === "customer").length;
    template.officeItemCount = template.items.filter((item) => item.responsibleParty === "office").length;

    detailItemCount += template.itemCount;
    customerItemCount += template.customerItemCount;
    officeItemCount += template.officeItemCount;

    for (const item of template.items) {
      uniqueTitles.add(item.title);
      if (item.needsManualReview) {
        manualReviewItemCount += 1;
      }
    }
  }

  catalog.counts.templateCount = catalog.templates.length;
  catalog.counts.detailItemCount = detailItemCount;
  catalog.counts.uniqueMaterialTitleCount = uniqueTitles.size;
  catalog.counts.manualReviewItemCount = manualReviewItemCount;
  catalog.counts.customerItemCount = customerItemCount;
  catalog.counts.officeItemCount = officeItemCount;
}

const [markdown, catalogRaw] = await Promise.all([
  fs.readFile(reviewPath, "utf8"),
  fs.readFile(catalogPath, "utf8"),
]);

const catalog = JSON.parse(catalogRaw);
const reviewItems = parseReviewBlocks(markdown);
const translations = {
  schemaVersion: 1,
  locale: "ja",
  generatedFrom: "outputs/template-editing/visa-template-review-simple.md",
  templates: {},
};

let updatedItems = 0;
let deletedItems = 0;
let missingReviewItems = 0;

for (const template of catalog.templates) {
  const templateTranslationKey = `${template.templateKey}:${template.version}`;
  const itemTranslations = {};
  const retainedItems = [];

  translations.templates[templateTranslationKey] = {
    title: buildTemplateTitleJa(template),
    items: itemTranslations,
  };

  for (const item of template.items) {
    const reviewKey = `${template.templateKey}:${template.version}:${item.itemKey}`;
    const review = reviewItems.get(reviewKey);

    if (!review) {
      missingReviewItems += 1;
      retainedItems.push(item);
      itemTranslations[item.itemKey] = {
        title: item.title,
        customerInstruction: item.customerInstruction,
      };
      continue;
    }

    const action = normalizeEmpty(review.fields["处理方式"]) || "保留";
    if (action === "删除") {
      deletedItems += 1;
      continue;
    }
    if (action !== "保留" && action !== "待确认") {
      throw new Error(`Unsupported action "${action}" for ${reviewKey}.`);
    }

    const nextTitle =
      normalizeEmpty(review.fields["修改后材料名"]) ||
      normalizeEmpty(review.fields["原材料名"]) ||
      item.title;
    const nextInstruction =
      normalizeEmpty(review.fields["修改后说明"]) ||
      normalizeEmpty(review.fields["原说明"]) ||
      item.customerInstruction;
    const nextFileType =
      normalizeEmpty(review.fields["修改后文件类型说明"]) ||
      normalizeEmpty(review.fields["原文件类型说明"]) ||
      item.acceptedFileTypesDescription;

    item.title = nextTitle;
    item.customerInstruction = nextInstruction || null;
    item.responsibleParty = parseParty(
      review.fields["修改后归属"] || review.fields["原归属"] || item.responsibleParty,
    );
    item.isRequired = parseRequired(review.fields["修改后必填"] || review.fields["原必填"]);
    item.sortOrder = parseSortOrder(review.fields["修改后排序"], item.sortOrder);
    item.acceptedFileTypesDescription = nextFileType || null;

    itemTranslations[item.itemKey] = {
      title:
        normalizeEmpty(review.fields["修改后日语材料名"]) ||
        normalizeEmpty(review.fields["日语材料名"]) ||
        nextTitle,
      customerInstruction:
        normalizeEmpty(review.fields["修改后日语说明"]) ||
        normalizeEmpty(review.fields["日语说明"]) ||
        item.customerInstruction,
    };

    retainedItems.push(item);
    updatedItems += 1;
  }

  template.items = retainedItems;
}

updateCounts(catalog);

await Promise.all([
  fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8"),
  fs.writeFile(jaOutputPath, `${JSON.stringify(translations, null, 2)}\n`, "utf8"),
]);

console.log(
  JSON.stringify(
    {
      catalogPath,
      jaOutputPath,
      reviewItems: reviewItems.size,
      updatedItems,
      deletedItems,
      missingReviewItems,
      counts: catalog.counts,
    },
    null,
    2,
  ),
);
