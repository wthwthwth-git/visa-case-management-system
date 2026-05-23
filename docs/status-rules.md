# 状态规则

## 1. 状态设计原则

V1 必须把案件阶段、资料要求状态、客户展示状态和文件状态分开设计、分开存储、分开展示。

核心原则：

- 案件阶段描述整个案件的业务进度。
- 资料要求状态描述单个 `CaseDocumentRequirement` 的提交和审核情况。
- 客户展示状态描述客户在 token Portal 看到的状态文案。
- 文件状态只描述具体 `DocumentFile` 自身的处理情况。
- 一个案件只能有一个当前案件阶段。
- 一个案件阶段下，可以存在多个不同资料要求状态。
- 一个资料要求状态变化，不一定意味着案件阶段变化。
- 文件上传不代表资料审核通过。
- 客户访问 token 链接不代表资料已经提交。
- 模板资料项状态不得作为案件资料要求状态实时引用。

## 2. 案件阶段 Case Phase

案件阶段用于描述整个签证案件的业务进度。

V1 固定案件阶段 enum：

```text
draft
collecting_documents
preparing_application
submitted
under_review
approved
```

| 阶段 | 含义 | 客户是否可见 | 客户展示建议 |
| --- | --- | --- | --- |
| draft | 内部刚创建，尚未正式开始 | 不显示 | 不向客户开放或显示链接不可用 |
| collecting_documents | 正在向客户收集资料 | 可显示 | 资料收集中 |
| preparing_application | 正在准备申请书或递交材料 | 可显示 | 正在准备申请材料 |
| submitted | 已递交签证申请 | 可显示 | 已递交申请 |
| under_review | 入管或审查方正在审理 | 可显示 | 审理中 |
| approved | 签证申请审查已结束 | 可显示 | 审查完了 |

案件阶段只回答一个问题：这个案件整体推进到哪里了。

## 3. 资料要求内部状态 Requirement Status

资料要求内部状态用于描述单个 `CaseDocumentRequirement` 的提交和审核情况。

V1 固定资料要求内部状态 enum：

```text
not_submitted
submitted
needs_more
approved
not_applicable
```

| 状态 | 含义 | 客户侧映射 |
| --- | --- | --- |
| not_submitted | 该资料要求尚无有效提交文件 | not_submitted |
| submitted | 已提交至少一个文件，等待内部审核 | submitted |
| needs_more | 内部审核认为资料不足，需要补充 | needs_more |
| approved | 内部确认该资料要求可用于案件处理 | accepted |
| not_applicable | 当前案件不需要该资料要求 | not_applicable |

`approved` 是事务所内部资料审核状态，不是签证申请结果。客户页面不得直接使用容易被误解为“签证批准”的文案。

## 4. 客户展示状态 Client Document Status

客户展示状态用于描述客户在 token Portal 看到的资料要求状态。

V1 固定客户展示状态 enum：

```text
not_submitted
submitted
needs_more
accepted
not_applicable
```

| 状态 | 含义 | 客户是否可见 | 客户展示建议 |
| --- | --- | --- | --- |
| not_submitted | 客户尚未提交该资料要求文件 | 可显示 | 未提交 |
| submitted | 客户已提交至少一个文件，等待事务所处理 | 可显示 | 已提交，等待处理 |
| needs_more | 事务所认为资料不足，需要客户补充 | 可显示 | 需要补充 |
| accepted | 事务所已接收该资料要求，可用于案件处理 | 可显示 | 已接收 |
| not_applicable | 当前案件不需要该资料要求 | 可显示或隐藏 | 不适用 |

客户展示状态通常由内部状态映射产生，不建议作为独立业务判断来源。

映射规则：

```text
internal.not_submitted -> client.not_submitted
internal.submitted -> client.submitted
internal.needs_more -> client.needs_more
internal.approved -> client.accepted
internal.not_applicable -> client.not_applicable
```

## 5. 文件状态 File Status

文件状态用于描述单个 `DocumentFile` 本身。

V1 固定文件状态 enum：

```text
uploaded
removed
replaced
```

| 状态 | 含义 |
| --- | --- |
| uploaded | 文件已上传 |
| removed | 文件已移除 |
| replaced | 文件已被替换 |

文件状态不代替资料要求状态。客户上传文件后，资料要求状态可以从 `not_submitted` 变为 `submitted`，但是否变为 `approved` 必须由内部人员判断。

## 6. 资料要求来源与负责方

`CaseDocumentRequirement` 使用字段区分来源和负责方。

负责方 enum：

```text
customer
office
```

来源 enum：

```text
template
custom
immigration_request
system
```

规则：

- `responsibleParty = customer` 表示需要客户查看、提交或处理。
- `responsibleParty = office` 表示由事务所内部准备或处理。
- `sourceType = template` 表示从 `DocumentTemplateItem` 复制而来。
- `sourceType = custom` 表示后台手动追加。
- `sourceType = immigration_request` 表示入管追加材料。
- 入管追加材料不是独立资料系统，而是 `sourceType = immigration_request` 的 `CaseDocumentRequirement`。
- 从模板复制到案件资料要求后，状态独立存在，不再实时引用模板。

## 7. 客户可见规则

客户 token Portal 只能展示客户完成资料提交和确认所需要的信息。

客户可见：

- 客户可见的案件阶段展示文案。
- `portalVisible = true` 的资料要求。
- `responsibleParty = customer` 的资料要求。
- 资料要求名称。
- 资料要求客户可见说明。
- 是否必需。
- 客户展示状态。
- `portalVisible = true` 的已上传文件列表。
- `portalDownloadable = true` 的文件下载入口。
- 上传入口。
- 需要客户确认的当前版本申请书。

客户不可见：

- 内部状态字段名。
- 内部备注。
- `internalNote`。
- `responsibleParty = office` 且 `portalVisible = false` 的资料要求。
- `portalVisible = false` 的文件。
- `portalDownloadable = false` 的文件下载能力。
- 内部操作人信息。
- 内部管理入口。
- 完整 timeline。
- 多员工权限信息。
- AI、OCR、聊天、支付等 V1 排除能力入口。

特殊规则：

- `draft` 阶段默认不向客户展示案件内容。
- 不再单独设置 `closed` 阶段；案件结束统一使用 `approved`（审查完了）表示。
- `not_applicable` 可以在客户页面显示为“不适用”，也可以隐藏，但同一产品实现中应保持一致。
- 客户页面展示 `accepted` 时，应使用“已接收”或类似文案，避免使用“已批准”。

## 8. 状态之间的关系

允许的关系示例：

- 案件处于 `collecting_documents` 时，某些资料要求可以是 `not_submitted`，某些可以是 `submitted`。
- 案件处于 `preparing_application` 时，某些资料要求可以是 `approved`，某些可以是 `not_applicable`。
- 案件处于 `collecting_documents` 时，也可以存在 `sourceType = immigration_request` 的入管追加资料要求。
- 案件处于 `approved` 时，资料要求状态一般应已经稳定，但不要求所有资料要求都必须是 `approved`。

禁止的关系假设：

- 不能因为所有资料要求都是 `submitted`，就自动认为案件阶段是 `submitted`。
- 不能因为案件阶段是 `submitted`，就自动认为所有资料要求都是 `approved`。
- 不能把 `needs_more` 当作案件阶段。
- 不能把 `under_review` 当作资料要求状态。
- 不能用文件数量直接推断资料要求已经通过审核。

## 9. 允许的状态切换规则

### 9.1 案件阶段切换

常见流转：

```text
draft -> collecting_documents -> preparing_application -> submitted -> under_review -> approved
```

允许根据实际业务跳过部分阶段，但每次案件阶段变更必须记录 timeline event。

允许的回退示例：

- `preparing_application -> collecting_documents`：准备申请书时发现仍需客户补充资料。
- `submitted -> preparing_application`：递交前后发现申请书或材料仍需调整。
- `under_review -> collecting_documents`：审查中需要客户或事务所补充资料。
- `under_review -> approved`：审查完了。

禁止的自动切换：

- 不得因为客户上传了文件，就自动把案件阶段切到 `preparing_application`。
- 不得因为所有资料要求为 `approved`，就自动把案件阶段切到 `submitted`。
- 不得因为 token 被访问，就自动推进案件阶段。

### 9.2 资料要求状态切换

常见流转：

```text
not_submitted -> submitted -> approved
not_submitted -> submitted -> needs_more -> submitted -> approved
not_submitted -> not_applicable
submitted -> needs_more
submitted -> approved
needs_more -> submitted
needs_more -> approved
approved -> needs_more
approved -> not_applicable
not_applicable -> not_submitted
```

说明：

- 客户首次上传文件后，资料要求状态可以从 `not_submitted` 变为 `submitted`。
- 客户补充上传文件后，资料要求状态可以从 `needs_more` 变为 `submitted`。
- 内部审核通过后，资料要求状态可以变为 `approved`。
- 内部发现问题后，资料要求状态可以变为 `needs_more`。
- 某项资料要求不适用于当前案件时，可以变为 `not_applicable`。
- 如果内部后来确认资料要求仍然需要提交，可以从 `not_applicable` 改回 `not_submitted`。

### 9.3 文件状态切换

常见流转：

```text
uploaded -> removed
uploaded -> replaced
```

说明：

- 文件上传、删除、替换都必须记录 timeline event。
- 文件状态变化不等于资料要求审核通过。
- 文件被删除后，如果资料要求下没有可用文件，内部人员应判断是否需要把资料状态改回 `not_submitted` 或 `needs_more`。

## 10. Token 状态规则

Token 状态 enum：

```text
active
revoked
expired
```

规则：

- V1 中一个案件同一时间只允许一个 `active` token。
- 重新生成 token 时，旧 token 必须变为 `revoked`。
- token 失效、重新生成必须记录 timeline event。
- token 访问不代表客户提交资料。

## 11. 申请书确认状态规则

申请书确认状态 enum：

```text
pending
confirmed
needs_revision
superseded
```

规则：

- `ApplicationConfirmation` 必须支持多个版本。
- 新版本上传后，旧版本应变为 `superseded` 或被明确标记为非当前版本。
- 客户确认申请书不代表案件阶段自动变为 `submitted`。
- 客户确认动作必须记录 timeline event。

## 12. 禁止的状态混用

以下设计或实现都不允许：

- 用案件阶段字段保存资料要求状态。
- 用资料要求状态字段保存案件阶段。
- 用文件状态代替资料要求状态。
- 用文件数量直接推断资料要求已通过。
- 用客户是否访问过 token 链接推断资料已提交。
- 在客户页面展示内部专用阶段说明或内部备注。
- 在客户页面把 `approved` 展示为“签证已批准”。
- 把模板资料项状态作为案件资料要求状态直接引用。
- 让模板状态修改自动影响已创建案件的资料要求状态。
- 让客户展示状态反向覆盖内部资料要求状态。

## 13. 状态变更的 Timeline Event 记录要求

以下状态相关操作必须记录 timeline event：

- 案件阶段变更。
- 资料要求状态变更。
- 文件上传导致资料状态从 `not_submitted` 变为 `submitted`。
- 资料要求被标记为 `needs_more`。
- 资料要求被标记为 `approved`。
- 资料要求被标记为 `not_applicable`。
- `not_applicable` 被改回需要提交的状态。
- token 重新生成。
- token 失效。
- 申请书确认版本创建。
- 申请书确认状态变更。
- 文件上传。
- 文件删除。
- 文件替换。

Timeline event 应记录变更前状态和变更后状态。

建议元数据：

```json
{
  "from": "submitted",
  "to": "approved",
  "reason": "内部审核通过"
}
```

状态变更事件建议至少包含：

- 事件类型。
- 关联案件。
- 关联资料要求，可为空。
- 关联文件，可为空。
- 操作者类型。
- 变更前状态。
- 变更后状态。
- 操作摘要。
- 发生时间。

## 14. 风险点

V1 实现时必须特别注意以下风险：

- `approved` 容易被客户误解为签证获批，客户侧必须映射为 `accepted` 或“已接收”。
- 文件上传只是提交行为，不能代表资料质量合格。
- 案件阶段和资料要求状态如果混用，会导致流程无法审计。
- `needs_more` 是资料要求状态，不是案件阶段。
- `submitted` 同时可能出现在案件阶段和资料要求状态中，实现时必须使用不同字段和上下文。
- token 访问只代表客户打开过链接，不代表客户提交过资料。
- 一个案件同时存在多个 active token 会导致客户访问边界混乱。
- 内部备注不得通过客户接口返回。
- 模板资料项不能成为案件资料要求的实时引用来源。
- 入管追加材料应作为 `CaseDocumentRequirement`，不得另起一套资料系统。
- `not_applicable` 的客户展示策略必须一致，避免同一系统中有时隐藏、有时显示。
- 状态切换如果不记录 timeline event，后续无法追踪资料审核和案件推进过程。

## 15. V1 示例

示例案件：

- 案件阶段：`under_review`。
- 护照首页内部状态：`approved`，客户看到：`accepted`。
- 银行流水内部状态：`needs_more`，客户看到：`needs_more`。
- 在职证明内部状态：`submitted`，客户看到：`submitted`。
- 入管追加材料：`sourceType = immigration_request`，`responsibleParty = customer`，状态为 `needs_more`。
- 户口本内部状态：`not_applicable`，客户看到：`not_applicable` 或不显示。

这个示例说明：一个案件只有一个当前案件阶段，但每个资料要求都有自己的内部状态和客户展示状态。
