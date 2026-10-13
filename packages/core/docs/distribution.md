# 流程引用与分发

JSON 和 YAML 表达同一份 FlowDefinition，分发时不必转换。流程只有展示名称，不填写 id 或 UUID。引用键只属于当前文件，其他文件可以使用相同键和名称。

```yaml
schemaVersion: 1
name: 调用加一
imports:
  increment: ./add-one.yaml
fields:
  count: { initial: 0, input: true, output: true }
steps:
  - type: call
    target: increment
    inputs: { count: $count }
    outputs: { count: $count }
```

将父文件及其相对引用文件保持目录结构一起分发。CLI 可直接运行父文件，不必逐个传入依赖：

```powershell
pnpm cli run examples/parent.yaml --set count=2 --json
```

## 来源解析

- 命令入口可以是本地路径、file URL 或 HTTP(S) URL；本地入口相对命令工作目录。
- 本地文件的相对引用，相对于该文件所在目录。可以引用其他本地文件或绝对 HTTP(S) URL。
- 远程文件的相对引用，相对于重定向后的最终 URL；`../child.yaml`、`/shared/child.json` 遵循 URL 规则。
- 远程文件及远程重定向不能读取本地路径、Windows 盘符路径、UNC 或 file URL。仅支持 file、http、https，URL 内不接受用户名密码。
- 根据最终来源的路径后缀识别 YAML/YML，其他来源按 JSON 处理。URL 查询参数不参与后缀判断。
- `--flows 别名=来源` 只添加根流程的引用；来源也相对于根流程位置。同名重复或覆盖文件内 imports 会报错。普通使用优先将依赖写在文件内。

## 加载与运行边界

CLI 的 run、validate 在执行前加载全部声明的依赖，包括没有被执行分支使用的依赖。加载失败时不执行节点，也不导入宿主函数模块。inspect 只读取指定文档，展示 imports 与调用需求，不递归下载依赖。

本地来源通过 realpath 和 file URL 规范化；网络来源使用 URL，忽略 fragment，保留 query，并记录最终重定向来源。一次加载内按来源缓存对象，多个别名指向同一来源时共享 LoadedFlow。先注册对象再连接依赖，因此引用循环可以加载；真正执行递归时仍受 maxCallDepth 限制。

每份文档最多 2 MiB，整个图最多 256 份文档。单次 HTTP 下载（含最多 5 次重定向和响应正文）限制为 10 秒，CLI 的 --timeout 还限制整个加载与执行进程，默认 30 秒。缓存只存在于本次加载中，没有磁盘离线缓存或后台刷新。URL 内容变化会影响下次加载；需要固定版本时应使用不可变发布地址或将依赖一并本地分发。

Core 只接收已经链接的 LoadedFlow：definition、imports Map 和可选 source。创建 runtime 时复制并校验整个内存图，不读文件或发网络请求。各层通过自己的 imports 和宿主函数注册表查找字符串 target；别名与函数名冲突时在创建 runtime 前报错，包括未使用的别名。--functions 仍只加载用户指定的本地模块。

运行状态、step 事件、trace 和错误记录 flowName、可选 source、invocationId 及步骤路径。同名流程由来源区分，同一流程的多次调用由 invocationId 区分。这些调用标识不写入流程文件，也不是持久的 UUID。

## 旧文件迁移

当前仍是开发期 schemaVersion: 1，旧字段不做静默兼容：删除流程顶层 id；将调用 target 对象改为名称字符串（原 flow 的 key 或 function 的 id）；在父文件 imports 中添加别名到文件/URL 的映射。inspect.references 返回 {target, path}。使用 core 的宿主将 options.flows 替换为 LoadedFlow 对象图；消费调试协议时将 flowId 替换为 flowName 和 source。
