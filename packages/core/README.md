# soyori-core

Agent 编排工具的核心运行引擎，用于实现和调试 Agent 的执行循环、节点与运行过程。

## 项目范围

- 流程结构：保留流程标识与名称，在字段中声明初值和独立的输入、输出标记，以嵌套步骤列表保存执行顺序，可保存为 JSON。
- 基础执行：独立的赋值、数学、比较、逻辑、文本模板节点，以及 If 和 While；步骤不设标识，运行结束自动返回输出字段，循环上限由运行器管理。
- 运行隔离：每次运行独立初始化字段，提供基本校验与错误反馈。

节点输入支持直接写 JSON 固定值；`$count` 引用变量，`$request.options.temperature` 和 `$messages[0].content` 访问属性，`$$name` 表示固定文本 `$name`。对象和数组输入递归解析引用，所有写入目标使用 `$` 路径。写入自动创建或替换不兼容的中间结构，`append` 追加一项。`fields` 只需配置初值或输入输出标记；隐式字段初始化为 `undefined`。初值、宿主输入和返回值保持原样，不解析引用。详见 [变量、对象与数组方案](docs/operands.md)。

第一版结构见 [需求文档](docs/v1-requirements.md)，运行接口见 [Runtime 文档](docs/runtime.md)，调用栈见 [子流程文档](docs/subflows.md)，HTTP 与参数规则见 [外部函数文档](docs/functions.md)。Core 不内置模型或网络 SDK，不提供历史快照及高级运行控制。

编辑器由同仓库的 packages/editor 实现，本包专注于核心执行能力。

## 当前状态

已实现流程类型、运行时校验、基础运行器、子流程和同步/异步宿主函数调用，支持跨流程单步执行、按实例运行到底、实时调用栈、字段修改和根运行重置。运行时使用 `yaml` 库，将文本模板中的对象/数组转换为可读 YAML；流程文件的读取和解析仍由宿主负责。

## 本地开发

开发环境使用 Node.js 24，在仓库根目录安装依赖，使用唯一根锁文件。pnpm 版本固定在根 package.json。以下包内命令也可从根目录使用 pnpm --filter soyori-core 执行。

```sh
pnpm install
pnpm typecheck
pnpm build
pnpm test
```

`pnpm dev` 持续监听源码变化并编译；它不启动服务。

## 目录与产物

```text
src/index.ts        对外导出入口
src/flow.ts         流程 JSON 结构的 TypeScript 类型
src/runtime.ts      运行器与公开状态类型
src/runtime-types.ts 公开 runtime、状态与事件类型
docs/runtime.md     Runtime 接口与执行规则
docs/subflows.md    子流程结构、调用栈与实例生命周期
docs/functions.md   外部函数、HTTP 示例与任意值传递
tests/              运行行为与公开类型测试
dist/               编译生成的 JS、类型声明及映射文件
tsconfig.json       TypeScript 编译配置
pnpm-lock.yaml      依赖锁文件
```

所有公开 API 从 `src/index.ts` 导出。源码中的相对模块引用使用 `.js` 扩展名，以匹配编译后的 ESM 文件。

构建启用严格类型检查、源码映射和类型声明映射。包中包含 `src`，便于调用方从声明跳转到源码；JS source map 同时内嵌源码。`dist` 不提交到 Git。

当前核心只启用 ECMAScript 标准类型，不隐式引入 Node.js、浏览器或 Bun 的全局类型。实际运行环境的支持范围将在实现和测试后确定。

## 作为库使用

执行 `pnpm pack` 会先重新构建，再生成可供其他项目安装的 `.tgz` 包。调用方可用 `pnpm add <压缩包路径>` 安装，通过包名 `soyori-core` 引用。

创建运行器，执行一步后修改字段，再从当前位置运行到底：

```ts
import { createRuntime } from "soyori-core";
import type { FlowDefinition } from "soyori-core";

const flow = {
  schemaVersion: 1,
  name: "加一",
  fields: {
    count: { initial: 0, input: true, output: true },
    increment: { initial: 1 },
  },
  steps: [
    {
      type: "add",
      left: "$count",
      right: "$increment",
      output: "$count",
    },
    {
      type: "add",
      left: "$count",
      right: "$increment",
      output: "$count",
    },
  ],
} satisfies FlowDefinition;

const runtime = createRuntime(flow, { count: 2 });
const first = await runtime.step(); // count = 3
runtime.setFields({ count: 10 });
const final = await runtime.run(); // 从第二步继续，output 为 { count: 11 }
runtime.reset(); // 恢复初值 count = 0，回到开头
```

`getState()`、`step()`、`run()` 返回实时状态视图，不是快照；上例中 `first.state` 和 `final` 都会随重置发生变化。状态与字段容器以只读类型暴露，值为 `unknown`；共享对象内部内容可变。Core 不冻结或复制运行时对象，需要历史记录时由外层处理。

同一个 runtime 忙碌时拒绝再次执行、修改字段或重置，仍可读取状态。节点执行失败通过 `state.status === "failed"` 和 `state.error` 返回；非法 API 调用抛出 `RuntimeError`。失败或完成后需 `reset()` 才能重新运行。

子流程通过 `call` 节点引用本流程的局部别名，输入支持固定值与引用，输出写入变量路径：

```ts
const parent: FlowDefinition = {
  schemaVersion: 1,
  name: "调用计数流程",
  fields: { count: { initial: 2, output: true } },
  steps: [{
    type: "call",
    target: "increment",
    inputs: { count: "$count" },
    outputs: { count: "$count" },
  }],
};

const childFlow = { definition: flow, imports: new Map() };
const root = createRuntime({
  definition: parent,
  imports: new Map([["increment", childFlow]]),
}, {}, { maxCallDepth: 32 });
await root.step(); // 进入子流程，尚未执行子流程的第一个节点
const child = root.getStack().at(-1)!;
child.setFields({ count: 5 });
await child.step(); // 与 root.step() 一样，推进栈顶一步
await child.run();  // 只运行到 child 完成，自动回写 count = 7
root.getState();    // 此例父流程已无后续节点，因此也自动完成
root.reset();      // 旧 child 变为 invalidated，不能再推进或修改
```

父子共用忙碌保护；`getState()` 和 `setFields()` 始终针对接收调用的实例。只有根可以重置。`step()` 返回实际执行实例的状态与事件，子流程 `run()` 不执行父流程下一条节点。

外部函数使用 `target: "download"`，在创建时通过 `functions` 注册，例如：

```ts
const functions = {
  download: async ({ url }: Record<string, unknown>) => {
    const response = await fetch(String(url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.arrayBuffer();
  },
};
// createRuntime(downloadFlow, inputs, { functions });
```

函数整次调用算一步，等待期间保持共享忙碌保护；返回值无需是 JSON，`output` 可原样保存二进制等对象。`outputs` 仅映射自有属性，缺失时写入 `undefined`。函数超时、取消和外部效果由宿主负责，core 不自动重试。

包仅声明 ESM `import` 入口，未提供 CommonJS 构建。

开发包保留 `private: true`，不影响本地打包和引用。总工作区的 release:pack 从编译结果生成独立发布包，提供 MIT 许可证、scoped 名称和版本并去掉 private；开发包使用 soyori-*，不需解除开发工作区的 private。项目已更名 Soyori，发布候选 scope 为 @soyori，权限尚待确认；详见总仓库的 [npm 发布准备](../../docs/npm-release.md)。


## 文本模板与未设置值

使用 `template` 节点生成文字，正文不是普通 Operand。`$path$` 插入变量，`$$` 输出 `$`，保持换行与缩进，替换只进行一次。对象/数组转 YAML；独占一行的多行插入沿用该行缩进。规则和错误边界见 [Runtime](docs/runtime.md#5-默认节点及自动转换)。

```json
{ "type": "template", "template": "你好，$name$！\n价格：$$99", "output": "$result" }
```

未设置（undefined）在模板中转空字符串，在数学和大小比较中转 0；不写回源变量，也不改变相等比较、调用、存储或初值语义。除零及非法路径仍报错。开发阶段保留 schemaVersion 1，但已移除 concat 节点，旧流程需改用 template。

### Inline groups and tool descriptions

Fields and steps support named, documented inline groups with default collapse metadata. Groups preserve flat variables and sequential execution. `fieldDefinitions`, `fieldEntries`, `withFieldDefinitions`, `describeTools` and `toolParameters` are public helpers. See [groups and tool interfaces](docs/groups-and-tools.md).
