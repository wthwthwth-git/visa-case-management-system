# E2E QA 与测试数据清理

本文记录本地和 staging demo 前的端到端检查方式。

## 1. 基础验证命令

```bash
npm run test
npm run typecheck
npm run lint
npm run prisma:validate
```

## 2. Playwright Smoke

默认 smoke 会自动启动本地 dev server：

```bash
npm run test:e2e
```

默认覆盖：

- 无效 Portal token 安全错误页。
- 未登录访问后台会跳转登录页。
- 手机宽度下 Portal 不横向溢出。
- Portal 不渲染内部字段、Storage 字段、tokenHash、signed URL。

## 3. 登录态后台点击流程

如果要跑登录后的后台主流程，需要先准备 Playwright storage state，并通过环境变量指定：

```bash
E2E_ADMIN_STORAGE_STATE=path/to/admin-storage-state.json npm run test:e2e
```

Windows PowerShell 示例：

```powershell
$env:E2E_ADMIN_STORAGE_STATE="path/to/admin-storage-state.json"
npm run test:e2e
```

可选指定案件详情 smoke：

```powershell
$env:E2E_ADMIN_STORAGE_STATE="path/to/admin-storage-state.json"
$env:E2E_CASE_ID="case_id"
npm run test:e2e
```

登录态 smoke 检查：

- 案件列表可打开。
- 新建案件页面可进入。
- 案件详情不渲染 tokenHash、storagePath、storageBucket、signedUrl。

## 4. 手机端 Portal QA

如需检查真实有效 Portal 页面：

```powershell
$env:E2E_PORTAL_TOKEN="temporary_test_token"
npm run test:e2e
```

检查重点：

- 手机宽度下无横向滚动。
- 客户材料上传、撤回、提交可操作。
- 完成资料确认可下载文件、确认无误、要求修改。
- 制作中的事务所资料不显示。
- 客户看不到内部备注、Storage 字段、tokenHash、signed URL 和 raw metadata。

不要提交或截图真实 Portal token、signed URL、storage state 文件或 `.env.local`。

## 5. 测试数据清理

清理脚本默认只做预演：

```bash
npm run qa:cleanup-test-data -- --dry-run
```

执行清理必须显式确认：

```powershell
$env:CLEANUP_TEST_DATA="1"
npm run qa:cleanup-test-data -- --execute
```

清理范围只包含明确测试前缀或测试邮箱后缀的数据，例如：

- caseNumber 以 `E2E-`、`QA-`、`TEST-`、`AUTO-QA-` 开头。
- customer name 以 `E2E `、`QA `、`TEST `、`AUTO-QA ` 开头。
- email 以 `@example.invalid`、`@e2e.invalid`、`@qa.invalid`、`@test.invalid` 结尾。

清理脚本不得删除：

- 正式模板数据。
- 真实客户数据。
- 不能明确识别为 QA/E2E/test 的案件。

如果 dry-run 输出中出现无法确认的案件编号或客户信息，不要执行 `--execute`。
