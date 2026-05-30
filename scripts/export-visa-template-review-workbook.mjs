import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const workspaceRoot = process.cwd();
const catalogPath = path.join(workspaceRoot, "data", "visa-templates", "visa-template-catalog.json");
const outputDir = path.join(workspaceRoot, "outputs", "template-editing");
const outputPath = path.join(outputDir, "visa-template-review-simple.xlsx");

function blankIfNull(value) {
  return value === null || value === undefined ? "" : value;
}

function humanParty(value) {
  return value === "office" ? "事务所材料" : "客户材料";
}

function writeRows(sheet, rows, tableName) {
  const rowCount = rows.length;
  const colCount = rows[0].length;
  const range = sheet.getRangeByIndexes(0, 0, rowCount, colCount);
  range.values = rows;
  range.format = {
    wrapText: true,
    verticalAlignment: "Top",
  };

  const header = sheet.getRangeByIndexes(0, 0, 1, colCount);
  header.format = {
    fill: "#0F172A",
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true,
  };

  sheet.freezePanes.freezeRows(1);
  sheet.tables.add(sheet.getRangeByIndexes(0, 0, rowCount, colCount), true, tableName);
}

function setWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, 1, 1).format.columnWidthPx = width;
  });
}

function addListValidation(sheet, columnIndex, startRowIndex, rowCount, values) {
  sheet.getRangeByIndexes(startRowIndex, columnIndex, rowCount, 1).dataValidation = {
    rule: {
      type: "list",
      values,
    },
  };
}

function buildWorkbook(catalog) {
  const workbook = Workbook.create();

  const guide = workbook.worksheets.add("怎么修改");
  guide.showGridLines = false;
  guide.getRange("A1:F1").merge();
  guide.getRange("A1:F1").values = [["签证模板材料逐项确认表"]];
  guide.getRange("A1:F1").format = {
    fill: "#1D4ED8",
    font: { bold: true, color: "#FFFFFF", size: 16 },
  };
  guide.getRange("A3:B13").values = [
    ["你主要修改哪里", "打开「逐项确认」sheet。每一行是一条材料。"],
    ["怎么确认签证情况", "用筛选器筛选「路径序号 / 现有签证 / 申请签证 / 申请场景」。"],
    ["保留还是删除", "在「处理方式」选择：保留、删除、待确认。"],
    ["客户/事务所", "在「修改后归属」选择：客户材料、事务所材料。"],
    ["材料名", "需要改名就填「修改后材料名」；不填表示沿用原材料名。"],
    ["说明", "需要改说明就填「修改后说明」；不填表示沿用原说明。"],
    ["排序", "需要调顺序就填「修改后排序」；不填表示沿用原排序。"],
    ["必填", "需要改必填就填「修改后必填」。"],
    ["新增材料", "直接在对应模板下面新增一行，处理方式填「新增」，并保留 templateKey/version。"],
    ["不要改", "不要改最后 3 列：templateKey、version、itemKey。新增材料 itemKey 可以留空。"],
    ["完成后", "把这个 Excel 发给我，我会按你的修改同步到模板源数据。"],
  ];
  guide.getRange("A3:A13").format = {
    fill: "#E0F2FE",
    font: { bold: true, color: "#0F172A" },
  };
  guide.getRange("A3:B13").format = { wrapText: true, verticalAlignment: "Top" };
  setWidths(guide, [180, 760, 120, 120, 120, 120]);

  const templateRows = [
    [
      "确认状态",
      "路径序号",
      "现有签证",
      "申请签证",
      "申请场景",
      "模板名称",
      "材料数",
      "客户材料数",
      "事务所材料数",
      "备注",
      "templateKey",
      "version",
    ],
  ];

  for (const template of catalog.templates) {
    templateRows.push([
      "待确认",
      template.sourcePathNo,
      template.currentVisaType,
      template.targetVisaType,
      template.applicationScenario,
      template.title,
      template.itemCount,
      template.items.filter((item) => item.responsibleParty === "customer").length,
      template.items.filter((item) => item.responsibleParty === "office").length,
      "",
      template.templateKey,
      template.version,
    ]);
  }

  const templates = workbook.worksheets.add("签证情况清单");
  writeRows(templates, templateRows, "VisaTemplateReviewList");
  setWidths(templates, [110, 90, 170, 190, 180, 260, 80, 100, 120, 260, 150, 70]);
  addListValidation(templates, 0, 1, templateRows.length - 1, ["待确认", "已确认", "需再看"]);

  const reviewRows = [
    [
      "处理方式",
      "路径序号",
      "现有签证",
      "申请签证",
      "申请场景",
      "原排序",
      "修改后排序",
      "原归属",
      "修改后归属",
      "原材料名",
      "修改后材料名",
      "原说明",
      "修改后说明",
      "原必填",
      "修改后必填",
      "原文件类型说明",
      "修改后文件类型说明",
      "修改备注",
      "templateKey",
      "version",
      "itemKey",
    ],
  ];

  for (const template of catalog.templates) {
    for (const item of template.items) {
      reviewRows.push([
        "保留",
        template.sourcePathNo,
        template.currentVisaType,
        template.targetVisaType,
        template.applicationScenario,
        item.sortOrder,
        "",
        humanParty(item.responsibleParty),
        humanParty(item.responsibleParty),
        item.title,
        "",
        blankIfNull(item.customerInstruction),
        "",
        item.isRequired ? "是" : "否",
        item.isRequired ? "是" : "否",
        blankIfNull(item.acceptedFileTypesDescription),
        "",
        "",
        template.templateKey,
        template.version,
        item.itemKey,
      ]);
    }
  }

  const review = workbook.worksheets.add("逐项确认");
  writeRows(review, reviewRows, "MaterialReviewItems");
  setWidths(review, [
    100,
    90,
    160,
    180,
    170,
    80,
    90,
    110,
    120,
    260,
    260,
    420,
    420,
    80,
    90,
    180,
    220,
    280,
    150,
    70,
    120,
  ]);

  const dataRows = reviewRows.length - 1;
  addListValidation(review, 0, 1, dataRows, ["保留", "删除", "新增", "待确认"]);
  addListValidation(review, 8, 1, dataRows, ["客户材料", "事务所材料"]);
  addListValidation(review, 14, 1, dataRows, ["是", "否"]);

  review.getRangeByIndexes(0, 0, reviewRows.length, 1).format.fill = "#F8FAFC";
  review.getRangeByIndexes(0, 6, reviewRows.length, 1).format.fill = "#FEF9C3";
  review.getRangeByIndexes(0, 8, reviewRows.length, 1).format.fill = "#FEF9C3";
  review.getRangeByIndexes(0, 10, reviewRows.length, 1).format.fill = "#FEF9C3";
  review.getRangeByIndexes(0, 12, reviewRows.length, 1).format.fill = "#FEF9C3";
  review.getRangeByIndexes(0, 14, reviewRows.length, 1).format.fill = "#FEF9C3";
  review.getRangeByIndexes(0, 16, reviewRows.length, 1).format.fill = "#FEF9C3";
  review.getRangeByIndexes(0, 17, reviewRows.length, 1).format.fill = "#FEF9C3";

  const visaRows = [["现有签证类型", "申请签证类型"]];
  const maxRows = Math.max(catalog.visaTypes.currentVisaTypes.length, catalog.visaTypes.targetVisaTypes.length);
  for (let index = 0; index < maxRows; index += 1) {
    visaRows.push([
      catalog.visaTypes.currentVisaTypes[index] ?? "",
      catalog.visaTypes.targetVisaTypes[index] ?? "",
    ]);
  }

  const visa = workbook.worksheets.add("签证类型");
  writeRows(visa, visaRows, "VisaTypesForReview");
  setWidths(visa, [220, 220]);

  return workbook;
}

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const workbook = buildWorkbook(catalog);

await fs.mkdir(outputDir, { recursive: true });

await workbook.render({
  sheetName: "怎么修改",
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
}));
