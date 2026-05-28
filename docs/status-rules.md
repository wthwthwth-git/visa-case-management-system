# 状态规则

最后更新：2026-05-28

本文件定义案件阶段、客户资料状态、事务所资料状态、文件状态和关键 timeline event 的边界。

## 1. 核心原则

- 案件阶段描述整个案件进度。
- 资料状态描述单个资料项的提交、制作或审核情况。
- 文件上传状态不等于资料审核状态。
- 客户 Portal 只能看到客户可见 DTO，不得看到后台内部字段。
- 任何状态变更必须写入安全的 timeline event。

## 2. 案件阶段

系统内部仍可保留完整枚举，但 V1 UI 使用以下五段业务进度：

| UI 进度 | 对应内部阶段 | 业务含义 |
| --- | --- | --- |
| 草稿 | `draft` | 后台刚创建案件，通常不作为客户进度展示 |
| 材料收集中 | `collecting_documents` | 客户提交资料、事务所整理资料 |
| 资料做成中 | `preparing_application` | 事务所制作申请材料 |
| 提交审查中 | `submitted`, `under_review` | 已向相关机构提交或处于审查中 |
| 审查完了 | `approved`, `rejected`, `closed` | 审查结果或案件结束 |

后台可切换案件阶段，但案件阶段切换不得自动改变资料状态，也不得自动创建入管追加材料。

`submittedAt` 和 `submissionNumber` 只在 `submitted` 或之后阶段显示；较早阶段不显示。

### Timeline

案件阶段变更写入：

- eventType: `case_phase_changed`
- metadata 只允许：`oldPhase`、`newPhase`、`reason`、`warnings`、`submittedAt`、`submissionNumber`、`resultAt`

禁止写入：内部备注、storage path/bucket、signed URL、token、证件号、原始文件名。

## 3. 客户资料状态

客户资料是客户在 Portal 中上传并提交的资料。

| 内部状态 | 后台显示 | 客户显示 | 可执行操作 |
| --- | --- | --- | --- |
| `not_submitted` | 未提交 | 未提交 | 客户上传文件、后台设置截止日期 |
| `submitted` | 已提交 | 已提交 | 后台审核；客户可撤回后重新处理 |
| `needs_more` | 需补充 | 需补充 | 客户补充上传；后台可写补充说明 |
| `not_applicable` | 需修改 | 需修改 | 客户重新上传或调整；后台可写补充说明 |
| `approved` | 已通过 | 事务所已确认 | 通常不再需要客户操作 |

客户上传文件后，资料可以先保持待提交状态；客户点击“提交材料”后才进入 `submitted`，并触发后台通知。

客户撤回已提交资料后，应恢复为 `not_submitted`，并清除该资料项下客户刚提交的文件记录或使其不再显示，避免后台继续误判为已提交。

后台将客户资料从 `approved` 改回 `submitted`、`needs_more` 或 `not_applicable` 时，必须遵守服务层状态切换规则；如不允许，应返回安全错误并在 UI 中给出中文提示。

### Timeline

资料状态变更写入：

- eventType: `requirement_status_changed`
- metadata 只允许：`requirementId`、`oldStatus`、`newStatus`、`reason`

客户提交、撤回、文件上传、文件删除也应分别写入安全 timeline event。

## 4. 事务所资料状态

事务所资料是由后台制作或上传、给客户确认的资料。

| 后台状态 | 客户显示 | 说明 |
| --- | --- | --- |
| 制作中 | 不显示 | 事务所仍在制作，客户不应看到 |
| 已完成 | 显示 | 客户可下载/预览并确认或要求修改 |
| 已确认 | 显示 | 客户已确认该资料 |
| 需修改 | 显示 | 客户要求事务所修改 |

事务所资料的补充说明只显示后台人工填写的客户说明，不显示模板原始扩展说明。内部备注只在后台显示。

客户确认事务所资料后，后台状态应变为“已确认”。客户要求修改时，应显示客户填写的说明；状态变更到其他状态后，不再展示旧的客户要求说明。

### Timeline

事务所资料确认或要求修改写入：

- eventType: `office_requirement_confirmed`
- eventType: `office_requirement_revision_requested`

metadata 不得包含 signed URL、storage path/bucket、token、证件号或内部备注全文。

## 5. 截止日期

截止日期只服务客户提交资料提醒。

- 后台可为未提交客户资料设置或修改截止日期。
- 追加客户资料时可设置截止日期。
- 客户画面只在未提交资料上显示截止日期。
- 距截止日期不足 7 天的未提交资料使用轻微红色警示背景。
- 事务所资料不显示客户提交截止日期。

## 6. 文件状态和删除

一个资料项可有多个文件。文件状态不得代替资料状态。

文件删除规则：

- 单个删除：删除或隐藏对应 `DocumentFile` 记录，并尝试删除 Storage object。
- 全部删除：对该资料项下所有文件执行同样处理。
- 删除资料项：同时处理该资料项下文件，避免孤儿对象。
- 客户撤回提交：恢复资料提交状态，并移除本次提交文件的客户可见记录。

文件删除失败时，不得向客户暴露 storagePath、storageBucket 或 signed URL。

## 7. 客户/后台可见字段边界

客户 Portal 禁止看到：

- 内部备注
- storagePath / storageBucket
- tokenHash / plaintext token
- 护照号 / 在留卡号
- raw metadata
- actorId / actorType
- originalFileName
- signed URL，除专门 signed URL API 的一次性响应外

后台可查看内部备注、文件名、状态、客户说明和安全的履历摘要，但仍不得显示 tokenHash、signed URL、Storage raw path/bucket 或密钥。

## 8. 客户链接

Portal token 明文只在创建或重新生成成功时显示一次。错过后不能从数据库恢复，只能重新生成。

未来如果增加“复制最新链接”，也只能复制当前弹窗中仍存在的临时明文链接；不能复制历史 token。

## 9. 禁止事项

- 不允许客户登录。
- 不允许客户访问后台 API。
- 不允许 Portal 传入或信任 `caseId`。
- 不允许 timeline metadata 存储敏感内容。
- 不允许把 signed URL、token、Storage path/bucket 写入日志或通知 metadata。
