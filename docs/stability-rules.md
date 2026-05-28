# 稳定规则补充

最后更新：2026-05-28

本文记录当前稳定版本必须保持的业务边界，供后续 API、UI、QA 和上线前检查使用。

## 1. 案件阶段显示规则

后台和客户画面使用同一套简化进度文案：

| 数据库阶段 | 后台显示 | 客户显示 |
| --- | --- | --- |
| `draft` | 草稿 | 不显示为客户进度起点 |
| `collecting_documents` | 材料收集中 | 材料收集中 |
| `preparing_application` | 资料做成中 | 资料做成中 |
| `submitted` | 提交审查中 | 提交审查中 |
| `under_review` | 提交审查中 | 提交审查中 |
| `approved` | 审查完了 | 审查完了 |
| `rejected` | 审查完了 | 审查完了 |
| `closed` | 审查完了 | 审查完了 |

客户画面不显示“草稿”节点，从“材料收集中”开始展示横向进度。

`submittedAt` 和 `submissionNumber` 只在案件进入 `submitted` 或之后阶段时显示。未进入提交阶段时，即使数据库存在旧值，也不应在 UI 上展示。

## 2. 客户资料状态规则

客户负责提交的资料项使用以下状态：

| 数据库状态 | 后台显示 | 客户显示 | 说明 |
| --- | --- | --- | --- |
| `not_submitted` | 未提交 | 未提交 | 初始状态，可上传文件，可设置截止日期 |
| `submitted` | 已提交 | 已提交 | 客户已点击“提交材料”，后台待确认 |
| `needs_more` | 需补充 | 需补充 | 事务所要求补充，客户可继续上传 |
| `not_applicable` | 需修改 | 需修改 | 事务所认为资料需修改，客户可重新处理 |
| `approved` | 已通过 | 事务所已确认 | 事务所已确认客户资料 |

客户撤回已提交资料时，后台状态应回到 `not_submitted`，相关已上传文件应从该资料项中移除或隐藏，恢复为可重新上传的状态。

已通过资料在后台列表中排序靠后，方便优先处理未提交、已提交、需补充和需修改资料。

## 3. 事务所资料状态规则

事务所负责制作的资料项使用简化状态：

| 状态含义 | 推荐映射 | 后台显示 | 客户显示 |
| --- | --- | --- | --- |
| 制作中 | 未完成状态 | 制作中 | 不显示 |
| 已完成 | 可供客户确认 | 已完成 | 显示在“完成资料确认” |
| 已确认 | 客户确认无误 | 已确认 | 显示在“完成资料确认” |
| 需修改 | 客户要求修改 | 需修改 | 显示在“完成资料确认” |

制作中的事务所资料不显示给客户。已完成、已确认、需修改的事务所资料可以显示给客户，并通过文件名下载/预览。

客户点击“确认无误”后，后台应显示为“已确认”。客户点击“要求修改”时，应保存客户填写的说明；当状态变更为其他状态后，客户要求的说明不再作为当前提示展示。

## 4. 截止日期规则

截止日期用于客户资料提交提醒。

- 后台可为客户资料设置或修改截止日期。
- 只有未提交的客户资料在客户画面显示截止日期。
- 截止日期距离当前日期不足 7 天时，客户画面的资料卡片使用轻微红色警示背景。
- 追加客户资料时可以设置截止日期。
- 事务所资料不使用客户提交截止日期。

## 5. 客户与后台可见字段

客户 Portal 普通 DTO 禁止返回或渲染：

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
- signed URL，除专门 signed URL API 的一次性响应外

后台可显示必要的内部信息，例如内部备注、上传文件列表、timeline metadata 的安全摘要，但仍不得显示 tokenHash、signed URL、Storage raw path/bucket 或密钥。

补充说明是给客户看的字段。内部备注只给后台人员看，不得进入客户 API 或客户 UI。

## 6. 客户链接规则

Portal token 明文只在创建或重新生成成功后的弹窗中显示一次。

未来如增加“一键复制最新链接”，也只能复制当前刚生成、仍保存在前端临时状态中的链接；不能从数据库恢复旧明文 token。若弹窗关闭或页面刷新后错过，只能重新生成链接，旧 active token 会按服务规则失效。

不得将 plaintext token 写入：

- 数据库
- timeline metadata
- audit metadata
- console log
- URL query
- localStorage / sessionStorage / IndexedDB

## 7. 文件删除规则

文件删除是关键安全操作，不应只做视觉隐藏。

当前稳定规则：

- 删除单个文件、全部删除文件、撤回客户提交资料、删除资料项时，应删除或隐藏对应 `DocumentFile` 数据库记录。
- 服务层应尝试删除 Supabase Storage 中对应 object，避免长期留下孤儿文件。
- Storage 删除失败不得向客户暴露 storagePath/storageBucket，但后台可以显示安全的失败信息。
- 文件删除 timeline metadata 只允许保存 `fileId`、`requirementId`、`fileSize`、`mimeType` 等安全摘要。
- timeline metadata 禁止保存 signed URL、storagePath、storageBucket、plaintext token、tokenHash、证件号、原始 cookie/header。

如果后续决定改为软删除，需要先补 schema、service、文档和 QA 规则，并明确 Storage object 的保留周期。

## 8. E2E 与清理规则

默认测试不得依赖外部数据库、Storage、Redis 或真实 Google 登录。

- `npm run test`：单元测试和 mock 测试。
- `npm run test:e2e`：Playwright runtime smoke，可自动启动本地 dev server。
- `E2E_ADMIN_STORAGE_STATE`：提供已登录后台状态后，才运行登录态后台点击流程。
- `E2E_PORTAL_TOKEN`：提供测试 Portal token 后，才运行有效客户 Portal 手机端流程。
- `npm run qa:cleanup-test-data -- --dry-run`：只做清理预演。
- `CLEANUP_TEST_DATA=1 npm run qa:cleanup-test-data -- --execute`：只清理明确测试前缀或测试邮箱后缀的数据。

清理脚本不得删除正式模板数据、真实客户数据或无法明确识别的业务数据。
