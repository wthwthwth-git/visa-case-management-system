# Template Data Freeze

This document freezes the V1 visa material template source data extracted from `签证材料清单_210种情况.xlsx`.

## Source Workbook

- Source file: `签证材料清单_210种情况.xlsx`
- Source worksheets:
  - `210种情况汇总`
  - `材料明细`
  - `审查重点`
  - `文件说明`
- Official reference recorded in workbook: 出入国在留管理庁「在留手続」「在留資格から探す」
- Official reference URL recorded in workbook: https://www.moj.go.jp/isa/applications/index.html
- Official confirmation date recorded in workbook: 2026-05-18

## Frozen Files

The generated template data is stored under:

```text
data/visa-templates/visa-template-catalog.json
data/visa-templates/material-classification-rules.json
data/visa-templates/manual-review-items.json
```

These files are the fixed V1 template source before importing into `DocumentTemplate` and `DocumentTemplateItem`.

## Counts

- Current visa types: 15, including `无`.
- Target visa types: 14, excluding `无`.
- Template combinations: 210.
- Material detail records: 3142.
- Unique material titles: 152.
- Customer material records: 2294.
- Office-prepared material records: 848.
- Manual review records: 844.

The 210 combinations are calculated as:

```text
15 current visa types x 14 target visa types = 210 templates
```

## Application Scenario Rule

The scenario is derived from current and target visa types:

- `currentVisaType == 无`: `新规/在留资格认定证明书`
- `currentVisaType == targetVisaType`: `更新`
- otherwise: `变更`

## Template Mapping

Each row in `210种情况汇总` becomes one template candidate:

```text
DocumentTemplate.templateKey = visa-path-{路径序号}
DocumentTemplate.version = 1
DocumentTemplate.title = {现有签证类型} -> {准备申请签证类型}
DocumentTemplate.currentVisaType = 现有签证类型
DocumentTemplate.targetVisaType = 准备申请签证类型
DocumentTemplate.status = active
```

Each row in `材料明细` becomes one template item candidate:

```text
DocumentTemplateItem.itemKey = item-{材料序号}
DocumentTemplateItem.title = 材料名称
DocumentTemplateItem.customerInstruction = 展开说明
DocumentTemplateItem.responsibleParty = customer | office
DocumentTemplateItem.sortOrder = 材料序号
DocumentTemplateItem.isRequired = true
```

The source path number and material number are kept in the JSON for traceability.

## Responsible Party Classification

V1 uses two material responsibility groups:

- `customer`: customer-provided material. It appears in the customer Portal and in the Admin customer materials section.
- `office`: office-prepared material. It appears only in Admin by default.

Office-prepared examples:

- application forms
- reason letters
- explanation letters
- business plans
- point calculation sheets
- guarantee/questionnaire forms
- receiving organization / proxy submitter materials
- corporate registration, articles, company overview
- office, capital, employee, employment condition, job description, and employment reason materials

Customer-provided examples:

- passport
- residence card
- photo
- resident record
- education, degree, transcript, and work history evidence
- income, tax, pension, health insurance, bank, and expense evidence
- family, marriage, birth, and relationship evidence
- Japanese language and qualification evidence

## Manual Review

`manual-review-items.json` contains items that should be reviewed before production import.

Manual review is required when:

- classification confidence is low.
- the material title is broad, such as generic `资料`, `说明`, `实态`, `概要`, or `对应资料`.

Manual review does not block development import, but it should be resolved before production template freeze.

## Create Case Flow Impact

The final create case flow should become:

1. Select current visa type from the 15 current visa types.
2. Select target visa type from the 14 target visa types.
3. Resolve the matching template by current/target pair.
4. Show a preview of copied material requirements before creating the case.
5. Group preview items into customer materials and office-prepared materials.
6. Allow deleting template items before confirmation.
7. Allow adding custom items before confirmation.
8. Custom items must choose `customer` or `office`.
9. Only after confirmation should the system create:
   - Customer or reuse existing Customer
   - Case
   - CaseDocumentRequirement rows
   - timeline events
10. Preview should not write database records.

## Import Rules

When importing the frozen data into database models:

- `DocumentTemplate` and `DocumentTemplateItem` remain formal database models.
- Applying a template to a case must copy items into `CaseDocumentRequirement`.
- Case requirements must not live-reference template item content.
- Template changes must not affect old cases.
- `office` items should default to `portalVisible=false`.
- `customer` items should default to `portalVisible=true`.
- `portalDownloadable` should default to `false` for all template items unless explicitly changed later.

## Out of Scope

This phase does not:

- write to Prisma models.
- create migrations.
- change case creation API.
- change UI.
- import review points.
- implement template management UI.
