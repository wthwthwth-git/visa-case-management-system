import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const workspaceRoot = process.cwd();
const catalogPath = path.join(workspaceRoot, "data", "visa-templates", "visa-template-catalog.json");
const manualReviewPath = path.join(workspaceRoot, "data", "visa-templates", "manual-review-items.json");
const outputDir = path.join(workspaceRoot, "outputs", "template-editing");
const outputPath = path.join(outputDir, "visa-template-editing-workbook.xlsx");

function asText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value);
}

function countBy(items, predicate) {
  return items.reduce((count, item) => count + (predicate(item) ? 1 : 0), 0);
}

function writeSheet(sheet, rows, tableName) {
  if (rows.length === 0) {
    return;
  }

  const colCount = rows[0].length;
  const rowCount = rows.length;
  const range = sheet.getRangeByIndexes(0, 0, rowCount, colCount);
  range.values = rows;

  const header = sheet.getRangeByIndexes(0, 0, 1, colCount);
  header.format = {
    fill: "#1D4ED8",
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true,
  };

  const used = sheet.getRangeByIndexes(0, 0, rowCount, colCount);
  used.format = {
    wrapText: true,
    verticalAlignment: "Top",
  };

  sheet.freezePanes.freezeRows(1);
  sheet.tables.add(
    sheet.getRangeByIndexes(0, 0, rowCount, colCount),
    true,
    tableName,
  );
}

function setWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, 1, 1).format.columnWidthPx = width;
  });
}

function buildWorkbook(catalog, manualReviewItems) {
  const workbook = Workbook.create();

  const summary = workbook.worksheets.add("说明");
  summary.showGridLines = false;
  summary.getRange("A1:E1").merge();
  summary.getRange("A1:E1").values = [["签证模板编辑工作簿"]];
  summary.getRange("A1:E1").format = {
    fill: "#0F172A",
    font: { bold: true, color: "#FFFFFF", size: 16 },
  };
  summary.getRange("A3:B12").values = [
    ["用途", "从固定模板源 JSON 提取，供人工整理和修改模板数据。"],
    ["模板数", catalog.counts.templateCount],
    ["材料项数", catalog.counts.detailItemCount],
    ["客户材料项", catalog.counts.customerItemCount],
    ["事务所材料项", catalog.counts.officeItemCount],
    ["人工复核项", catalog.counts.manualReviewItemCount],
    ["主键说明", "templateKey + version 定位模板；templateKey + version + itemKey 定位材料项。"],
    ["建议修改", "优先改 title、customerInstruction、responsibleParty、sortOrder、isRequired、acceptedFileTypesDescription。"],
    ["不要改动", "不要随意改 templateKey、version、itemKey，除非你明确要创建新模板或重建映射。"],
    ["来源", "data/visa-templates/visa-template-catalog.json"],
  ];
  summary.getRange("A3:A12").format = {
    fill: "#E0F2FE",
    font: { bold: true, color: "#0F172A" },
  };
  summary.getRange("A3:B12").format = { wrapText: true, verticalAlignment: "Top" };
  setWidths(summary, [150, 640, 120, 120, 120]);

  const templateRows = [
    [
      "sourcePathNo",
      "templateKey",
      "version",
      "title",
      "currentVisaType",
      "targetVisaType",
      "applicationScenario",
      "status",
      "itemCount",
      "customerItemCount",
      "officeItemCount",
      "manualReviewCount",
    ],
    ...catalog.templates.map((template) => [
      template.sourcePathNo,
      template.templateKey,
      template.version,
      template.title,
      template.currentVisaType,
      template.targetVisaType,
      template.applicationScenario,
      template.status,
      template.itemCount,
      countBy(template.items, (item) => item.responsibleParty === "customer"),
      countBy(template.items, (item) => item.responsibleParty === "office"),
      countBy(template.items, (item) => item.needsManualReview),
    ]),
  ];
  const templatesSheet = workbook.worksheets.add("模板总览");
  writeSheet(templatesSheet, templateRows, "Templates");
  setWidths(templatesSheet, [110, 160, 70, 260, 160, 180, 180, 90, 90, 120, 120, 130]);

  const itemRows = [
    [
      "templateKey",
      "version",
      "sourcePathNo",
      "currentVisaType",
      "targetVisaType",
      "applicationScenario",
      "itemKey",
      "sortOrder",
      "responsibleParty",
      "title",
      "customerInstruction",
      "acceptedFileTypesDescription",
      "isRequired",
      "classificationConfidence",
      "needsManualReview",
      "classificationMatchedPatterns",
    ],
  ];

  for (const template of catalog.templates) {
    for (const item of template.items) {
      itemRows.push([
        template.templateKey,
        template.version,
        template.sourcePathNo,
        template.currentVisaType,
        template.targetVisaType,
        template.applicationScenario,
        item.itemKey,
        item.sortOrder,
        item.responsibleParty,
        item.title,
        asText(item.customerInstruction),
        asText(item.acceptedFileTypesDescription),
        item.isRequired,
        item.classificationConfidence,
        item.needsManualReview,
        asText(item.classificationMatchedPatterns),
      ]);
    }
  }

  const itemsSheet = workbook.worksheets.add("材料项明细");
  writeSheet(itemsSheet, itemRows, "TemplateItems");
  setWidths(itemsSheet, [150, 70, 90, 160, 180, 170, 110, 90, 120, 260, 460, 220, 90, 150, 130, 280]);

  const reviewHeaders = new Set();
  for (const item of manualReviewItems) {
    Object.keys(item).forEach((key) => reviewHeaders.add(key));
  }
  const reviewColumns = Array.from(reviewHeaders);
  const reviewRows = [
    reviewColumns,
    ...manualReviewItems.map((item) => reviewColumns.map((column) => asText(item[column]))),
  ];
  const reviewSheet = workbook.worksheets.add("人工复核项");
  writeSheet(reviewSheet, reviewRows, "ManualReviewItems");
  setWidths(reviewSheet, reviewColumns.map((column) => {
    if (column.toLowerCase().includes("instruction") || column.includes("说明")) return 420;
    if (column.toLowerCase().includes("title") || column.includes("名称")) return 260;
    if (column.toLowerCase().includes("pattern")) return 280;
    return 150;
  }));

  const visaRows = [
    ["currentVisaTypes", "targetVisaTypes"],
  ];
  const maxVisaRows = Math.max(
    catalog.visaTypes.currentVisaTypes.length,
    catalog.visaTypes.targetVisaTypes.length,
  );
  for (let index = 0; index < maxVisaRows; index += 1) {
    visaRows.push([
      catalog.visaTypes.currentVisaTypes[index] ?? "",
      catalog.visaTypes.targetVisaTypes[index] ?? "",
    ]);
  }
  const visaSheet = workbook.worksheets.add("签证类型");
  writeSheet(visaSheet, visaRows, "VisaTypes");
  setWidths(visaSheet, [220, 220]);

  const fieldsRows = [
    ["字段", "含义", "是否建议编辑"],
    ["templateKey", "模板业务 key，用于定位模板。", "一般不要改"],
    ["version", "模板版本。", "一般不要改"],
    ["itemKey", "材料项业务 key，用于定位材料项。", "一般不要改"],
    ["title", "模板名称或材料名称。", "可改"],
    ["customerInstruction", "材料说明，会复制到案件资料项。", "可改"],
    ["responsibleParty", "customer=客户提交；office=事务所制作。", "可改，但只填 customer 或 office"],
    ["sortOrder", "材料排序。", "可改，建议同一模板内唯一递增"],
    ["isRequired", "是否必填。", "可改，填 TRUE/FALSE"],
    ["acceptedFileTypesDescription", "允许文件类型说明。", "可改"],
    ["classificationConfidence", "自动分类置信度。", "参考字段"],
    ["needsManualReview", "是否建议人工复核。", "参考字段"],
  ];
  const fieldsSheet = workbook.worksheets.add("字段说明");
  writeSheet(fieldsSheet, fieldsRows, "FieldGuide");
  setWidths(fieldsSheet, [230, 520, 260]);

  return workbook;
}

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const manualReviewCatalog = JSON.parse(await fs.readFile(manualReviewPath, "utf8"));
const manualReviewItems = Array.isArray(manualReviewCatalog)
  ? manualReviewCatalog
  : manualReviewCatalog.items ?? [];
const workbook = buildWorkbook(catalog, manualReviewItems);

await fs.mkdir(outputDir, { recursive: true });

await workbook.inspect({
  kind: "sheet",
  include: "id,name",
});

await workbook.render({
  sheetName: "说明",
  autoCrop: "all",
  scale: 1,
  format: "png",
});

const exported = await SpreadsheetFile.exportXlsx(workbook);
await exported.save(outputPath);

console.log(JSON.stringify({
  outputPath,
  templates: catalog.templates.length,
  items: catalog.templates.reduce((sum, template) => sum + template.items.length, 0),
  manualReviewItems: manualReviewItems.length,
}));
