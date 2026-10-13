# 流程分析与 JSON 边界

CLI、编辑器等消费者只能导入 `soyori-core` 的公开入口，不依赖内部文件。

- `parseFlow(value: unknown): FlowDefinition`：校验并复制单个流程定义，补齐隐式字段。不会解析其他流程或函数注册，也不执行节点。
- `inspectFlow(value: unknown)`：使用相同结构校验，返回 `schemaVersion`、`name`、`imports`、可选 `description`、`fields`、`steps` 和 `references`。`fields` 保留字段说明，`steps` 按结构顺序列出步骤的 `type`、`path` 和可选 `description`，包括嵌套步骤。引用包含 `kind`、`path`，流程引用为 `key`、函数引用为 `id`，包括分支及循环内部调用；不会加载任何宿主模块。
- `LoadedFlow` 包含 definition、imports: ReadonlyMap<string, LoadedFlow> 和可选 source。完整引用、映射、输入及函数注册校验使用 `createRuntime(loadedFlow, inputs?, options?)`，不再提供 options.flows 全局注册表；构造 runtime 不执行节点。
- `toJsonValue(value: unknown): JsonValue`：返回独立 JSON 数据副本，使用与流程定义一致的 JSON 值语义。调用方可对副本进行 JSON.stringify，避免在检查后重新读取原始对象。

JSON 数据只包括 null、字符串、布尔值、有限数值、稠密数组及普通对象（包括 null 原型对象）。只接受自身可枚举数据属性；拒绝访问器、symbol 键、额外数组属性、不可枚举属性、循环、undefined、bigint 和类实例等。不会调用 getter 或 toJSON。违反条件抛出 `RuntimeError`，code 为 `INVALID_VALUE`。

这是序列化边界约束，不限制运行时字段值；宿主函数、字段赋值和子流程传值仍可使用任意 JavaScript 值及引用。文本模板和对象内容比较复用同一 JSON 数据判定，非 JSON 对象仍按已有引用/显式转换规则处理。

这不是不可信 JavaScript 对象沙箱。Proxy 的反射操作可能执行用户代码；CLI 在可终止的独立进程中运行这些操作。
