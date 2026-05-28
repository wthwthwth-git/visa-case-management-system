# 数据模型设计

## 1. 模型总览

本文档定义签证案件资料管理系统 V1 的核心数据模型。本文不是 Prisma schema，不直接约束数据库语法；后续 Prisma schema 应以本文档为依据生成。

V1 数据模型目标：

- 支持小型事务所管理签证案件。
- 支持一个客户对应多个签证案件。
- 支持客户不注册、不登录，通过 secure token Portal 访问案件。
- 支持一个资料要求关联多个文件。
- 支持约 210 套资料模板的后台导入、编辑和版本管理。
- 支持创建案件时从模板复制资料要求，不能实时引用模板。
- 支持自定义追加资料。
- 支持入管追加材料。
- 支持客户确认申请书多版本。
- 支持 timeline event。
- 保持案件阶段和资料状态分离。
- 保证内部备注不得暴露给客户。

数据库核心模型：

- `Case`
- `Customer`
- `CustomerAccessToken`
- `DocumentTemplate`
- `DocumentTemplateItem`
- `CaseDocumentRequirement`
- `DocumentFile`
- `ApplicationConfirmation`
- `InternalNote`
- `TimelineEvent`

核心设计调整：

- 模板是正式数据库模型，不是纯文档或配置。
- 模板修改不能影响旧案件，因为创建案件时必须复制成案件资料要求快照。
- 客户资料、事务所资料、自定义追加资料、入管追加材料统一使用 `CaseDocumentRequirement`。
- 文件统一使用 `DocumentFile`。
- 入管追加材料不是模板生成，而是后台手动添加的 `CaseDocumentRequirement`，其 `sourceType = immigration_request`。

## 2. 模型用途与关键字段

### 2.1 Customer 客户

用途：

- 表示签证案件中的客户主体。
- 一个客户可以对应多个案件。
- 客户不是登录账号，不用于客户注册或客户登录。

关键字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 客户唯一标识 |
| `name` | 客户姓名 |
| `contact` | 客户联系方式，可按 V1 需要拆分 |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |

关键规则：

- `Customer` 不代表客户账号。
- 客户仍然只能通过 `CustomerAccessToken` 访问 Portal。
- 客户资料不得被 token 越权访问。

### 2.2 Case 案件

用途：

- 表示一个客户的一次签证案件服务。
- 承载案件基础信息和案件阶段。
- 作为资料要求、文件、token、申请书确认、内部备注和 timeline 的根对象。

关键字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 案件唯一标识 |
| `customerId` | 所属客户 |
| `caseNumber` | 案件编号 |
| `currentVisaType` | 现有签证类型 |
| `targetVisaType` | 申请签证类型 |
| `casePhase` | 案件阶段 |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |

关键规则：

- `casePhase` 只表示整个案件进度。
- `casePhase` 不表示单个资料要求状态。
- 客户 Portal 只能读取客户可见的案件字段。

### 2.3 CustomerAccessToken 客户访问 Token

用途：

- 支持客户通过 secure token 访问案件 Portal。
- 客户不注册、不登录。
- 支持 token 失效、重新生成和审计。

关键字段：

| 字段 | 含义 |
| --- | --- |
| `id` | token 记录唯一标识 |
| `caseId` | 所属案件 |
| `tokenHash` | token 哈希值，不保存明文 token |
| `status` | token 状态 |
| `expiresAt` | 过期时间，可为空 |
| `createdAt` | 创建时间 |
| `revokedAt` | 失效时间，可为空 |
| `lastUsedAt` | 最近使用时间，可为空 |

关键规则：

- V1 中一个案件同一时间只允许一个 `active` token。
- 重新生成 token 时，旧 token 必须变为 `revoked`。
- 数据库不应保存明文 token。
- 客户请求时用明文 token 计算 hash 后匹配。
- token 只能访问对应案件。
- token 不授予后台能力。
- token 创建、重新生成或失效必须记录 timeline event。

### 2.4 DocumentTemplate 资料模板

用途：

- 表示一套可被后台导入、编辑和版本管理的资料模板。
- 用于创建案件时生成初始 `CaseDocumentRequirement`。
- 适合管理约 210 套固定但需要维护的模板。

关键字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 模板唯一标识 |
| `templateKey` | 模板业务 key |
| `version` | 模板版本 |
| `title` | 模板名称 |
| `templateDescription` | 模板说明 |
| `currentVisaType` | 适用现有签证类型 |
| `targetVisaType` | 适用申请签证类型 |
| `status` | 模板状态 |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |

关键规则：

- 模板是数据库正式模型。
- 模板用于后台维护和案件创建时复制。
- 模板修改不能影响已创建案件。
- 模板不作为案件资料要求的实时数据源。
- 同一个 `templateKey` 可以有多个版本。
- 模板未来需要版本审计能力，应保留版本创建、发布、归档等操作记录。

### 2.5 DocumentTemplateItem 模板资料项

用途：

- 表示模板中的单个资料要求。
- 创建案件时复制成 `CaseDocumentRequirement`。

关键字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 模板资料项唯一标识 |
| `templateId` | 所属模板 |
| `itemKey` | 模板资料项业务 key |
| `title` | 资料项名称 |
| `customerInstruction` | 客户可见说明 |
| `internalNote` | 内部说明，可为空 |
| `isRequired` | 是否必需 |
| `responsibleParty` | 默认负责方 |
| `sortOrder` | 排序 |
| `acceptedFileTypesDescription` | 可接受文件类型说明 |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |

关键规则：

- 模板资料项只作为复制来源。
- 已复制到案件的资料要求不得实时读取模板资料项。
- 模板资料项修改不影响旧案件。

### 2.6 CaseDocumentRequirement 案件资料要求

用途：

- 统一表示案件中的资料要求。
- 覆盖客户提交资料、事务所内部资料、自定义追加资料、入管追加材料。
- 承载单个资料要求的资料状态。

关键字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 案件资料要求唯一标识 |
| `caseId` | 所属案件 |
| `title` | 资料要求名称 |
| `customerInstruction` | 客户可见说明，可为空 |
| `internalNote` | 内部说明，可为空 |
| `isRequired` | 是否必需 |
| `responsibleParty` | 负责方：客户或事务所 |
| `sourceType` | 来源类型 |
| `status` | 资料状态 |
| `sortOrder` | 排序 |
| `portalVisible` | 是否在客户 Portal 展示 |
| `portalDownloadable` | 客户是否可下载相关文件 |
| `sourceTemplateId` | 来源模板 id，可为空 |
| `sourceTemplateVersion` | 来源模板版本，可为空 |
| `sourceTemplateItemId` | 来源模板资料项 id，可为空 |
| `immigrationRequestSource` | 入管追加材料来源说明，可为空 |
| `requestedAt` | 入管或内部要求日期，可为空 |
| `dueDate` | 截止日期，可为空 |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |

字段说明：

- `responsibleParty = customer` 表示需要客户处理或提交。
- `responsibleParty = office` 表示由事务所内部处理。
- `sourceType = template` 表示从模板复制。
- `sourceType = custom` 表示后台手动追加。
- `sourceType = immigration_request` 表示入管追加材料。

关键规则：

- `CaseDocumentRequirement` 创建后是独立数据。
- 从模板复制时必须保存模板来源和版本信息。
- 模板修改不影响旧案件资料要求。
- 一个 `CaseDocumentRequirement` 可以关联多个 `DocumentFile`。
- 入管追加材料不是模板生成，而是后台手动添加的资料要求。
- 入管追加材料的 `sourceType` 必须是 `immigration_request`。
- 客户只可看到 `portalVisible = true` 且属于 token 对应案件的资料要求。
- 内部 `approved` 展示给客户时应映射为客户侧 `accepted`。

### 2.7 DocumentFile 文件

用途：

- 统一表示案件资料要求下的文件。
- 支持客户上传文件和事务所内部上传文件。
- 一个 `CaseDocumentRequirement` 可以关联多个 `DocumentFile`。

关键字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 文件唯一标识 |
| `caseId` | 所属案件 |
| `requirementId` | 所属案件资料要求 |
| `storageBucket` | Supabase Storage bucket |
| `storagePath` | Supabase Storage path |
| `originalFileName` | 原始文件名 |
| `mimeType` | 文件 MIME 类型 |
| `fileSize` | 文件大小 |
| `status` | 文件状态 |
| `uploadedByType` | 上传者类型 |
| `portalVisible` | 是否在客户 Portal 展示 |
| `portalDownloadable` | 客户是否可下载 |
| `removedByType` | 移除操作者类型，可为空 |
| `removeReason` | 移除原因，可为空 |
| `createdAt` | 上传时间 |
| `removedAt` | 移除时间，可为空 |

关键规则：

- 文件必须属于具体 `CaseDocumentRequirement`。
- 文件上传不代表资料审核通过。
- 文件上传、删除、替换、追加必须记录 timeline event。
- 客户只能访问自己案件下且客户可见的文件。
- 事务所内部文件必须设置为客户不可见。

### 2.8 ApplicationConfirmation 客户确认申请书

用途：

- 记录客户通过 token 对申请书或确认材料的确认。
- 支持多个版本，例如申请书 v1、修改后 v2、再次确认。
- 不表示客户登录。
- 不表示签证已递交。

关键字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 确认记录唯一标识 |
| `caseId` | 所属案件 |
| `title` | 确认事项名称 |
| `version` | 申请书版本号 |
| `storageBucket` | 确认文件 bucket |
| `storagePath` | 确认文件 path |
| `status` | 确认状态 |
| `confirmedAt` | 确认时间，可为空 |
| `supersededAt` | 被新版本替代的时间，可为空 |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |

关键规则：

- 同一案件可以有多个 `ApplicationConfirmation` 版本。
- 同一确认事项一般只应有一个当前有效版本。
- 新版本上传后，旧版本应标记为已被替代或非当前版本。
- 客户确认申请书必须绑定当前 token 对应案件。
- 客户不能确认其他案件的申请书。
- 确认动作必须记录 timeline event。
- 客户确认不代表案件阶段自动变更为 `submitted`。

### 2.9 InternalNote 内部备注

用途：

- 记录事务所内部审核意见、处理说明、风险点或沟通摘要。
- 可关联不同业务对象。

关键字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 内部备注唯一标识 |
| `caseId` | 所属案件 |
| `targetType` | 关联对象类型 |
| `targetId` | 关联对象 id |
| `body` | 备注内容 |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |

关键规则：

- 内部备注不得显示给客户。
- 客户接口不得返回 `internal_note` 或等价字段。
- 内部备注新增或重要更新必须记录 timeline event。

### 2.10 TimelineEvent 时间线事件

用途：

- 记录案件中的重要操作。
- 支持内部审计、交接和问题追踪。

关键字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 事件唯一标识 |
| `caseId` | 所属案件 |
| `eventType` | 事件类型 |
| `actorType` | 操作者类型 |
| `summary` | 操作摘要 |
| `targetType` | 关联对象类型，可为空 |
| `targetId` | 关联对象 id，可为空 |
| `metadata` | 结构化元数据 |
| `createdAt` | 发生时间 |

关键规则：

- timeline event 必须至少关联一个案件。
- 状态变更事件应记录 from/to。
- 文件事件应记录文件 id 或路径摘要。
- 客户 Portal 不展示完整 timeline。

## 3. 模型之间的关系

核心关系：

```text
DocumentTemplate 1 - N DocumentTemplateItem

DocumentTemplateItem
  --copy snapshot-->
CaseDocumentRequirement

Customer 1 - N Case

Case 1 - N CustomerAccessToken
Case 1 - N CaseDocumentRequirement
CaseDocumentRequirement 1 - N DocumentFile

Case 1 - N ApplicationConfirmation

Case 1 - N InternalNote
CaseDocumentRequirement 1 - N InternalNote
DocumentFile 1 - N InternalNote
ApplicationConfirmation 1 - N InternalNote

Case 1 - N TimelineEvent
```

Timeline 可关联对象：

- `CustomerAccessToken`
- `DocumentTemplate`
- `DocumentTemplateItem`
- `CaseDocumentRequirement`
- `DocumentFile`
- `ApplicationConfirmation`
- `InternalNote`

关系边界：

- 模板进入数据库，用于后台导入、编辑和版本管理。
- 客户进入数据库，用于支持一个客户多个案件，但不代表客户账号。
- 案件资料要求由模板复制、自定义追加或入管追加材料创建。
- 模板和案件资料要求之间不是实时引用关系。
- 客户资料、事务所资料、入管追加材料统一用 `CaseDocumentRequirement` 表示。
- 文件统一用 `DocumentFile` 表示。
- 所有客户可访问数据必须从 `CustomerAccessToken` 校验出的 `caseId` 出发查询。

## 4. 枚举值设计

### 4.1 Case Phase

引用 `docs/status-rules.md`：

```text
draft
collecting_documents
preparing_application
submitted
approved
```

### 4.2 Requirement Status

资料要求状态复用内部资料状态：

```text
not_submitted
submitted
needs_more
approved
not_applicable
```

客户展示状态通常由内部状态映射产生：

```text
internal.not_submitted -> client.not_submitted
internal.submitted -> client.submitted
internal.needs_more -> client.needs_more
internal.approved -> client.accepted
internal.not_applicable -> client.not_applicable
```

### 4.3 Responsible Party

```text
customer
office
```

含义：

- `customer`：需要客户在 Portal 中查看、提交或确认。
- `office`：由事务所内部准备或处理。

### 4.4 Source Type

```text
template
custom
immigration_request
system
```

含义：

- `template`：从数据库模板复制而来。
- `custom`：后台手动追加。
- `immigration_request`：入管追加材料。
- `system`：系统生成。

### 4.5 File Status

```text
uploaded
removed
replaced
```

### 4.6 Token Status

```text
active
revoked
expired
```

### 4.7 Template Status

```text
draft
active
archived
```

### 4.8 Application Confirmation Status

```text
pending
confirmed
needs_revision
superseded
```

### 4.9 Actor Type

```text
internal
client
system
```

V1 不做多员工权限，因此 `internal` 只表示事务所内部操作者类型，不代表复杂角色系统。

### 4.10 Timeline Event Type

V1 至少支持：

```text
case_created
case_phase_changed
token_created
token_revoked
token_regenerated
template_created
template_updated
template_version_created
template_items_copied
requirement_created
requirement_status_changed
file_uploaded
file_removed
file_replaced
internal_note_created
internal_note_updated
application_confirmation_created
application_confirmation_version_created
application_confirmation_completed
```

## 5. 客户可见 / 内部可见边界

客户可见：

- 当前 token 对应案件的客户可见基础信息。
- 申请签证类型。
- 客户可见案件阶段文案。
- `portalVisible = true` 的 `CaseDocumentRequirement`。
- `responsibleParty = customer` 的客户资料要求。
- 客户资料要求的名称、客户说明、是否必需、客户展示状态。
- 客户资料要求下 `portalVisible = true` 的文件信息。
- `portalDownloadable = true` 的文件下载入口。
- 需要客户处理的入管追加材料要求。
- 需要客户确认的当前版本申请书或确认材料。

客户不可见：

- `InternalNote`。
- `internalNote`。
- `responsibleParty = office` 且 `portalVisible = false` 的资料要求。
- `portalVisible = false` 的文件。
- `portalDownloadable = false` 的文件下载能力。
- 完整 timeline。
- 内部操作人信息。
- 后台管理入口。
- Supabase storage 原始内部路径，除非通过短期 signed URL 控制。
- `approved` 的内部语义。

内部可见：

- 案件完整信息。
- 所有 `CaseDocumentRequirement`。
- 所有 `DocumentFile`。
- 所有模板和模板版本。
- 申请书确认版本记录。
- 内部备注。
- 完整 timeline。
- token 状态和 token 操作记录。

边界规则：

- 客户查询必须先通过 token 解析出 `caseId`。
- 客户查询不得接受任意 `caseId` 作为信任来源。
- 客户接口必须使用白名单字段返回。
- 内部备注不得作为通用字段混入客户响应。
- `responsibleParty`、`portalVisible` 和 `portalDownloadable` 都必须参与客户可见性和下载能力判断。

## 6. 文件存储 Metadata 设计

文件内容存放在 Supabase Storage，数据库只保存 metadata。

建议 bucket：

```text
case-files
```

bucket 应默认为 private。

建议 storage path：

```text
cases/{caseId}/requirements/{requirementId}/{fileId}-{filename}
cases/{caseId}/application-confirmations/{confirmationId}/{fileId}-{filename}
```

通用文件 metadata 字段：

| 字段 | 含义 |
| --- | --- |
| `caseId` | 所属案件 |
| `requirementId` | 所属资料要求 |
| `storageBucket` | bucket 名称 |
| `storagePath` | storage 路径 |
| `originalFileName` | 原始文件名 |
| `mimeType` | 文件 MIME 类型 |
| `fileSize` | 文件大小 |
| `status` | 文件状态 |
| `uploadedByType` | 上传者类型 |
| `portalVisible` | 是否在客户 Portal 展示 |
| `portalDownloadable` | 是否允许客户下载 |
| `removedByType` | 移除操作者类型 |
| `removeReason` | 移除原因 |
| `createdAt` | 上传时间 |
| `removedAt` | 移除时间 |

访问规则：

- 客户上传文件前必须校验 token。
- 客户只能上传到 token 对应案件下、客户可见且需要客户处理的资料要求。
- 客户不能访问 `portalVisible = false` 的文件。
- 客户不能下载 `portalDownloadable = false` 的文件。
- 后台访问文件需要内部访问保护。
- 文件预览或下载建议使用短期 signed URL。
- 文件删除或替换不应直接抹除审计线索，应保留 metadata 状态和 timeline event。

## 7. Timeline Event 设计

timeline event 是 V1 的核心审计模型。

必须记录的操作：

- 案件创建。
- 案件阶段变更。
- token 创建。
- token 重新生成。
- token 失效。
- 模板创建、更新和版本创建。
- 模板资料项复制到案件资料要求。
- 案件资料要求新增。
- 案件资料要求状态变更。
- 文件上传。
- 文件删除。
- 文件替换。
- 内部备注新增或重要更新。
- 入管追加材料要求新增或状态变更。
- 客户确认申请书版本创建。
- 客户确认申请书。

建议 metadata 示例：

```json
{
  "from": "submitted",
  "to": "approved",
  "reason": "内部审核通过"
}
```

设计规则：

- `TimelineEvent` 必须关联 `caseId`。
- `targetType` 和 `targetId` 用于关联具体对象。
- `metadata` 保存结构化补充信息。
- `metadata` 禁止保存 plaintext token、signed URL、护照号码等敏感原文。
- 状态变更必须记录 from/to。
- 客户 Portal 不展示完整 timeline。
- timeline 不应只依赖自然语言摘要。

## 8. Token 访问模型

客户访问流程：

1. 系统生成明文 secure token。
2. 将 token 明文发送给客户，作为 Portal 链接的一部分。
3. 数据库只保存 `tokenHash`。
4. 客户访问 `/client/cases/{token}`。
5. 服务端对 token 计算 hash。
6. 服务端查找 active 且未过期的 token。
7. 服务端取得对应 `caseId`。
8. 客户 Portal 只查询该 `caseId` 下的客户可见数据。

关键规则：

- V1 中一个案件同一时间只允许一个 `active` token。
- 重新生成 token 时，旧 token 必须变为 `revoked`。
- token 明文只在创建或重新生成时出现。
- 数据库不保存明文 token。
- token 可失效。
- token 可重新生成。
- token 使用情况可记录 `lastUsedAt`。
- token 校验失败不得返回案件是否存在的敏感细节。
- token 不等同于客户账号。
- token 不授予后台访问能力。

## 9. 高风险点

- 客户 token 越权访问其他案件。
- 一个案件同时存在多个 active token，导致访问控制混乱。
- 数据库存储明文 token。
- 客户接口返回 `InternalNote`。
- 客户接口返回 `internalNote`。
- 客户接口返回 `portalVisible = false` 的资料要求或文件。
- 客户接口允许下载 `portalDownloadable = false` 的文件。
- 客户接口返回完整 timeline。
- 模板修改影响旧案件。
- `CaseDocumentRequirement` 实时引用模板资料项。
- 案件资料要求未保存模板来源和版本信息，导致无法审计。
- 文件和资料要求被设计成一对一。
- 文件没有明确归属，导致权限校验困难。
- 案件阶段和资料状态混用。
- 内部 `approved` 被客户理解为签证批准。
- 入管追加材料被错误设计成独立资料系统，而不是 `CaseDocumentRequirement`。
- 入管追加材料被错误依赖模板。
- 申请书确认不支持多版本，导致客户确认记录无法追踪。
- timeline event 只存文字摘要，无法追踪状态变化。
- V1 数据模型引入 AI、OCR、多员工权限、聊天、支付、手机 App 等超范围对象。

## 10. 后续 Prisma Schema 准备原则

后续编写 Prisma schema 前，应先确认：

- 所有 enum 是否与 `docs/status-rules.md` 一致。
- `DocumentTemplate` 和 `DocumentTemplateItem` 的版本管理策略。
- 模板版本审计字段和 timeline 事件覆盖范围。
- 创建案件时模板复制到 `CaseDocumentRequirement` 的快照字段。
- 客户可见字段是否能通过白名单查询控制。
- `InternalNote` 是否与客户查询路径彻底隔离。
- `internalNote` 字段是否与客户查询路径彻底隔离。
- 文件 metadata 是否能支持 Supabase Storage private bucket。
- token 是否只保存 hash。
- 是否能保证每个案件同一时间只有一个 active token。
- `ApplicationConfirmation` 多版本状态如何表达当前版本。
- timeline event 是否覆盖所有重要操作。

Prisma schema 应在本数据模型文档确认后再编写。
