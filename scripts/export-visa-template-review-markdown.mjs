import fs from "node:fs/promises";
import path from "node:path";

const workspaceRoot = process.cwd();
const catalogPath = path.join(workspaceRoot, "data", "visa-templates", "visa-template-catalog.json");
const outputDir = path.join(workspaceRoot, "outputs", "template-editing");
const outputPath = path.join(outputDir, "visa-template-review-simple.md");

function text(value) {
  if (value === null || value === undefined || value === "") {
    return "无";
  }
  return String(value).replace(/\r\n/g, "\n").trim() || "无";
}

function partyLabel(value) {
  return value === "office" ? "事务所材料" : "客户材料";
}

function boolLabel(value) {
  return value ? "是" : "否";
}

function mdEscape(value) {
  return String(value).replace(/<!--/g, "<! --").replace(/-->/g, "-- >");
}

function buildMarkdown(catalog) {
  const lines = [];

  lines.push("# 签证模板材料逐项确认表");
  lines.push("");
  lines.push("## 修改说明");
  lines.push("");
  lines.push("- 每个二级标题是一种签证申请情况。");
  lines.push("- 每条材料下面可以改：处理方式、修改后归属、修改后材料名、修改后说明、修改后排序、修改后必填、修改备注。");
  lines.push("- `处理方式` 可填：保留、删除、新增、待确认。");
  lines.push("- `修改后归属` 可填：客户材料、事务所材料。");
  lines.push("- 不需要修改的字段可以留空，表示沿用原内容。");
  lines.push("- 不要删除 HTML 注释里的 `templateKey/version/itemKey`，我后续需要用它们回写模板。");
  lines.push("- 如果要新增材料，可以复制同一模板下任意一条材料块，把 `处理方式` 改为 `新增`，`itemKey` 注释可以留空或写 `NEW`。");
  lines.push("");
  lines.push("## 总览");
  lines.push("");
  lines.push(`- 模板数：${catalog.templates.length}`);
  lines.push(`- 材料项数：${catalog.templates.reduce((sum, template) => sum + template.items.length, 0)}`);
  lines.push(`- 客户材料项：${catalog.counts.customerItemCount}`);
  lines.push(`- 事务所材料项：${catalog.counts.officeItemCount}`);
  lines.push("");

  for (const template of catalog.templates) {
    const customerCount = template.items.filter((item) => item.responsibleParty === "customer").length;
    const officeCount = template.items.filter((item) => item.responsibleParty === "office").length;

    lines.push("---");
    lines.push("");
    lines.push(`## ${template.sourcePathNo}. ${mdEscape(template.currentVisaType)} -> ${mdEscape(template.targetVisaType)}（${mdEscape(template.applicationScenario)}）`);
    lines.push("");
    lines.push(`<!-- templateKey=${template.templateKey} version=${template.version} sourcePathNo=${template.sourcePathNo} -->`);
    lines.push("");
    lines.push(`- 确认状态：待确认`);
    lines.push(`- 模板名称：${mdEscape(template.title)}`);
    lines.push(`- 现有签证：${mdEscape(template.currentVisaType)}`);
    lines.push(`- 申请签证：${mdEscape(template.targetVisaType)}`);
    lines.push(`- 申请场景：${mdEscape(template.applicationScenario)}`);
    lines.push(`- 材料数：${template.items.length}`);
    lines.push(`- 客户材料数：${customerCount}`);
    lines.push(`- 事务所材料数：${officeCount}`);
    lines.push(`- 模板备注：`);
    lines.push("");
    lines.push("### 材料一览");
    lines.push("");

    for (const item of template.items) {
      lines.push(`#### ${item.sortOrder}. ${mdEscape(item.title)}`);
      lines.push("");
      lines.push(`<!-- templateKey=${template.templateKey} version=${template.version} itemKey=${item.itemKey} -->`);
      lines.push("");
      lines.push(`- 处理方式：保留`);
      lines.push(`- 原归属：${partyLabel(item.responsibleParty)}`);
      lines.push(`- 修改后归属：${partyLabel(item.responsibleParty)}`);
      lines.push(`- 原材料名：${mdEscape(item.title)}`);
      lines.push(`- 修改后材料名：`);
      lines.push(`- 原说明：${mdEscape(text(item.customerInstruction))}`);
      lines.push(`- 修改后说明：`);
      lines.push(`- 原排序：${item.sortOrder}`);
      lines.push(`- 修改后排序：`);
      lines.push(`- 原必填：${boolLabel(item.isRequired)}`);
      lines.push(`- 修改后必填：${boolLabel(item.isRequired)}`);
      lines.push(`- 原文件类型说明：${mdEscape(text(item.acceptedFileTypesDescription))}`);
      lines.push(`- 修改后文件类型说明：`);
      lines.push(`- 修改备注：`);
      lines.push("");
    }
  }

  return `${lines.join("\n")}\n`;
}

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const markdown = buildMarkdown(catalog);

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(outputPath, markdown, "utf8");

console.log(JSON.stringify({
  outputPath,
  templates: catalog.templates.length,
  items: catalog.templates.reduce((sum, template) => sum + template.items.length, 0),
}));
