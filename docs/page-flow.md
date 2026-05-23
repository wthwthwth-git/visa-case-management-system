# 页面与流程

## 1. 页面设计原则

V1 页面应服务小型事务所的高频资料管理操作，避免复杂门户化设计。

原则：

- 后台页面服务事务所内部案件处理。
- 客户 Portal 页面只服务客户资料查看和上传。
- 客户不注册、不登录。
- 客户通过案件专属 token 链接访问。
- 客户页面必须极简，不承载内部管理功能。
- 内部备注不得出现在客户页面或客户接口返回内容中。
- 页面流程围绕统一资料要求、文件上传、资料审核、追加材料和 timeline 记录。
- 不在页面结构文档中描述颜色、动画、视觉风格或 UI 细节。
- 不加入 V1 明确排除的 AI、OCR、多员工权限、聊天、支付、手机 App 等能力。

## 2. V1 页面范围

V1 包含以下页面：

- 后台登录页。
- 后台案件列表页。
- 后台创建案件页。
- 后台案件详情页。
- 模板管理页。
- 客户 Portal 页面。

V1 不包含以下页面：

- 客户注册页面。
- 客户登录页面。
- AI 分析页面。
- OCR 识别页面。
- 员工权限管理页面。
- 聊天页面。
- 支付页面。
- 手机 App 页面。
- 第三方签证系统集成页面。

## 3. 后台登录页

用途：

- 供事务所内部人员进入后台。
- 作为后台访问入口。

显示信息：

- 登录表单。
- 登录失败时的简单错误提示。

可执行操作：

- 输入后台访问凭据。
- 提交登录。
- 登录成功后进入后台案件列表页。

关键规则：

- 后台登录页只面向事务所内部人员。
- 客户不使用后台登录页。
- V1 的后台登录不等同于多员工权限系统。
- V1 不实现复杂角色、权限分组或员工管理页面。

## 4. 后台案件列表页

用途：

- 查看事务所内部所有案件。
- 快速进入案件详情。
- 进入创建案件流程。

显示信息：

- 案件编号。
- 客户姓名。
- 现有签证类型。
- 申请签证类型。
- 当前案件阶段。
- 客户负责资料要求概览。
- 事务所负责资料要求概览。
- 入管追加材料资料要求概览。
- 更新时间。

可执行操作：

- 查看案件列表。
- 按客户姓名、签证类型、案件阶段筛选。
- 搜索案件。
- 进入后台创建案件页。
- 进入后台案件详情页。

关键规则：

- 列表页只显示案件概览，不承担详细审核工作。
- 案件阶段只表示案件整体进度，不表示单个资料要求状态。

## 5. 后台创建案件页

用途：

- 创建新的签证案件。
- 录入客户和签证基础信息。
- 为后续资料模板判断提供基础条件。
- 生成案件专属 token。

显示信息：

- 客户基础信息字段。
- 现有签证类型。
- 申请签证类型。

可执行操作：

- 填写客户基础信息。
- 选择或填写现有签证类型。
- 选择或填写申请签证类型。
- 创建案件。
- 生成案件专属 token。

关键规则：

- 创建案件页不直接假设由用户手动选择资料模板。
- 后续应通过现有签证类型、申请签证类型和客户具体情况判断使用哪个资料模板。
- 在模板判断规则未写清前，不应提前实现复杂模板匹配逻辑。
- 一旦确定使用模板，模板资料项必须复制成案件资料要求 `CaseDocumentRequirement`。
- 案件资料要求不能实时引用模板资料项。
- 案件创建成功必须记录 timeline event。
- 模板复制完成必须记录 timeline event。

## 6. 后台案件详情页

用途：

- 查看和处理单个案件。
- 管理案件阶段、客户负责资料要求、事务所负责资料要求、入管追加材料资料要求和 timeline。

建议包含以下区域：

- 概况。
- 客户资料。
- 事务所资料。
- 入管追加材料。
- 时间线。

### 6.1 概况

显示信息：

- 案件编号。
- 客户基础信息。
- 现有签证类型。
- 申请签证类型。
- 当前案件阶段。
- 客户访问 token 链接。
- 客户负责资料要求状态概览。
- 事务所负责资料要求状态概览。
- 入管追加材料资料要求状态概览。
- 创建时间。
- 更新时间。

可执行操作：

- 更新案件阶段。
- 查看或复制客户 token 链接。
- 重新生成 token。
- 失效 token。
- 查看案件整体进度。

关键规则：

- 案件阶段变更必须记录 timeline event。
- token 重新生成或失效必须记录 timeline event。
- token 不授予客户后台访问能力。

### 6.2 客户资料

客户资料是 `CaseDocumentRequirement` 的一个页面视图，通常筛选 `responsibleParty = customer` 且客户可见的资料要求。

显示信息：

- 资料要求名称。
- 客户可见说明。
- 是否必需。
- 客户展示状态。
- 内部资料要求状态。
- 已上传文件列表。
- 文件上传时间。
- 文件状态。
- 与该资料要求相关的内部备注入口或摘要。

可执行操作：

- 查看客户上传文件。
- 更新资料要求状态。
- 标记资料要求为 `needs_more`。
- 标记资料要求为 `approved`。
- 标记资料要求为 `not_applicable`。
- 添加或更新内部备注。
- 删除、替换或追加文件。

关键规则：

- 一个客户负责资料要求支持多个文件。
- 文件上传不代表资料要求审核通过。
- 客户侧应看到 `accepted`，内部侧可使用 `approved`。
- 内部备注只在后台显示。
- 资料状态变更必须记录 timeline event。
- 文件删除、替换、追加必须记录 timeline event。

### 6.3 事务所资料

事务所资料是 `CaseDocumentRequirement` 的一个页面视图，通常筛选 `responsibleParty = office` 的资料要求，不要求客户通过 Portal 提交。

显示信息：

- 事务所负责资料要求名称。
- 内部说明。
- 是否必需。
- 当前状态。
- 关联文件列表。
- 内部备注。
- 更新时间。

可执行操作：

- 新增事务所负责资料要求。
- 编辑事务所负责资料要求。
- 上传或关联内部文件。
- 更新资料要求状态。
- 添加或更新内部备注。
- 删除、替换或追加文件。

关键规则：

- `responsibleParty = office` 且 `portalVisible = false` 的资料要求不显示在客户 Portal 页面。
- 事务所资料的备注和内部文件不得通过客户页面返回。
- 重要状态变更和文件操作必须记录 timeline event。

### 6.4 入管追加材料

入管追加材料是 `CaseDocumentRequirement` 的一个页面视图，指案件过程中由入管或相关审查方要求补充的材料。其 `sourceType = immigration_request`。

显示信息：

- 追加材料名称。
- 追加原因或说明。
- 来源说明。
- 要求日期。
- 截止日期，可为空。
- 当前状态。
- 关联客户上传文件或内部文件。
- 内部备注。

可执行操作：

- 新增入管追加材料资料要求。
- 编辑追加材料说明。
- 标记是否需要客户提交。
- 上传、删除、替换或追加文件。
- 更新追加材料状态。
- 添加或更新内部备注。

关键规则：

- 入管追加材料不另建一套资料系统，必须作为 `CaseDocumentRequirement` 存在。
- 入管追加材料不是模板生成，而是后台手动新增。
- 如果需要客户补交，应设置 `responsibleParty = customer` 和 `portalVisible = true`，并在客户 Portal 中形成明确补充要求。
- V1 不与政府或第三方签证系统集成。
- 追加材料新增、状态变更和文件操作必须记录 timeline event。

### 6.5 时间线

用途：

- 查看案件重要操作记录。
- 辅助内部交接和审计。

显示信息：

- 事件时间。
- 事件类型。
- 操作者类型。
- 操作摘要。
- 关联资料要求，可为空。
- 关联文件，可为空。
- 结构化元数据摘要。

可执行操作：

- 按时间倒序查看事件。
- 按事件类型筛选。
- 查看事件详情。

关键规则：

- 客户 Portal 页面不展示完整 timeline。
- timeline 只服务事务所内部处理和审计。
- 重要操作必须记录 timeline event。

## 7. 模板管理页

用途：

- 管理常见签证类型和业务场景下的资料模板。
- 管理模板资料项。
- 为后续案件创建和资料要求复制提供来源。

显示信息：

- 模板名称。
- 适用的现有签证类型。
- 适用的申请签证类型。
- 模板说明。
- 模板资料项列表。
- 模板资料项名称。
- 模板资料项说明。
- 是否必需。
- 默认负责方。
- 排序。
- 可接受文件类型说明。
- 模板版本。
- 模板状态。
- 更新时间。

可执行操作：

- 新建模板。
- 编辑模板。
- 创建模板新版本。
- 新增模板资料项。
- 编辑模板资料项。
- 调整模板资料项排序。
- 停用或归档模板。

关键规则：

- 模板只作为创建案件或生成案件资料要求时的来源。
- 已创建案件不会因为模板修改而自动变化。
- 模板资料项不是案件资料要求的实时引用。
- 模板选择或匹配规则应先写入文档，再进入实现。

## 8. 客户 Portal 页面

访问方式：

```text
/client/cases/{token}
```

用途：

- 客户通过事务所发送的案件专属 token 链接访问。
- 查看需要提交的资料。
- 上传一个或多个文件。

显示信息：

- 客户姓名或案件识别信息。
- 申请签证类型。
- 客户可见案件阶段。
- 需要客户提交的资料要求列表。
- 每个资料要求的客户可见说明。
- 每个资料要求是否必需。
- 每个资料要求的客户展示状态。
- 已上传文件列表。
- 文件上传入口。
- 需要客户确认的当前版本申请书。

可执行操作：

- 查看资料要求。
- 为某个资料要求上传一个或多个文件。
- 查看自己已上传的文件信息。
- 确认当前版本申请书。

页面不得展示：

- 后台登录入口。
- 内部管理入口。
- 内部备注。
- 内部操作人信息。
- 内部不可见的事务所负责资料要求。
- 完整 timeline。
- 多员工权限信息。
- 支付入口。
- 聊天入口。
- AI 或 OCR 功能入口。
- 客户注册入口。
- 客户登录入口。

关键规则：

- 客户不注册。
- 客户不登录。
- token 只允许访问对应案件的客户 Portal 页面。
- token 不授予内部管理能力。
- 同一案件同一时间只允许一个 active token。
- 客户 Portal 页面必须极简，只保留完成资料提交所需的信息和操作。
- 上传成功必须记录 timeline event。
- 首次上传后，资料要求可从 `not_submitted` 变为 `submitted`。
- 上传文件不代表资料要求一定 `approved`。
- 客户页面展示内部 `approved` 状态时，应映射为客户侧 `accepted` 或“已接收”。

## 9. 页面跳转关系

后台跳转：

```text
后台登录页 -> 后台案件列表页
后台案件列表页 -> 后台创建案件页
后台案件列表页 -> 后台案件详情页
后台案件详情页 -> 模板管理页
模板管理页 -> 后台创建案件页
```

客户跳转：

```text
客户收到 token 链接 -> 客户 Portal 页面
客户 Portal 页面 -> 文件上传区域
无效 token -> token 无效提示
```

边界规则：

- 客户 Portal 页面不能跳转到后台。
- 后台页面可以复制客户 token 链接。
- 客户 token 不授予后台能力。
- 客户不经过后台登录页。
- 后台登录不改变客户 token 访问机制。

## 10. 主要操作流程

### 10.1 后台登录流程

流程：

1. 内部人员进入后台登录页。
2. 输入后台访问凭据。
3. 登录成功后进入后台案件列表页。
4. 登录失败时显示错误提示。

### 10.2 内部创建案件流程

流程：

1. 内部人员进入后台创建案件页。
2. 填写客户基础信息。
3. 填写或选择现有签证类型。
4. 填写或选择申请签证类型。
5. 提交创建。
6. 系统创建案件。
7. 系统生成案件专属 token。
8. 系统记录案件创建 timeline event。
9. 后续根据签证类型和客户具体情况判断使用哪个资料模板。
10. 一旦确定模板，系统复制模板资料项为案件资料要求。
11. 系统记录模板复制 timeline event。
12. 内部人员复制客户 token 链接并发送给客户。

### 10.3 模板复制到案件资料要求流程

复制流程：

1. 根据已确认的模板读取模板资料项。
2. 为当前案件创建独立的 `CaseDocumentRequirement`。
3. 复制名称、说明、必需性、默认负责方、排序和文件要求说明。
4. 记录模板、模板版本和模板资料项来源信息，便于审计。
5. 不建立实时引用关系。
6. 记录 timeline event。

结果：

- 案件资料要求可以独立编辑。
- 模板后续修改不影响该案件。
- 该案件后续修改不影响模板。

### 10.4 客户通过 token 链接提交资料流程

流程：

1. 客户打开案件专属 token 链接。
2. 系统验证 token。
3. token 有效时展示客户 Portal 页面。
4. 客户查看资料要求列表。
5. 客户选择某个资料要求上传一个或多个文件。
6. 系统保存文件。
7. 系统记录文件上传 timeline event。
8. 如果资料要求原状态为 `not_submitted`，可更新为 `submitted`。
9. 系统记录资料要求状态变更 timeline event。

### 10.5 内部审核客户资料流程

流程：

1. 内部人员进入后台案件详情页。
2. 打开客户资料区域。
3. 查看客户负责资料要求列表和状态。
4. 查看客户上传的一个或多个文件。
5. 根据资料质量更新资料要求状态。
6. 如需补充，标记为 `needs_more`。
7. 如可使用，标记为 `approved`。
8. 如不适用，标记为 `not_applicable`。
9. 可添加内部备注。
10. 系统记录状态变更和备注相关 timeline event。

### 10.6 事务所资料处理流程

流程：

1. 内部人员进入后台案件详情页。
2. 打开事务所资料区域。
3. 新增或查看事务所负责资料要求。
4. 上传、替换或删除内部文件。
5. 更新资料状态。
6. 添加内部备注。
7. 系统记录重要操作 timeline event。

### 10.7 入管追加材料处理流程

流程：

1. 内部人员进入后台案件详情页。
2. 打开入管追加材料区域。
3. 新增 `sourceType = immigration_request` 的资料要求。
4. 填写追加原因、来源说明和要求日期。
5. 判断是否需要客户补交。
6. 如需客户补交，设置 `responsibleParty = customer` 且 `portalVisible = true`，在客户 Portal 中形成明确补充要求。
7. 上传或关联相关文件。
8. 更新追加材料状态。
9. 系统记录重要操作 timeline event。

### 10.8 Timeline 查看流程

流程：

1. 内部人员进入后台案件详情页。
2. 打开时间线区域。
3. 按时间倒序查看重要操作。
4. 必要时按事件类型过滤。
5. 查看事件详情。

客户 Portal 页面 V1 不展示完整 timeline。

## 11. 错误与异常页面

V1 至少考虑：

- token 无效。
- token 已失效。
- 文件上传失败。
- 文件格式不支持。
- 文件过大。
- 案件不存在。
- 资料要求不存在。
- 后台登录失败。

错误提示应面向当前用户角色：

- 客户端提示应简单、可理解，并引导客户联系事务所。
- 后台提示可以更具体，便于内部人员排查。

## 12. 风险点

V1 页面设计和实现必须避免以下风险：

- 把客户 Portal 做成复杂客户账户系统。
- 让客户注册或登录。
- 在客户页面显示内部备注、内部操作人或后台入口。
- 把后台登录页扩展成复杂多员工权限系统。
- 在数据模型中把客户资料、事务所资料和入管追加材料做成三套资料系统。
- 模板管理页修改模板后自动影响已创建案件。
- 客户上传文件后自动视为资料审核通过。
- 客户 Portal 显示完整 timeline，泄露内部处理过程。
- 将入管追加材料扩展成第三方签证系统集成。
- 在页面结构文档中描述颜色、动画或视觉设计。

## Phase 6-1F Addendum: Case Creation Flow Before UI

This addendum records the current API-backed case creation flow and what must exist before a complete UI is built.

### Admin Case Creation Flow

The recommended case creation flow is:

1. `POST /api/admin/cases`
2. `POST /api/admin/cases/[caseId]/apply-template`
3. `POST /api/admin/cases/[caseId]/token/create`

The UI should present these as separate steps because each step can succeed or fail independently.

### Step 1: Create Case

The create case step:

- creates a Customer or reuses an existing Customer
- creates the Case
- generates `caseNumber`
- sets `casePhase = draft`
- does not apply a template
- does not generate document requirements
- does not create a customer Portal token

### Step 2: Apply Template

The apply template step:

- copies template items into `CaseDocumentRequirement`
- sets `sourceType = template`
- writes `sourceTemplateId`, `sourceTemplateVersion`, and `sourceTemplateItemId`
- does not modify `CasePhase`
- does not create a token
- must not show `internalNote`, raw storage fields, token fields, or signed URLs in normal responses

### Step 3: Create Portal Token

The token create step:

- creates the first customer Portal token
- returns `plaintextToken` once in the response
- returns `INVALID_REQUEST` if an active token already exists
- does not return `tokenHash`, raw storage fields, or signed URLs

The UI must clearly show the generated Portal link/token immediately because it cannot be retrieved again later.

### Current Minimum Loop

The current minimum workflow can support:

- create case
- apply template
- create Portal token
- customer Portal view/upload/application confirmation
- Admin review/upload/case phase change/immigration additional requirement/application confirmation version

### UI Pre-Check Gaps

Before building a complete UI, the following are still missing:

- Admin template readonly API
- Admin customer search API
- Admin case update API
- Admin custom requirement API
- Admin file delete/replace API
- formal admin auth

### UI Recommendation

Next recommended order:

1. Build Template readonly API.
2. Build Customer search API.
3. Then start the UI shell.

Without template list and customer search APIs, the create case UI will require manual IDs and will not be practical.

### Risks

- `requireAdminAuth` is still a development placeholder and cannot be used for production.
- `plaintextToken` can only be shown once after token creation.
- The UI must handle partial failures across the three-step flow.
- Full UI work before template list and customer search APIs may create brittle workflows.

## Phase 7-10 Addendum: Admin UI Current State and Demo Readiness

This addendum records the Admin UI shell and interaction coverage completed in Phase 7. It does not change the V1 product scope.

### Completed Admin UI Pages

The current Admin UI includes:

- `/admin/cases`
- `/admin/cases/new`
- `/admin/cases/[caseId]`

These pages are development back-office pages. They depend on the existing Admin API routes and must not be treated as production-safe until real Admin authentication replaces the placeholder auth.

### Completed Admin UI Capabilities

The current Admin UI supports the following workflows:

- View case list.
- Create a case.
- Search and reuse an existing Customer.
- Create a new Customer during case creation.
- Apply a DocumentTemplate to a Case.
- Create the first Portal token.
- View case detail, requirements, application confirmations, timeline, and customer summary.
- Review requirement status.
- Upload an Admin file to a requirement.
- Add immigration additional requirement.
- Change case phase.
- Create an ApplicationConfirmation version.
- Regenerate Portal token.
- Revoke Portal token.

### Admin UI Safety and UX Rules

The Admin UI must continue to follow these rules:

- UI calls API routes only.
- UI must not import Prisma.
- UI must not import `adminServices` or `portalServices`.
- UI must not directly access Supabase Storage.
- UI must not cache signed URLs.
- UI must not persist plaintext Portal tokens.
- `plaintextToken` is shown only once after token create or regenerate.
- Token regenerate keeps the modal open long enough to copy the new plaintext token.
- Closing the token modal clears the token from React state.
- Normal UI must not display raw metadata JSON.
- Normal UI must not display `tokenHash`, raw `storagePath`, or raw `storageBucket`.
- Mutation modal loading, error, and success behavior should stay consistent.
- Mutation errors should keep user input intact.
- Case phase warnings are warnings, not failed submissions.
- The UI should remain usable at narrow screen widths.
- The development-only banner must remain visible while Admin auth is a placeholder.

### Current Admin Detail Layout

The current case detail page is organized as:

- Top summary cards.
- Case phase progress and phase change action.
- Grouped requirements:
  - customer requirements
  - office requirements
  - immigration additional requirements
- Right-side cards:
  - customer information
  - Portal token management
  - application confirmation versions
  - checklist / next steps
- Timeline.

### Still Unfinished UI / Product Areas

The following are intentionally unfinished:

- Formal Admin auth.
- Portal UI polish.
- Admin custom requirement API and UI.
- File delete and replace flow.
- Application confirmation preview/download.
- Template management UI.
- Customer detail/update UI.
- Real global search.
- Real notifications.
- Email or send-link flow.

### Demo Readiness

The current system is suitable for an internal development demo if the audience understands that Admin auth is not production-ready.

Demo environment must prepare:

- `DATABASE_URL`
- `DIRECT_URL`
- `TOKEN_HASH_SECRET`
- Supabase Storage variables if demonstrating file upload:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_STORAGE_BUCKET`
- A migrated database.
- Seed or real test data for templates and at least one case.

Recommended demo flow:

1. Open `/admin/cases`.
2. Show case list and development-only banner.
3. Open `/admin/cases/new`.
4. Search an existing Customer or create a test Customer.
5. Create a Case.
6. Apply a template.
7. Create the first Portal token and explain that plaintext token is shown once.
8. Open `/admin/cases/[caseId]`.
9. Review requirements and grouped sections.
10. Upload an Admin file to a requirement if Storage env is configured.
11. Change a requirement status.
12. Add an immigration additional requirement.
13. Change case phase and explain warnings.
14. Create an application confirmation version.
15. Regenerate/revoke Portal token and explain token safety.

During demo, explicitly mark these as still in development:

- real Admin authentication
- Portal UI polish
- signed URL preview/download in Admin UI
- file delete/replace
- template management UI
- customer profile editing
- email/send-link flow

### Demo Risks

- `requireAdminAuth` is still a placeholder.
- The app must not be exposed publicly as a real back office.
- `TOKEN_HASH_SECRET` must exist before token create/validate flows.
- Changing `TOKEN_HASH_SECRET` makes existing Portal tokens unverifiable.
- Token regenerate revokes the previous active token.
- Plaintext token cannot be recovered after the UI closes.
- File upload demo requires Supabase Storage env to be configured.
