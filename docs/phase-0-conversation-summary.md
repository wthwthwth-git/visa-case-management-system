# Phase 0 对话与交接摘要

## 1. 用户目标

完成签证案件资料管理系统 V1 的 Phase 0：项目文档初始化。

明确要求：

- 建立基础文档。
- 不写业务代码。
- 文档围绕小型事务所签证案件资料管理系统。
- 客户不注册、不登录，通过案件专属 token 链接访问。
- V1 不做 AI、OCR、多员工权限、聊天、支付、手机 App。
- 模板创建案件时必须复制到案件资料项，不能直接引用模板。
- 一个资料项支持多个文件。
- 案件阶段和资料状态必须分离。
- 内部备注不得显示给客户。
- 重要操作必须记录 timeline event。

## 2. 已确认的文档计划

用户确认创建以下文件：

- `docs/product-spec.md`
- `docs/status-rules.md`
- `docs/page-flow.md`
- `docs/acceptance-checklist.md`
- `AGENTS.md`

## 3. 已完成内容

已创建并填写上述文档。

文档内容覆盖：

- V1 产品规格。
- 状态规则。
- 页面与流程。
- 验收清单。
- 后续代理和开发者工作规则。

## 4. 当前迁移说明

原 Phase 0 文档已从临时目录：

```text
C:\Users\wth78\Documents\Codex\2026-05-20\phase-0-v1-docs-product-spec
```

移动到项目目录：

```text
D:\vise-info-management
```

Codex 应用内的聊天记录无法像普通文件一样直接移动，因此本文件作为对话和任务交接摘要保存在目标项目中。

## 5. 下一步建议

建议继续做 Phase 1：数据模型与接口草案文档。

可新增文档：

- `docs/data-model.md`
- `docs/api-contract.md`

Phase 1 仍建议先写文档，不急于实现业务代码。
