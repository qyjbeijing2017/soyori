# 存储与对话记忆

记忆是流程中的消息数组或其他变量。storage 提供通用 JSON 持久化，memory 工具决定怎样组装和保存；两者都不恢复运行现场。

## 存储 key 与数据

key 用 `/` 分组，没有 namespace。每段允许小写英文、数字、`-`、`_`、`.`，以字母、数字、- 或 _ 开头，不以点结束。禁止绝对路径、空段、反斜杠和 Windows 保留名。总长最多 240，每段最多 80。

prefix 是字面前缀，列目录用 `demo/`，否则 `demo` 也会匹配 demo-other。存储只接受 JSON：拒绝 undefined、非有限数、循环、函数、getter、特殊对象和稀疏数组。损坏或权限错误不会作为 found=false 隐藏。

```yaml
- type: call
  target: storage.write
  inputs:
    key: demo/settings
    value:
      language: zh
- type: call
  target: storage.read
  inputs:
    key: demo/settings
  outputs:
    found: $found
    value: $settings
```

预期 found=true，settings 为 `{language: "zh"}`。写入完整替换，同 key 并发采用最后成功结果，无自动合并。

## 平台位置

网页使用同源 IndexedDB，CLI 使用配置目录下的 JSON 文件。两端不共享数据，也不按项目自动隔离。网页清除站点数据可能删除存储；Library 工程包不包含通用存储和运行现场。

CLI 优先级：--storage-dir → AGENT_PLAN_STORAGE_DIR → 配置 storageDir → 系统默认位置。Windows 默认存储 `%LOCALAPPDATA%/agent-plan/storage`，配置 `%APPDATA%/agent-plan/config.json`；macOS 位于 Application Support/agent-plan；Linux 使用 XDG_CONFIG_HOME/XDG_DATA_HOME，否则 ~/.config 和 ~/.local/share。

更换目录不迁移旧数据，config set 保存绝对路径。CLI 拒绝存储目录内部符号链接；这不是对抗其他本机进程的沙箱。命令见 [CLI](../cli/guide.md)。

## 原始对话与流程记忆

Chat 原始记录保存为 `threads/<threadId>`，包含 id、flowId、title、messages。消息 content 是文字，结构化回复是 YAML 展示文本并带 format=yaml。

每轮保存 user 后向流程传 chatIn/threadId，成功再追加 assistant；不自动提供 memoryKey，不自动把历史加入模型。界面的线程索引另存于 agent-plan-conversations。旧对话记录不迁移。

memory.init/save 默认使用 `memory/<threadId>`，与原始记录不同。prefix 可自定义，threadId 必须是合法单段 key。init 读取历史、可替换 system 和追加 prompt，不写存储；save 验证消息完整性后保存。

setSystem 删除旧 system 并在首位放一条；addUser/addAssistant/addTools 返回新消息数组。addTools 要求每个待完成请求恰好有一个 ID 和 target 匹配的结果，缺失、重复和孤立结果报错。未完成工具请求时不能插入新的用户或模型消息。

流程可读取 threads 记录，但不应把它当作记忆合并接口；直接写入可能被界面随后保存覆盖。删除对话不会自动清理流程自己的 memory key。模型失败不会自动把本轮失败上下文保存成正常记忆。

## token 计数

tokens.count 接受文字或消息数组。mode=local（默认）使用当前模型 tokenizer，返回 method=tokenizer 与模型 ID；只需 tokenizer，不加载权重。消息数组使用聊天模板和生成前缀，裸文字不添加特殊 token。

mode=estimate 不联网，按 UTF-8 字节与消息开销估算，返回 method=estimate、model=null。估算不等于任何远程模型实际计数。浏览器 local 模式需允许下载 tokenizer。
