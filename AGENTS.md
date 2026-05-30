# AGENTS.md

## 1. 项目背景

本项目是签证案件资料管理系统 V1，面向小型事务所。

系统目标是帮助事务所围绕单个签证案件完成：

- 创建案件。
- 选择签证业务类型和申请签证类型。
- 从模板生成案件资料项。
- 调整、删除、追加资料项。
- 管理客户上传文件和事务所制作文件。
- 审核客户资料。
- 管理案件阶段。
- 通过客户专属 Portal token 链接让客户提交资料。
- 记录关键操作履历。

本项目不是完整 CRM，不是客户登录平台，也不是自动化签证申请系统。

## 2. 当前系统状态

当前系统已经进入稳定化和内部试运行准备阶段，不再是 Phase 0 文档初始化阶段。

已完成的主要能力：

- Admin UI：案件列表、新建案件、案件详情、资料管理、阶段切换、通知、变更履历。
- Portal UI：客户资料提交、文件上传、提交/撤回资料、事务所资料确认。
- Auth：后台 Google OAuth allowlist 登录。
- Admin 安全：route-level auth、CSRF、rate limit。
- Portal 安全：token-only access，不使用后台 session。
- 模板：210 套签证材料模板已导入，创建案件时复制为案件资料项。
- 文件：支持一个资料项多个文件，文件下载通过 signed URL。
- 文档：已补充 service boundary、API contract、status rules、E2E QA 和 stability rules。

后续工作重点：

- 修复明确 bug。
- 稳定业务逻辑。
- 补充测试。
- 同步文档。
- 准备内部试运行和 staging demo。

## 3. 工作原则

后续任何代理或开发者都必须遵守：

- 先读文档，再做设计或开发。
- 不扩大 V1 范围。
- 不提前实现被明确排除的功能。
- 保持 Admin 和 Portal 边界清晰。
- 保持客户访问流程简单。
- 所有影响业务对象、状态、权限边界、客户可见信息、文件删除、token、timeline event 的变更，都必须同步更新文档。
- 修改代码后必须运行必要测试。
- 不提交 `.env.local`。
- 不输出 secret、token、signed URL、service role key、OAuth secret、Redis token。

## 4. 核心业务规则

### 4.1 客户访问

- 客户不注册。
- 客户不登录。
- 客户通过案件专属 token 链接访问 Portal。
- token 只允许访问对应案件的客户资料提交页面。
- token 不授予后台管理能力。
- plaintext token 只在创建或重新生成时显示一次。
- 如果错过 plaintext token，只能重新生成链接，不能复制或恢复旧 token。

### 4.2 Admin / Portal 分离

- Admin API 只能调用 `adminServices`。
- Portal API 只能调用 `portalServices`。
- UI 不直接 import Prisma、services 或 Storage client。
- Portal route 不接收、不信任前端传入的 `caseId`。
- Portal 必须通过 token 解析案件。
- Portal 不使用 Admin session。
- Portal 不使用 Admin CSRF。

### 4.3 Portal 禁止返回字段

普通 Portal DTO 和 Portal UI 不得包含：

- `internalNote`
- `storagePath`
- `storageBucket`
- `tokenHash`
- plaintext token
- `passportNumber`
- `residenceCardNumber`
- `originalFileName`
- raw `metadata`
- `actorId`
- `actorType`
- internal operator info
- `signedUrl`

唯一例外：专门的 signed URL API 可以返回：

- `signedUrl`
- `expiresAt`

即使是 signed URL API，也不得返回 `storagePath` 或 `storageBucket`。

### 4.4 模板和案件资料项

- 创建案件时，模板资料项必须复制为案件资料项。
- 案件资料项不能实时引用模板资料项。
- 模板后续修改不影响已创建案件。
- 案件资料项后续修改不影响模板。
- 创建案件时可以预览模板材料、删减材料、追加自定义材料，再确认生成案件。

### 4.5 资料项和文件

- 一个案件可以有多个资料项。
- 一个资料项支持多个文件。
- 文件上传不代表资料审核通过。
- 客户上传文件后，必须点击提交资料，才进入已提交状态。
- 客户撤回资料后，应回到未提交状态，并清理对应已上传文件。
- 文件删除必须通过 service/API 处理，不允许只在 UI 隐藏。
- 删除文件时应同时考虑数据库记录和 Storage object 清理。

### 4.6 案件阶段和资料状态分离

- 案件阶段描述整个案件进度。
- 资料状态描述单个资料项的提交或审核情况。
- 文件状态不代替资料状态。
- 切换案件阶段不应自动审核资料。
- 切换案件阶段不应自动创建入管追加材料。

当前案件阶段显示应保持整合：

- 草稿
- 材料收集中
- 资料做成中
- 提交审查中
- 审查完了

### 4.7 客户资料状态

客户资料状态用于客户提交材料和后台审核：

- 未提交
- 已提交
- 需补充
- 需修改
- 已通过

规则：

- 未提交资料可以设置截止日期。
- 截止日期显示在客户 Portal 的未提交资料上。
- 距截止日期不足一周时，客户 Portal 应明显提示。
- 已通过资料在后台客户资料列表中应靠后显示。

### 4.8 事务所资料状态

事务所资料用于后台制作，并在可给客户确认时显示到 Portal。

事务所资料状态：

- 制作中
- 已完成
- 已确认
- 需修改

规则：

- 制作中的事务所资料不显示给客户。
- 已完成、已确认、需修改的事务所资料可以显示在客户 Portal 的完成资料确认区域。
- 客户确认后，后台状态应变成已确认。
- 客户要求修改时，后台应显示客户填写的说明。
- 已确认状态下不显示客户此前的要求修改说明。

### 4.9 内部备注和补充说明

- 内部备注只给后台看。
- 内部备注不得返回给客户。
- 补充说明可以给客户看。
- 后台添加备注时，应区分：
  - 补充说明：显示给客户。
  - 内部备注：只给内部人员看。

### 4.10 Timeline / 变更履历

重要操作必须记录变更履历。

至少包括：

- 案件创建。
- 模板复制。
- 文件上传。
- 文件删除或替换。
- 资料提交。
- 资料撤回。
- 资料项状态变更。
- 事务所资料确认或要求修改。
- 案件阶段变更。
- 内部备注新增或重要更新。
- token 创建、重新生成或撤销。

变更履历 metadata 禁止保存：

- plaintext token
- tokenHash
- signedUrl
- storagePath
- storageBucket
- session token
- CSRF token
- provider token
- service role key
- 护照号
- 在留卡号

## 5. V1 禁止或暂缓实现的内容

V1 不实现：

- AI。
- OCR。
- 多员工权限。
- 聊天。
- 支付。
- 手机 App。
- 客户注册。
- 客户登录。
- 自动表格填写。
- 第三方签证系统集成。

通知功能已经有基础后台通知，但复杂通知仍暂缓：

- 邮件自动发送。
- LINE/微信通知。
- 客户浏览器推送。
- 定时催办。
- 多员工分配。
- 已读回执复杂统计。

如果需要加入以上能力，必须先更新产品规格和验收清单，并明确是否进入 V1 之外的新范围。

## 6. 文档优先规则

当需求影响以下内容时，必须同步更新文档：

- 业务对象。
- 案件阶段。
- 资料状态。
- 文件上传/删除规则。
- 客户可见字段。
- 后台可见字段。
- token 生命周期。
- Admin / Portal 边界。
- timeline / 变更履历。
- 安全规则。

优先检查和更新：

- `docs/product-spec.md`
- `docs/status-rules.md`
- `docs/page-flow.md`
- `docs/api-contract.md`
- `docs/service-boundary.md`
- `docs/acceptance-checklist.md`
- `docs/stability-rules.md`
- `docs/e2e-qa.md`

## 7. 开发前检查

进入业务代码开发前，至少检查：

- 文档是否已定义对应业务规则。
- 是否违反 Admin / Portal 边界。
- 是否会让 Portal 泄露内部字段。
- 是否影响 token 只显示一次的规则。
- 是否影响文件删除和 Storage 清理规则。
- 是否需要新增或更新 timeline event。
- 是否违反 V1 禁止实现内容。

## 8. 测试和验证

修改代码后，根据影响范围运行：

- `npm run test`
- `npm run typecheck`
- `npm run lint`
- `npm run prisma:validate`
- `npm run test:e2e`（涉及主要页面流程时）

涉及数据库测试数据时：

- 只清理明确测试前缀的数据。
- 不删除正式模板数据。
- 不删除真实业务数据。
- 不使用 production DB。

## 9. Git 和环境变量规则

- 不提交 `.env.local`。
- 不提交真实 secret。
- 不输出完整数据库 URL。
- 不输出 service role key。
- 不输出 OAuth secret。
- 不输出 Redis token。
- 不输出 plaintext Portal token。
- 不输出 signed URL。
- 提交前确认 `git status` 中没有敏感文件。

## 10. 重要约束摘要

- 客户不注册、不登录。
- 客户通过案件专属 token 链接访问。
- Admin / Portal 必须严格分离。
- Portal 不得返回内部字段。
- plaintext token 只显示一次，错过只能重新生成。
- 模板创建案件时必须复制到案件资料项，不能直接引用模板。
- 一个资料项支持多个文件。
- 文件上传不等于资料提交。
- 案件阶段和资料状态必须分离。
- 内部备注不得显示给客户。
- 文件删除必须通过 service/API 处理，并关注 Storage 清理。
- 重要操作必须记录变更履历。
