# 外部函数与运行时参数

`call` 节点支持已注册的同步或异步函数。Core 负责传参、等待和输出映射，HTTP、模型 SDK、数据库与其他能力由宿主程序实现。

## 1. 调用结构

```json
{
  "type": "call",
  "target": "download",
  "inputs": {
    "url": "$downloadUrl"
  },
  "output": "$fileData"
}
```

`inputs` 左侧是函数参数名，右侧是固定值或 `$` 引用；对象、数组输入递归解析引用。参数容器和字面量容器每次新建，引用获得的值保持身份。未映射的参数不出现在参数对象中；映射了但值为 `undefined` 的参数会作为自有属性传入。

`output` 将整个返回值写入 `$` 路径；`outputs` 将返回值的自有属性映射到 `$` 路径，不能同时配置。返回值不再次解析 `$`。均省略表示忽略返回值。

```json
{
  "type": "call",
  "target": "getWeather",
  "inputs": {
    "city": "$city"
  },
  "outputs": {
    "temperature": "$temperature",
    "description": "$weather"
  }
}
```

## 2. 注册及 HTTP 示例

```ts
import { createRuntime } from "soyori-core";
import type { FlowDefinition } from "soyori-core";

const flow: FlowDefinition = {
  schemaVersion: 1,
  name: "下载文件",
  fields: {
    downloadUrl: { input: true },
    fileData: { output: true },
  },
  steps: [{
    type: "call",
    target: "download",
    inputs: { url: "$downloadUrl" },
    output: "$fileData",
  }],
};

const runtime = createRuntime(flow, {
  downloadUrl: "https://example.com/file.bin",
}, {
  functions: {
    download: async ({ url }) => {
      const response = await fetch(String(url), {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    },
  },
});

const state = await runtime.run();
if (state.status === "completed") {
  const file = state.output?.fileData; // unknown，实际是 ArrayBuffer
  if (file instanceof ArrayBuffer) {
    console.log(file.byteLength);
  }
}
```

本例需要宿主提供 `fetch`、`AbortSignal.timeout` 和二进制类型。Core 不绑定网络 SDK，也不会自动检查 HTTP 状态。超时、认证、响应解析由注册函数负责。示例 URL 需替换为实际资源地址。

函数类型为 `(inputs: Record<string, unknown>) => unknown | Promise<unknown>`。创建时保存注册表的函数引用，所有子流程共享；未注册或注册值不是函数会在创建时报错。函数只收到参数，不隐式获得 runtime 或内部状态。流程别名 key 和函数注册名 id 使用各自的名称空间，允许同名。

## 3. JSON 定义与运行时数据

| 位置 | 规则 |
| --- | --- |
| 流程文件、`initial` | 仍要求 JSON 值；定义不能内嵌函数、二进制、`undefined` 或循环引用 |
| 初值省略、隐式字段 | 初始化为 `undefined` |
| 明确配置 `initial: null` | 初始化为 `null` |
| 运行输入、`setFields()`、函数结果、子流程传参 | `unknown`，允许二进制、Blob、对象、类实例、循环引用等任意值 |
| 状态和输出 | 实时视图，不保证能序列化为 JSON |

创建和重置时，没有提供输入参数就保留初值；明确提供 `undefined` 会覆盖初值。`reset()` 重新复制 JSON 初值，缺省字段恢复 `undefined`，不复用上次输入的对象或二进制。

对象按引用传递，包括赋值节点 `set`、调用输入和调用输出。字段容器独立，但字段中的对象可以共享：替换父字段不会替换子字段持有的引用，修改共享对象内部内容则双方可见。状态容器以只读类型暴露，字段值为 `unknown`，不承诺任意对象的深度只读。

## 4. 输出映射

- 整体 `output` 原样保存返回值，包含 `undefined`、二进制或非 JSON 对象。
- `outputs` 只读取自有属性，不读取原型链。缺少属性或返回 `null` / `undefined` 时，目标字段写入 `undefined` 并覆盖旧值，不报错。
- 属性存在但值为 `undefined` 同样写入；原始值的映射使用 JavaScript 装箱后的自有属性。
- 子流程使用同一规则：不存在或未标记为输出的字段不在返回对象中，映射时得到 `undefined`，不能借此读取私有字段。
- 所有返回属性读取完成后，先检查目标再统一提交普通对象/数组的路径写入。返回属性读取或目标检查失败时不提交。写入目标中的访问器拒绝执行；宿主 Proxy 陷阱的副作用不保证回滚。
- 禁止多个输出映射到相同或祖先/后代重叠路径；同一根对象的不同属性可以同时写入。

## 5. 执行与失败

外部函数整次调用算一步，不增加子 runtime 或调用深度。宿主函数内部的 JavaScript 不受流程单步控制。异步等待期间当前实例保持 `running`，共享调度器始终忙碌，下一步位置仍为该调用节点。

函数抛错或 Promise 拒绝时，当前实例及等待中的祖先失败，保留调用栈和实际调用步骤位置。未提交的输出不写入。对共享对象的修改、HTTP 请求等外部效果不能回滚。Core 不自动重试，也不提供取消或超时策略。

## 6. 基础节点如何处理任意值

- 数学与大小比较保留原有数字转换，接受数字、字符串、布尔值、`null`，`undefined` 按 0 使用。二进制、其他对象不能当数字，报 `INVALID_NUMBER`。
- 真假判断使用 JavaScript 规则；`undefined` 为假。
- 相等比较：普通 JSON 数组和对象按内容比较；其他对象、函数按引用。不同类型的可转换基础值继续按数字比较。`undefined` 仅等于 `undefined`，`null` 仅等于 `null`。
- 文本模板：字符串原样插入，数字、布尔值、null 转文字，对象与数组转 YAML；未赋值按空字符串使用；二进制、循环对象、类实例等报 `INVALID_TEXT`，需要显式赋值或转换。

存储某个值并不意味着每个基础节点都能处理它。持久化、快照、二进制编码和资源存储属于外层能力。
