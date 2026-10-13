# 子流程与共享调用栈

流程文件使用 `FlowDefinition`，通过本文件的 `imports` 别名引用子流程；宿主将它链接为 `LoadedFlow` 对象图。每次调用产生独立的 runtime、字段和执行进度，父子只通过输入输出映射交换数据。

## 1. 节点与局部引用

```json
{
  "type": "call",
  "target": "add-one",
  "inputs": {
    "count": "$currentCount"
  },
  "outputs": {
    "count": "$currentCount"
  }
}
```

- `inputs`：子流程输入名 → 固定值或 `$` 引用。省略的输入使用子流程初值，没有初值则为 `undefined`。明确传入 `undefined` 会覆盖已有初值。
- `outputs`：子流程输出名 → 父流程 `$` 写入路径。可以选择部分输出，不能同时写入相同或祖先/后代重叠路径。
- `output`：可替代 `outputs`，把完整输出对象写入一个父流程 `$` 路径。两者不能同时出现。
- `inputs`、`outputs` 都可省略。没有输出设置时运行子流程但不回写数据。
- 参数支持直接传值及嵌套对象/数组中的 `$` 引用。右侧引用涉及的根字段会自动收集，左侧子参数名不会被收集为父字段。
- `target` 是调用名称字符串，在本流程的 imports 和宿主函数注册表中查找；同名冲突在运行前报错，无隐式优先级。工具调用见 [外部函数文档](functions.md)。

```ts
const child: LoadedFlow = { definition: addOneFlow, imports: new Map() };
const loaded: LoadedFlow = {
  definition: parentFlow,
  imports: new Map([["add-one", child]]),
  source: "memory:parent", // 可选，仅用于诊断
};
const root = createRuntime(loaded, inputs, {
  maxIterations: 1000,
  maxCallDepth: 32,
});
```

每个 LoadedFlow 的 imports 映射仅在该流程内有效。不同文件可以复用同一别名和 name，名称不参与查找；同一对象可以被多个父流程引用，循环引用也允许。无需生成 UUID。每次调用仍创建独立的运行实例，以 invocationId 区分。

createRuntime 接受 LoadedFlow，也接受没有子流程依赖的普通 FlowDefinition。创建时复制整个图并校验所有声明的引用、映射和未执行分支；后续修改原始定义或 imports Map 不影响当前运行。输入映射的子字段必须标记 input: true，只有 output: true 的字段进入返回对象；缺失输出属性写入 undefined。

Core 不读取文件、网络或解析路径。文件内 imports 是供宿主解析的别名到来源映射，内存中的 LoadedFlow.imports 才是实际目标对象。CLI 在运行前加载全部依赖，规范化来源用于去重，详见 [分发与加载](distribution.md)。

## 2. 从调用栈取得 runtime

```ts
await root.step(); // 假设第一步就是 call：创建子实例并入栈
const stack = root.getStack();
const child = stack.at(-1)!;

child.flowName;     // 展示名称，允许同名
child.source;       // 可选来源，用于定位文件或 URL
child.invocationId; // 本次调用实例 id
child.getState();
child.setFields({ count: 5 });
await child.step();
await child.run();
```

`getStack()` 返回同一个实时只读数组视图，顺序为根流程到栈顶。元素就是真实的子 runtime，不是独立句柄或副本。运行结束后根 runtime 仍保留在数组中；成功完成的子 runtime 出栈。不要直接修改数组或状态；外层需要历史时自行复制。

每个 runtime 的状态包含：

| 属性 | 含义 |
| --- | --- |
| `invocationId` | 本次调用的独立标识，同一流程重复调用不会复用 |
| `flowName` | 流程展示名称 |
| `source` | 可选宿主来源，如文件 URL 或 HTTP(S) URL |
| `depth` | 调用深度，根为 1 |
| `status` | `ready`、`running`、`waiting`、`completed`、`failed`、`invalidated` |
| `busy` | 当前共享调度器是否忙碌 |
| `fields` | 这个实例自己的实时字段 |
| `nextStepPath` | 本实例下一步；父流程等待时停留在调用节点 |
| `output` / `error` | 完成后的输出或失败信息 |

`waiting` 表示等待子流程返回；`ready` 或 `running` 的栈顶可以推进。调用实例 ID 用于当前内存运行定位，不是跨进程的持久标识。

## 3. 单步与运行范围

所有实例共用一个调度器和忙碌保护，不各自独立推进。

| 操作 | 行为 |
| --- | --- |
| 活跃调用链任意实例的 `step()` | 推进栈顶一步 |
| 根的 `run()` | 从当前位置执行到根结束 |
| 子的 `run()` | 先执行更深层调用，再完成该子流程；不执行父流程后续节点 |
| `getState()` / `setFields()` | 查看、修改接收方法调用的这个实例 |
| `reset()` | 仅根可用，重置整个运行 |

执行到 `call` 时创建子流程并入栈，算父流程的一步。下一步才执行子流程内部节点。子流程最后一步完成后，自动提交输出并出栈，不另占一步。空子流程在调用这一步直接完成。

如果子流程返回后父流程也没有剩余步骤，会自动完成父流程并继续返回；这些只是结构结束动作，不会执行父流程的下一条节点。子流程 `run()` 的停止边界同样适用。

`step()` 的 `state` 是实际执行实例的实时状态，`event` 包含其 `invocationId`、`flowName`、可选 `source`、`path`、`type`。调用事件另带 `childInvocationId`，控制事件仍包含条件和分支。即使子流程刚完成并出栈，本步事件仍指向该子流程。没有新执行时事件为 `null`，状态属于接收方法调用的实例。

## 4. 数据隔离与修改

入栈时一次性解析输入 Operand，构造独立的子输入容器；字面量对象新建，引用值保持身份。子流程字段先使用初值，再覆盖实际提供的输入。之后替换父字段不会替换子字段，但共享对象内部的修改双方可见。

子流程未结束时，所有输出赋值都不回写。正常完成后先准备全部结果并检查写入目标，再提交到父路径；对象和数组按引用保存。缺失输出属性写入 `undefined` 并覆盖旧值。子流程失败不提交本次调用输出赋值，之前成功的父步骤或已完成调用不回滚，对共享对象的修改也无法回滚。

单步之间可以修改等待中的父流程，也可以修改子流程。父字段若是待回写目标，会在子流程成功后被输出覆盖。这是正常的顺序赋值行为。

任何实例的 `step()` 或 `run()` 占用共享忙碌标志期间，所有层的执行、字段修改和重置均以 `RUNTIME_BUSY` 拒绝。状态和栈仍可查看。不同根 runtime 使用独立调度器，可以并发运行。

## 5. 失败、重置与实例生命周期

- 子流程失败时，等待它的全部祖先一起进入 `failed`，保留当前调用栈。
- 错误包含实际失败的实例、流程、步骤路径，以及从根到失败实例的 `callStack`。祖先的 `nextStepPath` 保持在相应调用节点。
- 已完成或失败实例的 `step()` 不再推进，`run()` 返回其终态；字段不能修改。
- 子实例调用 `reset()` 抛出 `ROOT_RESET_ONLY`。
- 根 `reset()` 恢复默认字段和起点，清空输出、错误及调用栈，并分配新的根运行标识；不重复应用之前输入。
- 重置后，旧子实例（包括之前已完成的实例）状态为 `invalidated`。`getState()` 仍可查看旧数据，其余方法以 `RUNTIME_INVALIDATED` 拒绝，不能控制新运行。
- 无效重置参数不会改变现有调用栈或使实例失效。

Core 只维护当前调用栈，不保留所有已完成子实例。调用方持有的旧实例本身保留数据；失效检查通过运行代次完成，不需要历史实例列表或快照。

## 6. 调用深度

`maxCallDepth` 默认 32，要求正安全整数，根算第 1 层。每次入栈前检查，包括空子流程；超限产生 `CALL_DEPTH_LIMIT`，按正常执行失败传播。

分支和循环的控制帧不计入调用深度。循环次数保护继续独立生效。

不单独检测或禁止调用关系成环，也不引入专门的递归功能。直接或间接循环调用都经过普通入栈机制，由深度上限保护；定义校验不会沿调用关系无限递归。
