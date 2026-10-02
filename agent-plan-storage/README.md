# agent-plan-storage

CLI 和 Editor 共用的 JSON 存储工具契约。无运行时第三方依赖。

- `agent-plan-storage`：`Storage` 接口、key/JSON 校验、`createStorageTools(storage)`。
- `agent-plan-storage/node`：`createFileStorage(directory)`；宿主明确注入存储根目录。
- `agent-plan-storage/browser`：`createBrowserStorage(database?)`；默认数据库 `agent-plan-storage`，使用 IndexedDB 事务。

公开工具为 `storage.read/write/delete/list`。数据与配置位置、key 规则和使用示例见 [存储与计数](../docs/storage-and-tokens.md)。本包不负责记忆编排、模型调用、自动同步或运行恢复。

在总工作区运行 `pnpm --filter agent-plan-storage test` 验证文件适配与公共输入边界。浏览器适配已通过真实 Chromium 测试：读写、列表、删除及刷新后持久化；尚未实测手机。
