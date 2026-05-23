# API 合同设计

本文档定义签证案件资料管理系统 V1 的 API 合同。本文不是 API 实现，不包含业务代码，也不包含 Prisma schema。

## 1. API 总览

V1 API 分为两条边界清晰的访问路径：

- Admin API：事务所后台使用，必须经过后台登录或等价内部访问保护。
- Portal API：客户 Portal 使用，客户不注册、不登录，只能通过 secure token 访问对应案件。

核心原则：

- Admin API 和 Portal API 必须明确分开。
- Portal API 永远不信任前端传入的 `caseId`。
- Portal API 必须先校验 `CustomerAccessToken`，再由 token 得到 `caseId`。
- Portal API 只能访问 token 对应案件。
- Portal API 返回字段必须使用白名单。
- Portal API 不允许返回 `internalNote`、`InternalNote` 或完整 timeline。
- 文件下载必须使用短期 signed URL。
- 文件上传前必须校验 token 或后台登录。
- 所有重要操作必须写入 timeline event。

建议 API 路径前缀：

```text
/api/admin/*
/api/client/portal/{token}/*
```

## 2. 统一响应与错误规范

成功响应建议：

```json
{
  "data": {},
  "meta": {}
}
```

失败响应建议：

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Forbidden"
  }
}
```

Portal API 错误规则：

- token 无效、过期、失效时，不返回案件是否存在的细节。
- 客户访问不属于该 token 案件的资源时，返回统一不可访问错误。
- 客户上传或下载失败时，错误信息应简单、可理解。

Admin API 错误规则：

- 可返回更具体的错误信息，便于内部排查。
- 仍不得暴露敏感密钥、storage 内部配置或 token 明文。

## 3. Admin API 分组

Admin API 面向事务所内部后台。所有 Admin API 都必须通过后台登录或等价内部访问保护。

### 3.1 案件列表

```text
GET /api/admin/cases
```

权限边界：

- 仅后台可访问。
- 不对客户 token 开放。

输入摘要：

- 可选筛选：客户姓名、现有签证类型、申请签证类型、案件阶段。
- 可选分页参数。

输出摘要：

- 案件编号。
- 客户姓名。
- 现有签证类型。
- 申请签证类型。
- 案件阶段。
- 客户负责资料要求概览。
- 事务所负责资料要求概览。
- 入管追加材料概览。
- 更新时间。

Timeline：

- 查询操作通常不需要记录 timeline event。

### 3.2 创建案件

```text
POST /api/admin/cases
```

权限边界：

- 仅后台可访问。

输入摘要：

- `customerId` 或用于创建客户的基础信息。
- 现有签证类型。
- 申请签证类型。
- 初始案件阶段，可默认 `draft`。

输出摘要：

- 新案件基础信息。
- 关联客户信息摘要。
- 当前 active token 的一次性明文展示或 token 链接。
- token 明文只允许在创建或重新生成时返回。

Timeline：

- 必须记录 `case_created`。
- 必须记录 `token_created`。

安全规则：

- `Case` 应通过 `customerId` 关联客户，不直接保存 `customerName` 或 `customerContact`。
- 数据库只保存 token hash。
- 不得把 token 明文写入 timeline metadata。
- timeline metadata 不得写入 plaintext token、signed URL、护照号码等敏感原文。

### 3.3 案件详情

```text
GET /api/admin/cases/{caseId}
```

权限边界：

- 仅后台可访问。

输入摘要：

- `caseId`。

输出摘要：

- 案件完整基础信息。
- 关联客户信息。
- 当前案件阶段。
- token 状态摘要。
- `CaseDocumentRequirement` 列表。
- `DocumentFile` 摘要。
- `ApplicationConfirmation` 版本摘要。
- 内部备注入口或摘要。

Timeline：

- 查询操作通常不需要记录 timeline event。

### 3.4 更新案件基础信息

```text
PATCH /api/admin/cases/{caseId}
```

权限边界：

- 仅后台可访问。

输入摘要：

- 客户基础信息。
- 现有签证类型。
- 申请签证类型。

输出摘要：

- 更新后的案件基础信息。

Timeline：

- 重要字段变更建议记录 timeline event。

## 4. 模板 API

模板是正式数据库模型，用于约 210 套模板的后台导入、编辑和版本管理。

### 4.1 模板列表

```text
GET /api/admin/templates
```

权限边界：

- 仅后台可访问。

输入摘要：

- 可选筛选：现有签证类型、申请签证类型、状态、模板 key。

输出摘要：

- 模板 id。
- 模板 key。
- 版本。
- 模板名称。
- 适用签证类型。
- 状态。
- 更新时间。

### 4.2 创建模板

```text
POST /api/admin/templates
```

权限边界：

- 仅后台可访问。

输入摘要：

- 模板 key。
- 版本。
- 模板名称。
- 模板说明。
- 现有签证类型。
- 申请签证类型。
- 模板状态。

输出摘要：

- 创建后的 `DocumentTemplate`。

Timeline：

- 必须记录 `template_created`。

### 4.3 更新模板

```text
PATCH /api/admin/templates/{templateId}
```

权限边界：

- 仅后台可访问。

输入摘要：

- 模板名称。
- 模板说明。
- 适用签证类型。
- 状态。

输出摘要：

- 更新后的 `DocumentTemplate`。

Timeline：

- 必须记录 `template_updated`。

安全规则：

- 更新模板不得影响已创建案件的 `CaseDocumentRequirement`。

### 4.4 创建模板新版本

```text
POST /api/admin/templates/{templateId}/versions
```

权限边界：

- 仅后台可访问。

输入摘要：

- 新版本号。
- 是否复制旧版本模板资料项。

输出摘要：

- 新版本 `DocumentTemplate`。

Timeline：

- 必须记录 `template_version_created`。

### 4.5 模板资料项

```text
GET   /api/admin/templates/{templateId}/items
POST  /api/admin/templates/{templateId}/items
PATCH /api/admin/template-items/{itemId}
```

权限边界：

- 仅后台可访问。

输入摘要：

- 资料项名称。
- 客户说明 `customerInstruction`。
- 内部说明 `internalNote`。
- 是否必需。
- 默认负责方。
- 排序。
- 可接受文件类型说明。

输出摘要：

- `DocumentTemplateItem` 摘要或详情。

Timeline：

- 重要新增或更新建议记录 timeline event。

## 5. 模板复制 API

### 5.1 复制模板到案件资料要求

```text
POST /api/admin/cases/{caseId}/copy-template
```

权限边界：

- 仅后台可访问。

输入摘要：

- `templateId`。
- 可选复制范围或覆盖策略。

输出摘要：

- 新创建的 `CaseDocumentRequirement` 列表摘要。
- 复制数量。

关键规则：

- 必须把 `DocumentTemplateItem` 复制成 `CaseDocumentRequirement`。
- 不得让 `CaseDocumentRequirement` 实时引用模板资料项。
- 必须保存来源模板、模板版本和模板资料项信息。
- 模板修改不得影响旧案件。

Timeline：

- 必须记录 `template_items_copied`。
- 可在 metadata 中记录 `templateId`、版本和复制数量。
- metadata 不得记录护照号码等敏感原文。

## 6. 案件阶段切换 API

```text
PATCH /api/admin/cases/{caseId}/phase
```

权限边界：

- 仅后台可访问。

输入摘要：

- 新案件阶段。
- 可选变更原因。

输出摘要：

- 案件 id。
- 变更前阶段。
- 变更后阶段。

关键规则：

- 案件阶段和资料要求状态必须分离。
- 文件上传不得自动推进案件阶段。
- 所有资料要求 `approved` 不得自动等于案件 `submitted`。

Timeline：

- 必须记录 `case_phase_changed`。
- metadata 必须包含 from/to。
- metadata 不得记录护照号码等敏感原文。

## 7. 资料要求 Admin API

### 7.1 获取案件资料要求列表

```text
GET /api/admin/cases/{caseId}/requirements
```

权限边界：

- 仅后台可访问。

输入摘要：

- 可选筛选：`responsibleParty`、`sourceType`、状态、客户可见性。

输出摘要：

- `CaseDocumentRequirement` 列表。
- 每个资料要求的文件数量和状态摘要。

### 7.2 新增资料要求

```text
POST /api/admin/cases/{caseId}/requirements
```

权限边界：

- 仅后台可访问。

输入摘要：

- 名称。
- 客户说明 `customerInstruction`。
- 内部说明 `internalNote`。
- 是否必需。
- `responsibleParty`。
- `sourceType`。
- `portalVisible`。
- `portalDownloadable`。
- 要求日期和截止日期，可为空。

输出摘要：

- 新建的 `CaseDocumentRequirement`。

Timeline：

- 必须记录 `requirement_created`。

### 7.3 更新资料要求

```text
PATCH /api/admin/requirements/{requirementId}
```

权限边界：

- 仅后台可访问。

输入摘要：

- 名称。
- 客户说明 `customerInstruction`。
- 内部说明 `internalNote`。
- 是否必需。
- 负责方。
- 客户可见性。
- 客户下载能力。
- 排序。
- 截止日期。

输出摘要：

- 更新后的 `CaseDocumentRequirement`。

Timeline：

- 重要字段变更建议记录 timeline event。

## 8. 资料审核 API

```text
PATCH /api/admin/requirements/{requirementId}/status
```

权限边界：

- 仅后台可访问。

输入摘要：

- 新状态：`not_submitted`、`submitted`、`needs_more`、`approved`、`not_applicable`。
- 可选原因。

输出摘要：

- 资料要求 id。
- 变更前状态。
- 变更后状态。

关键规则：

- `approved` 是内部资料审核状态，不是签证批准。
- 客户侧展示必须映射为 `accepted`。
- 状态变更不得自动改变案件阶段。

Timeline：

- 必须记录 `requirement_status_changed`。
- metadata 必须包含 from/to 和可选 reason。
- metadata 不得记录护照号码等敏感原文。

## 9. 入管追加材料 API

入管追加材料不是独立资料系统，而是后台手动新增的 `CaseDocumentRequirement`。

### 9.1 新增入管追加材料

```text
POST /api/admin/cases/{caseId}/immigration-requests
```

权限边界：

- 仅后台可访问。

输入摘要：

- 名称。
- 说明。
- 来源说明。
- 要求日期。
- 截止日期，可为空。
- 是否需要客户补交。
- 是否客户可见。
- 是否客户可下载。

输出摘要：

- 新建的 `CaseDocumentRequirement`。
- `sourceType = immigration_request`。

关键规则：

- 必须创建 `CaseDocumentRequirement`。
- `sourceType` 必须是 `immigration_request`。
- 不是模板生成。
- 不得修改原模板。
- 如需客户补交，应设置 `responsibleParty = customer` 且 `portalVisible = true`。

Timeline：

- 必须记录 `requirement_created`。
- metadata 应说明来源为入管追加材料，但不得记录护照号码等敏感原文。

### 9.2 更新入管追加材料状态

```text
PATCH /api/admin/immigration-requests/{requirementId}/status
```

权限边界：

- 仅后台可访问。

输入摘要：

- 新资料要求状态。
- 可选原因。

输出摘要：

- 资料要求 id。
- 变更前状态。
- 变更后状态。

Timeline：

- 必须记录 `requirement_status_changed`。

## 10. 文件上传 / 下载 API

### 10.1 Admin 上传文件

```text
POST /api/admin/requirements/{requirementId}/files
```

权限边界：

- 仅后台可访问。

输入摘要：

- 文件内容。
- `portalVisible`。
- `portalDownloadable`。
- 可选说明。

输出摘要：

- `DocumentFile` metadata。

关键规则：

- 上传前必须校验后台登录。
- 根据 `requirementId` 找到 `caseId`。
- 文件存入 Supabase Storage private bucket。
- 数据库只保存文件 metadata。
- 客户是否可见必须由 `portalVisible` 明确控制。
- 客户是否可下载必须由 `portalDownloadable` 明确控制。

Timeline：

- 必须记录 `file_uploaded`。

### 10.2 Portal 上传文件

```text
POST /api/client/portal/{token}/requirements/{requirementId}/files
```

权限边界：

- 仅 token 对应客户 Portal 可访问。

输入摘要：

- 文件内容。

输出摘要：

- 客户可见的文件 metadata。

关键规则：

- 上传前必须校验 token。
- token 必须 active 且未过期。
- 通过 token 得到 `caseId`。
- `requirementId` 必须属于 token 对应案件。
- 资料要求必须客户可见。
- `responsibleParty` 必须是 `customer`。
- 上传生成的 `DocumentFile.portalVisible` 应为 true。
- 上传生成的 `DocumentFile.portalDownloadable` 应为 true。
- `uploadedByType` 应为 `client`。
- 文件存入 Supabase Storage private bucket。
- 不返回 storage 原始内部路径。

Timeline：

- 必须记录 `file_uploaded`。
- 如果资料要求从 `not_submitted` 变为 `submitted`，必须记录 `requirement_status_changed`。

### 10.3 Admin 获取下载 URL

```text
GET /api/admin/files/{fileId}/download-url
```

权限边界：

- 仅后台可访问。

输入摘要：

- `fileId`。

输出摘要：

- 短期 signed URL。
- 过期时间。

关键规则：

- 文件下载必须使用短期 signed URL。
- 不直接暴露永久公开 URL。

### 10.4 Portal 获取下载 URL

```text
GET /api/client/portal/{token}/files/{fileId}/download-url
```

权限边界：

- 仅 token 对应客户 Portal 可访问。

输入摘要：

- `fileId`。

输出摘要：

- 短期 signed URL。
- 过期时间。

关键规则：

- 必须先校验 token。
- `fileId` 必须属于 token 对应案件。
- 文件必须 `portalVisible = true`。
- 文件必须 `portalDownloadable = true`。
- 文件所属资料要求必须客户可见。
- 不返回 storage 原始内部路径。

### 10.5 Admin 替换或删除文件

```text
POST   /api/admin/files/{fileId}/replace
DELETE /api/admin/files/{fileId}
```

权限边界：

- 仅后台可访问。

输入摘要：

- 替换文件内容，或删除原因。

输出摘要：

- 更新后的 `DocumentFile` metadata。
- 删除时应记录 `removedByType` 和 `removeReason`。

Timeline：

- 替换必须记录 `file_replaced`。
- 删除必须记录 `file_removed`。

## 11. 客户确认申请书 API

### 11.1 Admin 获取申请书确认版本

```text
GET /api/admin/cases/{caseId}/application-confirmations
```

权限边界：

- 仅后台可访问。

输出摘要：

- `ApplicationConfirmation` 版本列表。
- 当前版本标识或状态。
- 确认状态。

### 11.2 Admin 创建申请书确认版本

```text
POST /api/admin/cases/{caseId}/application-confirmations
```

权限边界：

- 仅后台可访问。

输入摘要：

- 标题。
- 版本。
- 文件。

输出摘要：

- 新建的 `ApplicationConfirmation`。

关键规则：

- 支持多个版本。
- 新版本创建后，旧版本应标记为 `superseded` 或非当前版本。

Timeline：

- 必须记录 `application_confirmation_version_created`。

### 11.3 Portal 确认申请书

```text
POST /api/client/portal/{token}/application-confirmations/{confirmationId}/confirm
```

权限边界：

- 仅 token 对应客户 Portal 可访问。

输入摘要：

- 确认动作。
- 可选客户备注。

输出摘要：

- 确认状态。
- 确认时间。

关键规则：

- 必须先校验 token。
- `confirmationId` 必须属于 token 对应案件。
- 只能确认当前有效版本。
- 客户确认不代表案件阶段自动变更为 `submitted`。

Timeline：

- 必须记录 `application_confirmation_completed`。

### 11.4 Portal 要求修改申请书

```text
POST /api/client/portal/{token}/application-confirmations/{confirmationId}/request-revision
```

权限边界：

- 仅 token 对应客户 Portal 可访问。

输入摘要：

- 客户要求修改的说明。

输出摘要：

- 状态：`needs_revision`。

Timeline：

- 必须记录申请书确认状态变更 event。

## 12. Timeline API

### 12.1 Admin 查看 timeline

```text
GET /api/admin/cases/{caseId}/timeline
```

权限边界：

- 仅后台可访问。

输入摘要：

- 可选事件类型筛选。
- 可选分页。

输出摘要：

- 事件时间。
- 事件类型。
- 操作者类型。
- 操作摘要。
- 关联对象。
- metadata 摘要。

关键规则：

- Portal API 不提供完整 timeline。

### 12.2 Portal timeline

V1 不提供客户完整 timeline API。

如后续需要向客户展示有限进度，应设计独立的客户可见进度字段或白名单响应，不得复用 Admin timeline。

## 13. Portal API 分组

### 13.1 获取 Portal 首页数据

```text
GET /api/client/portal/{token}
```

权限边界：

- 仅 token 对应客户可访问。

输入摘要：

- URL 中的 token。

输出摘要：

- 客户可见案件基础信息。
- 申请签证类型。
- 客户可见案件阶段文案。
- 客户可见资料要求列表。
- 客户可见文件摘要。
- 当前版本申请书确认信息。

字段白名单：

- `caseDisplayName` 或客户识别信息。
- `targetVisaType`。
- `casePhaseLabel`。
- `requirements[].id`。
- `requirements[].title`。
- `requirements[].customerInstruction`。
- `requirements[].isRequired`。
- `requirements[].clientStatus`。
- `requirements[].sourceType`，仅当需要客户理解补充要求时返回。
- `requirements[].files[].id`。
- `requirements[].files[].originalFileName`。
- `requirements[].files[].fileSize`。
- `requirements[].files[].createdAt`。
- `requirements[].files[].portalDownloadable`。
- `applicationConfirmations[].id`。
- `applicationConfirmations[].title`。
- `applicationConfirmations[].version`。
- `applicationConfirmations[].status`。

禁止返回：

- `internalNote`。
- `InternalNote`。
- 内部操作人信息。
- 完整 timeline。
- `portalVisible = false` 的资料要求。
- `portalVisible = false` 的文件。
- `portalDownloadable = false` 文件的下载 URL。
- storage 原始内部路径。
- token hash。

关键规则：

- 必须先校验 token。
- token 必须 active 且未过期。
- 只能查询 token 对应 `caseId`。
- 不接受前端传入的 `caseId` 作为信任来源。

## 14. Token Admin API

### 14.1 重新生成 token

```text
POST /api/admin/cases/{caseId}/token/regenerate
```

权限边界：

- 仅后台可访问。

输出摘要：

- 新 token 明文或新 Portal 链接。
- token 明文只在本次响应中返回。

关键规则：

- 旧 active token 必须变为 `revoked`。
- 同一案件同一时间只允许一个 active token。
- 数据库只保存新 token hash。
- 不得把 token 明文写入 timeline。
- 不得把 signed URL 或护照号码等敏感原文写入 timeline。

Timeline：

- 必须记录 `token_regenerated`。
- 必须记录旧 token revoked 信息。

### 14.2 失效 token

```text
POST /api/admin/cases/{caseId}/token/revoke
```

权限边界：

- 仅后台可访问。

输出摘要：

- token 状态。

Timeline：

- 必须记录 `token_revoked`。

## 15. 高风险安全检查点

高风险接口：

- `GET /api/client/portal/{token}`
- `POST /api/client/portal/{token}/requirements/{requirementId}/files`
- `GET /api/client/portal/{token}/files/{fileId}/download-url`
- `POST /api/client/portal/{token}/application-confirmations/{confirmationId}/confirm`
- `POST /api/admin/cases/{caseId}/token/regenerate`
- `POST /api/admin/cases/{caseId}/copy-template`
- `PATCH /api/admin/requirements/{requirementId}/status`
- `POST /api/admin/files/{fileId}/replace`
- `DELETE /api/admin/files/{fileId}`
- 内部备注相关 API。

必须检查：

- Portal API 是否先校验 token。
- Portal API 是否只使用 token 得到的 `caseId`。
- Portal API 是否拒绝访问其他案件资源。
- Portal API 是否只返回字段白名单。
- Portal API 是否永不返回 `internalNote`。
- Portal API 是否永不返回完整 timeline。
- Portal 文件下载是否只返回短期 signed URL。
- Portal 文件下载是否检查 `portalVisible = true`。
- Portal 文件下载是否检查 `portalDownloadable = true`。
- Portal 文件上传是否检查资料要求属于 token 对应案件。
- Portal 文件上传是否检查资料要求客户可见且 `responsibleParty = customer`。
- Admin API 是否需要后台登录。
- token 重新生成后旧 token 是否 revoked。
- 同一案件是否只存在一个 active token。
- 模板复制是否创建快照，而不是实时引用模板。
- 资料审核、文件操作、token 操作、申请书确认是否写入 timeline event。
- timeline metadata 是否禁止 plaintext token、signed URL、护照号码等敏感原文。

## 16. internalNote 防泄漏规则

为了防止内部备注泄露，Portal API 必须遵守：

- Portal API 使用独立 response DTO。
- Portal API 不复用 Admin API 的响应结构。
- Portal API 查询使用字段白名单。
- Portal API 不 include `InternalNote` 关系。
- Portal API 不返回内部操作人信息。
- Portal API 不返回完整 timeline。
- Portal API 不返回 `portalVisible = false` 的资料要求或文件。
- Portal API 不返回 `portalDownloadable = false` 文件的下载 URL。

Admin API 可以读取内部备注，但仍不得把内部备注混入任何客户响应。

## 17. Phase 4 Service Boundary Addendum

This section is authoritative for future API route implementation.

### 17.1 Service namespace rules

- Admin API routes must call `adminServices`.
- Portal API routes must call `portalServices`.
- Shared utilities may be used only when they do not bypass admin or portal boundaries.
- Portal API routes must not import or call `adminServices`.
- Root service imports should use namespace imports:
  - `adminServices`
  - `portalServices`
  - `sharedServices`
- Do not directly mix admin and portal exports in a root API module.

### 17.2 Prisma response rule

API routes must not directly return Prisma models.

Rules:

- Admin routes should return admin DTOs or explicit response objects.
- Portal routes must return Portal DTO whitelists.
- Portal routes must not return raw Prisma objects, Prisma includes, or unfiltered DB records.

### 17.3 Portal caseId rule

Portal API routes must not receive, trust, or use a frontend-provided `caseId`.

Rules:

- Portal routes validate the token first.
- Portal routes derive `caseId` only from `CustomerAccessToken`.
- Portal routes may only access data belonging to the token's case.

### 17.4 Portal forbidden response fields

Normal Portal API responses must not contain:

- `internalNote`
- `storagePath`
- `storageBucket`
- `tokenHash`
- plaintext token
- `passportNumber`
- `residenceCardNumber`
- `originalFileName`
- `metadata`
- `actorId`
- `actorType`
- internal operator info
- `signedUrl`

`originalFileName` is not returned to Portal. If customer-facing file names are needed later, add a server-generated `displayName`.

### 17.5 Signed URL API rule

File download and application confirmation preview must use dedicated signed URL APIs.

Signed URL API responses may contain only:

- `signedUrl`
- `expiresAt`

Signed URL responses must not contain:

- `storagePath`
- `storageBucket`
- raw storage bucket names
- raw storage object paths

Signed URLs must not be written to timeline metadata, logs, or console output.

### 17.6 ApplicationConfirmation revision comment rule

`ApplicationConfirmation.needs_revision` customer comment is not stored long-term in structured form in V1.

Rules:

- The comment may be accepted and validated by the Portal service.
- The comment must not be saved to timeline metadata.
- Timeline metadata for application confirmation status changes may only include:
  - `confirmationId`
  - `title`
  - `version`
  - `oldStatus`
  - `newStatus`
  - `reason`
  - `supersededConfirmationIds`

### 17.7 Cross-reference

See `docs/service-boundary.md` for the complete service-layer boundary rules.

## 18. Phase 5 Implemented API Addendum

This section records the API routes implemented in Phase 5 and the route-level rules that must be preserved.

### 18.1 Implemented Portal API

Implemented Portal routes:

- `GET /api/portal/[token]/case`
- `POST /api/portal/[token]/files/[fileId]/signed-url`
- `POST /api/portal/[token]/application-confirmations/[confirmationId]/signed-url`
- `POST /api/portal/[token]/requirements/[requirementId]/files`
- `POST /api/portal/[token]/application-confirmations/[confirmationId]/confirm`
- `POST /api/portal/[token]/application-confirmations/[confirmationId]/request-revision`

Portal route rules:

- Portal routes must not receive or trust `caseId`.
- Portal routes must ignore `caseId` in JSON body or `FormData`.
- Portal routes must call only `portalServices`.
- Portal routes must not directly import `prisma`.
- Portal routes must not import `adminServices`.
- Portal routes must not directly return Prisma models.
- Normal Portal responses must not contain forbidden fields listed in `docs/service-boundary.md`.
- `signedUrl` may only be returned by dedicated signed URL APIs.

### 18.2 Implemented Admin Readonly API

Implemented Admin readonly routes:

- `GET /api/admin/cases`
- `GET /api/admin/cases/[caseId]`
- `GET /api/admin/cases/[caseId]/requirements`
- `GET /api/admin/cases/[caseId]/timeline`

Admin route rules:

- Admin routes must call `requireAdminAuth`.
- Admin routes must call only `adminServices`.
- Admin routes must not directly import `prisma`.
- Admin routes must not import `portalServices`.
- Admin routes must not directly return Prisma models.
- Admin readonly DTOs may include fields needed by back office users, including:
  - `internalNote`
  - storage metadata
  - timeline metadata

### 18.3 Unified API Response Format

Success response:

```json
{
  "data": {}
}
```

Error response:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid request."
  }
}
```

Signed URL response:

```json
{
  "data": {
    "signedUrl": "...",
    "expiresAt": "..."
  }
}
```

Normal Portal responses must not include `signedUrl`.

### 18.4 Error Codes

Implemented error codes:

- `INVALID_PORTAL_TOKEN`
- `FILE_NOT_ACCESSIBLE`
- `CONFIRMATION_NOT_ACCESSIBLE`
- `INVALID_UPLOAD`
- `INVALID_REQUEST`
- `ADMIN_AUTH_REQUIRED`
- `INTERNAL_ERROR`

Error responses must not reveal:

- token status
- whether a case exists
- whether a file exists
- whether an application confirmation exists
- storage path or bucket
- token hash
- internal implementation details

### 18.5 Admin Auth Placeholder

`requireAdminAuth` currently exists only as a development placeholder.

Rules:

- It does not represent production security.
- It must be replaced with real admin authentication before production use or before real back-office pages are exposed.
- Future admin mutation APIs must not go live without real admin authentication.
- Routes should continue calling `requireAdminAuth` so the implementation can be replaced centrally.

### 18.6 Test Command Convention

Current test split:

- `npm run test`: unit tests only, no database or network dependency.
- `npm run test:integration`: DB integration tests that require `DATABASE_URL`.
- `npm run test:token-constraint`: PostgreSQL partial unique index constraint test.

Default unit tests must keep covering route import boundaries and Portal DTO safety.

### 18.7 Next Admin Mutation API Placeholders

Planned next admin mutation routes:

- `POST /api/admin/cases/[caseId]/token/regenerate`
- `POST /api/admin/cases/[caseId]/token/revoke`
- `POST /api/admin/requirements/[requirementId]/files`
- `PATCH /api/admin/requirements/[requirementId]/status`
- `PATCH /api/admin/cases/[caseId]/phase`
- `POST /api/admin/cases/[caseId]/immigration-requests`
- `POST /api/admin/cases/[caseId]/application-confirmations`

These routes must:

- call `requireAdminAuth`
- call only `adminServices`
- not directly import `prisma`
- not import `portalServices`
- not directly return Prisma models
- write timeline events through the service layer where applicable

## 19. Phase 5-10 Addendum: Admin Mutation API Coverage

This addendum records the Admin mutation APIs implemented after Phase 5-4 and the current API coverage status.

### 19.1 Implemented Admin Mutation API

Implemented Admin mutation routes:

- `POST /api/admin/cases/[caseId]/token/regenerate`
- `POST /api/admin/cases/[caseId]/token/revoke`
- `PATCH /api/admin/requirements/[requirementId]/status`
- `POST /api/admin/cases/[caseId]/immigration-requests`
- `PATCH /api/admin/cases/[caseId]/phase`
- `POST /api/admin/cases/[caseId]/application-confirmations`
- `POST /api/admin/requirements/[requirementId]/files`

### 19.2 Unified Admin Mutation Boundary

All Admin mutation routes must:

- call `requireAdminAuth`
- call only `adminServices`
- not directly import `prisma`
- not import `portalServices`
- not directly write database records
- not directly write to Storage
- not directly write timeline events
- not directly return Prisma models
- not merge request body or `FormData` directly into the response

Routes should only parse the minimal allowed request fields, pass those fields to the matching service method, and return the service DTO.

### 19.3 Per-API Rules

`POST /api/admin/cases/[caseId]/token/regenerate`

- Calls the admin token regeneration service.
- This is the only Admin API allowed to return `plaintextToken`.
- The returned plaintext token must come only from the service result.
- Response must not include `tokenHash`.

`POST /api/admin/cases/[caseId]/token/revoke`

- Calls the admin token revoke service.
- Must not return `plaintextToken`.
- May return `revokedTokenId: null` when no active token exists.
- Response must not include `tokenHash`.

`PATCH /api/admin/requirements/[requirementId]/status`

- Calls only the requirement review service.
- Uses the route `requirementId`.
- Does not directly write timeline events.
- Does not directly modify files.

`POST /api/admin/cases/[caseId]/immigration-requests`

- Calls only the immigration additional requirement service.
- Uses the route `caseId`.
- `sourceType` must be fixed by the service as `immigration_request`.
- Route input must not be allowed to control `sourceType` or template trace fields.

`PATCH /api/admin/cases/[caseId]/phase`

- Calls only the case phase service.
- Uses the route `caseId`.
- Does not change requirement status.
- Does not automatically create immigration additional requirements.

`POST /api/admin/cases/[caseId]/application-confirmations`

- Calls only the application confirmation version service.
- May receive `storageBucket` and `storagePath` because the back office is registering an existing confirmation file.
- Response must not return `storageBucket` or `storagePath`.
- Route does not upload files and does not generate signed URLs.

`POST /api/admin/requirements/[requirementId]/files`

- Calls only the admin file upload service.
- Uses the route `requirementId`.
- May read `caseId` and `file` from `FormData`.
- Does not directly upload to Storage.
- Does not directly write `DocumentFile`.
- Does not directly write timeline events.
- Does not perform upload policy business checks in the route.

### 19.4 Admin Mutation Response Forbidden Fields

Admin mutation responses must not include:

- `tokenHash`
- raw `storagePath`
- raw `storageBucket`
- `signedUrl`
- plaintext token, except the `token/regenerate` response
- request body `metadata`
- Prisma internal object structure

Admin mutation responses may include explicit Admin DTO fields needed by the back office, but those fields must be intentionally shaped by the service layer.

### 19.5 Admin Auth Placeholder Risk

`requireAdminAuth` is still a development placeholder.

Rules:

- It does not represent production security.
- It must be replaced with real admin authentication before real deployment.
- It must be replaced before back-office UI integration is exposed beyond local development.
- It must be replaced before any public network access.
- Admin mutation APIs must not go live while protected only by the placeholder.

Current route tests verify that Admin routes call `requireAdminAuth`; they do not prove real production authentication.

### 19.6 Current API Coverage

The current API surface covers:

- Portal readonly access
- Portal signed URL access
- Portal mutation actions
- Admin readonly access
- Admin token regenerate and revoke
- Admin requirement review
- Admin immigration additional requirement creation
- Admin case phase changes
- Admin application confirmation version creation
- Admin file upload

This is enough to exercise many existing service-layer boundaries, but it is not yet enough for the full back-office creation workflow.

### 19.7 Missing API

Still missing:

- Admin case creation API
- Admin case basic information update API
- Admin Customer create/update API
- Admin template list/detail/import/edit/version management API
- Admin create case from template flow, or equivalent API that copies template items into case requirements
- Admin custom requirement API
- Admin file delete/replace API
- Admin application confirmation signed URL or back-office preview API
- Formal admin auth API, session, or middleware

### 19.8 Next Phase Recommendation

Do not move directly into the complete UI yet.

Recommended next step:

- Implement Admin case creation, template selection, and case requirement creation APIs first.
- If UI work must start early, limit it to a readonly shell and avoid claiming the full business workflow is complete.

The main reason is that the system still lacks the Admin create case and template-copy workflow, which is the entry point for real case operations.

## 20. Phase 6-1F Addendum: Case Creation Flow API

This addendum records the minimum Admin case creation flow implemented in Phase 6-1A through Phase 6-1E.

### 20.1 Case Creation API Sequence

Recommended order:

1. `POST /api/admin/cases`
2. `POST /api/admin/cases/[caseId]/apply-template`
3. `POST /api/admin/cases/[caseId]/token/create`

These are intentionally separate steps. A case may be created as a draft before a template is selected or before a customer Portal link is issued.

### 20.2 Create Case Boundary

`POST /api/admin/cases`:

- creates a Customer or reuses an existing Customer
- creates the Case
- generates `caseNumber`
- sets initial `casePhase = draft`
- does not apply a template
- does not create document requirements
- does not create a Portal token
- must not return passport number, residence card number, token fields, storage fields, signed URLs, or `internalNote`

### 20.3 Apply Template Boundary

`POST /api/admin/cases/[caseId]/apply-template`:

- copies template items into `CaseDocumentRequirement`
- sets `sourceType = template`
- writes `sourceTemplateId`, `sourceTemplateVersion`, and `sourceTemplateItemId`
- does not live-reference template content after copying
- does not modify `CasePhase`
- does not create a token
- must not return `internalNote`, `customerInstruction`, storage fields, token fields, or signed URLs

### 20.4 Token Create Boundary

`POST /api/admin/cases/[caseId]/token/create`:

- creates the first customer Portal token for a case
- returns `plaintextToken` only once in this response
- returns `INVALID_REQUEST` if an active token already exists
- does not return `tokenHash`, storage fields, or signed URLs

### 20.5 Current Minimum Case Creation Loop

The current minimum loop covers:

- create case
- apply template
- create Portal token
- Portal view, upload, and application confirmation
- Admin review, upload, case phase change, immigration additional requirement, and application confirmation version creation

### 20.6 UI Pre-Check Gaps

Still missing before complete UI work:

- Admin template readonly API
- Admin customer search API
- Admin case update API
- Admin custom requirement API
- Admin file delete/replace API
- formal admin auth

### 20.7 Next Recommendation

Recommended next steps:

1. Implement Admin template readonly API.
2. Implement Admin customer search API.
3. Then move into a UI shell.

The complete UI should not be treated as production-ready until formal admin auth is implemented.

### 20.8 Risks

- `requireAdminAuth` is still a development placeholder and is not production security.
- `plaintextToken` from token create can only be displayed once; the UI must handle this carefully.
- The UI must handle partial failures between create case, apply template, and create token.
- Without template list and customer search APIs, the create case UI will be awkward and error-prone.

## 21. Phase 7-3 Addendum: Environment Readiness API Contract

This addendum records the API behavior for missing required environment configuration.

### 21.1 Required Token Environment

`TOKEN_HASH_SECRET` is required for:

- Portal token creation
- Portal token validation
- any service path that hashes a plaintext Portal token

The server must not:

- save plaintext Portal tokens
- return `tokenHash`
- log `TOKEN_HASH_SECRET`
- write `TOKEN_HASH_SECRET` to timeline metadata
- generate a fallback secret

Changing `TOKEN_HASH_SECRET` makes existing Portal token hashes unverifiable.

### 21.2 Error Code

Missing required runtime configuration maps to:

- code: `SERVER_CONFIGURATION_ERROR`
- HTTP status: `500`
- message: `Server configuration error.`

Response format:

```json
{
  "error": {
    "code": "SERVER_CONFIGURATION_ERROR",
    "message": "Server configuration error."
  }
}
```

The response must not include:

- environment variable values
- secret values
- `TOKEN_HASH_SECRET`
- stack trace
- internal implementation details

### 21.3 Token Create Behavior

`POST /api/admin/cases/[caseId]/token/create` depends on `TOKEN_HASH_SECRET`.

If `TOKEN_HASH_SECRET` is missing:

- token creation must fail
- no fallback token secret is used
- the API returns `SERVER_CONFIGURATION_ERROR`
- the response does not expose the missing secret value

### 21.4 Storage Configuration

Storage environment variables are checked by signed URL and upload service paths when those paths are called.

Readonly APIs and token-independent Admin UI flows must not fail solely because Storage variables are missing locally.

## 22. Phase 8-1D Addendum: Admin Auth API Contract Freeze

This section freezes the Admin auth contract before implementation.

### 22.1 Auth Strategy

Admin API routes use Auth.js / NextAuth session authentication.

Portal API routes continue using case-specific Portal token authentication.

The two systems must remain separate:

- Admin session auth protects `/api/admin/*`.
- Portal token auth protects `/api/portal/*`.
- Admin session is not accepted by Portal routes.
- Portal token is not accepted by Admin routes.

### 22.2 Auth.js Adapter Tables

Use Auth.js default adapter tables:

- `User`
- `Account`
- `Session`
- `VerificationToken`

Contract naming:

- `User` means Admin auth user.
- `Customer` means visa applicant/client.

Admin route code and DTOs should use `adminUser`, `adminId`, and `adminEmail` terminology to avoid confusing Auth.js users with customers.

### 22.3 Admin User Contract

The Admin auth user should support:

- `role`
- `status`
- `lastLoginAt`
- `createdAt`
- `updatedAt`

V1 values:

- `role = admin`
- `status = active | disabled`

Disabled users must not access Admin pages or Admin APIs.

### 22.4 requireAdminAuth Contract

`requireAdminAuth(request)` remains the required route-level auth boundary for `/api/admin/*`.

Target return shape:

```ts
{
  adminId: string;
  email: string;
  role: "admin";
}
```

Rules:

- every Admin API route must call `requireAdminAuth`.
- Admin services must not perform session auth directly.
- middleware does not replace route-level API auth.
- route tests must continue checking that Admin routes call `requireAdminAuth`.

### 22.5 Middleware Contract

Middleware may protect:

- `/admin/*`

Middleware is for page UX:

- unauthenticated Admin page requests redirect to `/admin/login`.
- authenticated login page requests may redirect to `/admin/cases`.

Middleware must not be the only security layer.

### 22.6 CSRF Contract

Admin mutations require CSRF protection.

Protected methods:

- `POST`
- `PATCH`
- `PUT`
- `DELETE`

Protected route family:

- `/api/admin/*`

Recommended header:

```text
X-CSRF-Token
```

Recommended strategy:

- double-submit CSRF token.
- Admin UI fetch helper sends the CSRF token.
- Admin mutation route order:
  1. `requireAdminAuth`
  2. CSRF guard
  3. call `adminServices`

Portal routes must not use Admin CSRF.

### 22.7 AdminAuthAudit Contract

Auth audit events are not case timeline events.

Record:

- `login_success`
- `login_failure`
- `logout`
- `session_expired`
- `csrf_failure`
- `rate_limit_triggered`
- `suspicious_admin_request`

Never record:

- password
- session token
- CSRF token
- Portal token
- token hash
- signed URL
- secrets
- raw cookies
- authorization header

### 22.8 Deployment Contract

Production requires:

- HTTPS
- secure HTTP-only cookies
- `NEXTAUTH_SECRET`
- `TOKEN_HASH_SECRET`
- correct Auth.js URL/trusted host configuration
- no production database connected to preview deployments
- auth provider secrets stored only in encrypted deployment environment variables

### 22.9 Production Blockers

The Admin API is not production-ready until these exist:

- CSRF guard for Admin mutations
- rate limit
- Admin auth audit
- secure cookie/session deployment validation

## 23. Phase 8-3C Admin Auth Implementation Addendum

Initial Admin auth is implemented with:

- Google OAuth.
- Auth.js / NextAuth.
- Prisma adapter.
- database session strategy.
- `ADMIN_EMAIL_ALLOWLIST`.
- `/admin/login`.
- `/api/auth/[...nextauth]`.
- `/admin/*` middleware redirect.

`/api/admin/*` remains route-level protected:

- every route must call `requireAdminAuth(request)`.
- middleware is not considered API security.
- Portal routes do not use Admin session auth.

`requireAdminAuth` returns:

```ts
{
  adminId: string;
  email: string;
  role: "admin";
}
```

Auth failure response remains:

```json
{
  "error": {
    "code": "ADMIN_AUTH_REQUIRED",
    "message": "Admin authentication required."
  }
}
```

Admin auth audit currently records:

- `login_success`
- `login_failure`
- `logout`

Still pending before production:

- CSRF guard for Admin mutation routes.
- rate limit.
- production OAuth callback / cookie validation.

## 24. Phase 8-4B Admin CSRF Addendum

Admin mutation API routes now require CSRF validation.

CSRF contract:

- cookie: `admin_csrf_token`
- header: `X-CSRF-Token`
- strategy: double-submit cookie
- token is never returned in response body
- token is never written to timeline or audit metadata

CSRF bootstrap endpoint:

```text
GET /api/admin/csrf
```

Behavior:

- requires Admin auth.
- sets `admin_csrf_token` cookie if missing.
- returns:

```json
{
  "data": {
    "ok": true
  }
}
```

Protected Admin mutation routes:

- `POST /api/admin/cases`
- `POST /api/admin/cases/[caseId]/apply-template`
- `POST /api/admin/cases/[caseId]/token/create`
- `POST /api/admin/cases/[caseId]/token/regenerate`
- `POST /api/admin/cases/[caseId]/token/revoke`
- `PATCH /api/admin/requirements/[requirementId]/status`
- `POST /api/admin/cases/[caseId]/immigration-requests`
- `PATCH /api/admin/cases/[caseId]/phase`
- `POST /api/admin/cases/[caseId]/application-confirmations`
- `POST /api/admin/requirements/[requirementId]/files`

Route order:

1. `requireAdminAuth(request)`
2. `requireAdminCsrf(request)`
3. request parsing
4. `adminServices`

CSRF failure response:

```json
{
  "error": {
    "code": "ADMIN_CSRF_REQUIRED",
    "message": "Invalid admin request."
  }
}
```

HTTP status: `403`.

Portal API remains unchanged and does not import or use Admin CSRF.

## 25. Phase 8-5B Rate Limit Contract Freeze

This addendum freezes the API contract for future rate limiting. This phase does not implement a limiter, does not introduce Redis/KV, and does not change current API behavior.

### 25.1 Goals

Rate limiting must protect:

- Portal token guessing.
- Portal upload abuse.
- Portal signed URL abuse.
- Admin auth brute force attempts.
- Admin mutation abuse.

### 25.2 Frozen Route Groups

Portal:

- `portal_case`: Portal case readonly access.
- `portal_signed_url`: Portal file and application confirmation signed URL requests.
- `portal_upload`: Portal requirement file uploads.
- `portal_confirmation`: Portal application confirmation confirm/request-revision actions.

Admin:

- `admin_mutation`: normal Admin mutation requests.
- `admin_destructive`: destructive or high-impact Admin mutations.
- `admin_token_mutation`: Portal token create/regenerate/revoke through Admin APIs.
- `admin_upload`: Admin file upload.

Auth:

- `admin_login`: Admin login initiation and login page requests where applicable.
- `auth_callback`: OAuth/auth callback handling.

### 25.3 Key Strategy

Admin authenticated requests:

- key: `adminId + routeGroup`

Admin unauthenticated or login/auth requests:

- key: `IP + routeGroup`

Portal pre-validation requests:

- key: `IP + routeGroup`

Portal post-validation requests:

- key: `tokenId/caseId + routeGroup`

Uploads:

- Portal upload key: `tokenId + requirementId`
- Admin upload key: `adminId + requirementId`

Rules:

- do not use plaintext Portal token as a key.
- do not write `tokenHash` to audit metadata.
- do not expose the derived limiter key in API responses.

### 25.4 Error Contract

Reserved API error code:

```text
RATE_LIMITED
```

HTTP status:

```text
429
```

Response:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again later."
  }
}
```

If available, the response should include:

```text
Retry-After
```

UI Chinese message:

```text
Chinese UI copy: \u64cd\u4f5c\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002
```

The response must not reveal:

- Portal token validity.
- whether a case exists.
- whether a file or requirement exists.
- limiter key values.
- token hash.
- storage path or bucket.
- internal implementation details.

### 25.5 Audit Contract

AdminAuthAudit event:

```text
rate_limit_triggered
```

Allowed metadata:

- `routeGroup`
- `method`
- `path`
- `keyType`
- `limit`
- `windowSeconds`
- `retryAfterSeconds`
- `reason`

Forbidden metadata:

- plaintext Portal token
- `tokenHash`
- session token
- CSRF token
- provider token
- signed URL
- `storagePath`
- `storageBucket`
- raw cookie
- authorization header
- secrets

### 25.6 V1 Implementation Recommendation

Local/dev:

- optional in-memory limiter may be used for development smoke testing.

Production:

- use Upstash Redis or Vercel KV.
- do not use business PostgreSQL as the long-term limiter store.
- default unit tests must not require external limiter infrastructure.

### 25.7 Production Blocker

The system is not production-ready until a real Redis/KV-backed limiter protects the route groups defined above.

## 26. Phase 8-5D In-memory Rate Limit API Addendum

The first rate limit guard is implemented with an in-memory adapter for local development and controlled internal demos.

This phase does not:

- add Redis/KV.
- change API response shapes except for the reserved `RATE_LIMITED` error when a limit is exceeded.
- change Prisma schema or migrations.
- change Portal token architecture.
- limit OAuth callback routes.
- limit readonly Admin `GET` routes.

### 26.1 Protected Routes

Admin token mutation routes:

- `POST /api/admin/cases/[caseId]/token/create`
- `POST /api/admin/cases/[caseId]/token/regenerate`
- `POST /api/admin/cases/[caseId]/token/revoke`

Admin upload routes:

- `POST /api/admin/requirements/[requirementId]/files`

Admin destructive/high-impact routes:

- `POST /api/admin/cases`
- `POST /api/admin/cases/[caseId]/apply-template`
- `PATCH /api/admin/requirements/[requirementId]/status`
- `POST /api/admin/cases/[caseId]/immigration-requests`
- `PATCH /api/admin/cases/[caseId]/phase`
- `POST /api/admin/cases/[caseId]/application-confirmations`

Portal routes:

- `GET /api/portal/[token]/case`
- `POST /api/portal/[token]/files/[fileId]/signed-url`
- `POST /api/portal/[token]/application-confirmations/[confirmationId]/signed-url`
- `POST /api/portal/[token]/requirements/[requirementId]/files`

### 26.2 Error Behavior

When a limit is exceeded:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again later."
  }
}
```

HTTP status: `429`.

The response includes `Retry-After` when retry timing is available.

### 26.3 Safety Rules

- limiter keys must not use plaintext Portal token.
- limiter keys must not use `tokenHash`.
- raw limiter key values must not be logged or returned.
- rate limit audit metadata must not contain plaintext token, token hash, session token, CSRF token, provider token, signed URL, storage path, storage bucket, raw cookie, authorization header, or secrets.

### 26.4 Production Limitation

The in-memory adapter is not production-grade. Production still requires a Redis/KV-backed adapter before public traffic.

## 27. Phase 8-6C Upstash Rate Limit Adapter Addendum

The API contract remains unchanged. The limiter backend can now be selected by environment.

Supported backend values:

- `RATE_LIMIT_BACKEND=memory`
  - local/dev/demo only.
  - forbidden in production.
- `RATE_LIMIT_BACKEND=upstash`
  - production/staging backend.
  - requires `UPSTASH_REDIS_REST_URL`.
  - requires `UPSTASH_REDIS_REST_TOKEN`.

The route-level API contract remains:

- over-limit response code: `RATE_LIMITED`.
- HTTP status: `429`.
- safe message: `Too many requests. Please try again later.`
- `Retry-After` header when retry timing is available.

No API response may expose:

- Upstash REST URL or token.
- limiter raw key.
- plaintext Portal token.
- `tokenHash`.
- session token.
- CSRF token.
- signed URL.
- storage path or bucket.

Default unit tests must mock the adapter and must not require a real Upstash service.

Production readiness now requires:

- `RATE_LIMIT_BACKEND=upstash`.
- valid Upstash env.
- staging smoke test for Admin and Portal protected route groups.

## 28. Template-5B Template Selection Case Create API Addendum

Implemented Admin API:

- `POST /api/admin/cases/from-template-selection`

Purpose:

- Used after an admin previews a template's material list.
- Creates or reuses `Customer`.
- Creates `Case`.
- Copies only selected `DocumentTemplateItem` records into `CaseDocumentRequirement`.
- Creates additional custom `CaseDocumentRequirement` records.
- Does not create a Portal token.
- Does not upload files or touch Storage.
- Does not call the legacy full-template apply API.

Route boundary:

- Must call `requireAdminAuth(request)`.
- Must call `requireAdminCsrf(request)`.
- Must call `requireAdminRateLimit` with an Admin mutation/destructive route group.
- Must only call `adminServices.createCaseFromTemplateSelection`.
- Must not import Prisma directly.
- Must not import `portalServices`.
- Must not directly create `Customer`, `Case`, `CaseDocumentRequirement`, `DocumentFile`, `CustomerAccessToken`, or timeline events.
- Must not call `applyDocumentTemplateToCase`.

Request body whitelist:

- `customer`
- `existingVisaType`
- `applyingVisaType`
- `title`
- `internalNote`
- `templateId`
- `selectedTemplateItemIds`
- `customItems`

Allowed custom item fields:

- `title`
- `responsibleParty`
- `customerInstruction`
- `internalNote`
- `dueDate`
- `portalVisible`
- `portalDownloadable`

The route must ignore dangerous or unrelated body fields, including:

- `caseId`
- `caseNumber`
- `casePhase`
- `token`
- `plaintextToken`
- `tokenHash`
- `storagePath`
- `storageBucket`
- `signedUrl`
- `metadata`
- `timeline`
- `sourceTemplateId`
- `sourceTemplateVersion`
- `sourceTemplateItemId`
- `status`
- `uploadedBy`
- `file`

Success response:

```json
{
  "data": {
    "caseId": "...",
    "customerId": "...",
    "caseNumber": "...",
    "currentVisaType": "...",
    "targetVisaType": "...",
    "casePhase": "draft",
    "templateId": "...",
    "templateKey": "...",
    "templateVersion": 1,
    "selectedItemCount": 0,
    "excludedItemCount": 0,
    "customItemCount": 0,
    "requirementIds": [],
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

Response must not expose:

- raw Prisma objects.
- `storagePath` / `storageBucket`.
- signed URL.
- `tokenHash`.
- plaintext token.
- request body metadata.

Error behavior:

- route-level invalid body -> `INVALID_REQUEST`.
- `InvalidTemplateSelectionInputError` -> `INVALID_REQUEST`.
- `TemplateSelectionAccessError` -> `INVALID_REQUEST`.
- auth failure -> `ADMIN_AUTH_REQUIRED`.
- CSRF failure -> `ADMIN_CSRF_REQUIRED`.
- rate limit failure -> `RATE_LIMITED`.

Portal token creation remains a separate Admin API:

- `POST /api/admin/cases/[caseId]/token/create`
