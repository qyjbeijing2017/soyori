# soyori-core 第一版需求与流程 JSON 结构

状态：已实现流程 TypeScript 类型、结构校验及基础 Runtime。接口与具体运算规则见 [Runtime 文档](runtime.md)；尚未提供独立的 JSON Schema 文件。

## 1. 目标与边界

提供一个 TypeScript 库形式的轻量流程执行内核：

> 校验流程定义 → 初始化字段 → 写入输入参数 → 顺序执行步骤 → 自动返回输出字段。

当前实现字段、基础运算、分支、循环、子流程及外部函数调用，不处理连线、Pin、画布、反向求值或聊天 UI。`call` 支持流程和宿主注册函数，HTTP、模型、工具等由宿主函数实现。Runtime 提供跨流程单步执行、调用栈和实时状态观察，历史快照与高级调试暂缓。

## 2. 流程顶层结构

```json
{
  "schemaVersion": 1,
  "name": "计数示例",
  "fields": {},
  "steps": []
}
```

| 属性 | 含义 |
| --- | --- |
| `schemaVersion` | JSON 格式版本，当前为 `1` |
| `name` | 展示名称，不参与引用查找，允许同名 |
| `imports` | 可选的局部别名 → 文件路径或 URL，由宿主解析 |
| `fields` | 需要初值或输入输出设置的字段配置，字段名同时作为对外参数名；没有配置时填写 `{}` |
| `steps` | 按数组顺序执行的步骤 |

流程不再设置 `id` 或 UUID；步骤也不设置独立 `id` 或 `key`，只用 `type` 决定行为，同一种步骤可以出现多次。错误通过 `steps[2].body[0]` 这样的结构路径定位。以后需要跟踪编辑前后的步骤，再考虑稳定标识。

分支和循环使用嵌套步骤列表，不维护连线图，不需要开始、结束、End 或 Return 节点。流程文件只保存定义与初值，不保存某次运行中的状态。

## 3. 字段与输入输出

流程、每个 field 和所有类型的步骤都支持可选 `description: string`，用于说明用途，可为空字符串或多行文本；省略时不自动填充。输入/输出复用对应字段的说明，同一字段兼具输入和输出时可以在一段说明中分别写明含义。说明不参与计算、不产生运行字段，也不改变输出。

嵌套 `if`、`while`、`call` 与普通计算步骤规则一致。`inspectFlow` 返回流程/字段说明和按结构顺序列出的步骤信息（`type`、`path`、可选 `description`）；执行事件 `StepEvent` 带上当前步骤的说明，供 trace 展示。YAML 的 `#` 注释仅存在于源文件中，需要工具读取的文档应使用 `description`。

```json
{
  "count": { "initial": 0, "input": true, "output": true },
  "target": { "initial": 3, "input": true },
  "continue": {}
}
```

- `initial` 是 JSON 初值，省略时运行字段为 `undefined`；显式配置 `null` 才是 `null`。
- `input` 默认 `false`，为 `true` 时接受同名输入参数。
- `output` 默认 `false`，为 `true` 时在正常结束后作为同名属性返回。
- 输入与输出独立，同一字段可以兼具两者；均省略就是内部字段，不使用互斥的 `role`。
- 不再设置顶层 `inputs`、`outputs`、别名映射或 `required`。
- 所有字段都可以读写，输入输出属性只决定对外暴露方式。

字段不必逐一声明。Runtime 初始化时递归扫描全部步骤（包括未执行的分支和循环体），收集所有读写及条件字段。没有出现在 `fields` 中的字段自动成为内部字段：初值 `undefined`，`input` 与 `output` 都为 `false`。因此 `fields` 只需列出需要初值或对外暴露的字段，显式写成 `{}` 的字段也合法。

仅 `$` 引用涉及的根字段参与收集，不检查字段拼写，也不要求读取前必须先赋值。固定值直接写在步骤输入中，普通字符串不会创建隐式字段。

每次运行先复制 JSON 初值，再用实际提供的输入覆盖对应字段。缺失参数保留初始化后的值；显式传入 `null` 或 `undefined` 都覆盖旧值。不能把 `0`、`false`、空字符串当作缺失。

正常结束时收集所有 `output: true` 的字段，返回命名对象，可以返回多个字段，也可以让字段保存完整对象。不另设单值返回模式。

### 数据规则

- 流程文件与 `initial` 只支持 JSON 值：字符串、有限数字、布尔值、`null`、JSON 数组与对象。不在文件中写入 `undefined`、函数、二进制或循环引用。
- 运行时输入、字段和调用返回值为 `unknown`，允许二进制、类实例、循环对象、`undefined` 等任意值，不保证状态可 JSON 序列化。
- 写入完整变量时替换旧值；写入属性时保留兼容容器的其他内容，自动创建或替换不兼容的中间结构。
- 字段不固定数据类型，具体运算的适用类型需明确；条件判断按第 6 节处理。
- 支持 `$result.user.name`、`$items[0]`、`$data["a.b"]` 等明确路径，不执行表达式。
- 各次运行的字段容器与 JSON 初值独立。运行时赋值、参数和输出按引用传递对象，外部共享对象内部的修改会相互可见；重置重新复制原始初值。

## 4. 值的读取方式

`left`、`right`、`value`、`input`、`condition` 和 `inputs` 中的值统一使用 Operand：普通 JSON 值为固定值，`$` 开头的字符串为变量路径，`$$` 开头的字符串去掉第一个 `$` 后作为文字。对象和数组递归解析值，键名不解析。写入目标必须为 `$` 路径。

例如“加一”可直接写 `left: "$count", right: 1, output: "$count"`，无需声明常量字段。`fields.initial`、运行输入、`setFields()` 和宿主返回值不会递归解释 `$`。引用读到的对象也不会再次解析。路径语法、覆盖、数组限制和错误边界见 [变量、对象与数组方案](operands.md)。

## 5. 基础运算步骤

每种运算都是独立节点，使用 `type` 表示具体运算，不再使用通用 `calculate`、`compare`、`logic` 节点配合 `op`。菜单可以分类展示，内核实现可以共享代码。

| 分类 | `type` | 输入属性 | 写入属性 |
| --- | --- | --- | --- |
| 赋值 | `set` | `value` | `field` |
| 数组追加 | `append` | `value`（作为一项） | `field` |
| 数学 | `add`、`subtract`、`multiply`、`divide` | `left`、`right` | `output` |
| 比较 | `equal`、`notEqual`、`greaterThan`、`lessThan`、`greaterThanOrEqual`、`lessThanOrEqual` | `left`、`right` | `output` |
| 逻辑 | `and`、`or` | `inputs` 数组 | `output` |
| 逻辑 | `not` | `input` | `output` |
| 文字 | `template` | `template` 原文 | `output` |
| 调用 | `call` | `inputs` 子参数到 Operand 映射 | `output` 或 `outputs` |

`call` 使用 `target: "局部别名"` 查找本流程的已加载引用。参数、生命周期及输出回写规则见 [子流程文档](subflows.md)。输入映射左侧是子流程参数名，右侧是固定值或引用；仅右侧引用涉及的根字段参与父流程隐式字段收集。

输入使用 Operand，写入使用 `$` 路径；`set` 将解析后的值写入目标。引用对象保留身份，字面量对象每次执行新建。`append` 在目标数组末尾追加一项，目标不是数组则先替换为数组。不执行任意 JavaScript 表达式。

数学和大小比较节点自动按数字转换输入；`add` 对 `"2"` 与 `3` 返回数字 `5`。需要生成文字时使用 `template`，例如 `$prefix$$number$` 返回 `"23"`。逻辑节点统一返回布尔值。完整转换规则见 [Runtime 文档](runtime.md#5-默认节点及自动转换)。

```json
{
  "type": "set",
  "field": "$message",
  "value": "$completedText"
}
```

上例需在 `fields` 中为 `completedText` 配置初值 `"完成"`。递增由加法完成，不设单独的 `increment` 节点；下面的 `increment` 是初值为 `1` 的普通字段。先读取再写入，允许结果与输入使用同一字段：

```json
{
  "type": "add",
  "left": "$count",
  "right": "$increment",
  "output": "$count"
}
```

多个比较结果通过逻辑节点组合，不需要嵌套条件表达式：

```json
{
  "type": "and",
  "inputs": [
    "$hasContent",
    "$withinLimit"
  ],
  "output": "$ready"
}
```

```json
{
  "type": "not",
  "input": "$ready",
  "output": "$notReady"
}
```

## 6. 条件与控制步骤

`condition` 支持固定值或 `$` 引用，不内嵌比较表达式，不强制结果为布尔类型，也不要求用户配置转换。

真假判断沿用 JavaScript 规则，包括 `undefined`、`null`、`false`、`0`、`0n`、`NaN`、空字符串为假，空数组和空对象为真。逻辑节点同样按真假理解输入。

### If

```json
{
  "type": "if",
  "condition": "$ready",
  "then": [],
  "else": []
}
```

只执行对应的一个分支。`else` 可以省略，分支完成后继续后续步骤。未选中的分支没有执行效果。

### While

```json
{
  "type": "while",
  "condition": "$continue",
  "body": []
}
```

- 每轮开始前读取条件字段，为真执行循环体，为假退出，首次为假时执行零次。
- 没有 `check` 阶段，循环不会自动重跑产生条件的比较步骤。
- 需要持续比较时，循环前计算首次条件，循环体中再次比较并更新条件字段。
- 未更新条件就继续读取旧值；条件始终为真会触发运行器保护。
- 循环上限由运行器提供默认保护，调用库的程序可以配置，流程 JSON 不包含 `maxIterations`。
- 达到上限且仍需继续循环时报错，不视为成功完成。默认每个循环每次进入最多 1,000 轮，计数跨单步保留；内层循环每次重新进入重新计数。

## 7. 执行与错误规则

- 顺序执行，不支持并行；分支和循环共享本次运行字段，不设局部作用域。
- 节点涉及的未声明字段自动初始化为 `undefined`；非法节点结构、无法进行的运算或执行失败仍报错。条件不受布尔类型限制。
- 运算成功后才提交自己的字段写入；之前成功执行的步骤不回滚，包括循环体内已完成的步骤。
- 错误包含步骤结构路径、相关字段与原因，不要求调试快照或日志平台。
- 所有步骤正常完成后自动返回输出字段，失败不能作为正常结果返回。

## 8. 完整示例

从输入的 `count` 开始递增，直到不再小于 `target`。循环完成后设置完成提示，首次就不满足条件则设置无需计数提示。

```json
{
  "schemaVersion": 1,
  "name": "计数示例",
  "fields": {
    "count": {
      "initial": 0,
      "input": true,
      "output": true
    },
    "target": {
      "initial": 3,
      "input": true
    },
    "increment": {
      "initial": 1
    },
    "completedText": {
      "initial": "已完成计数"
    },
    "skippedText": {
      "initial": "无需计数"
    },
    "message": {
      "output": true
    }
  },
  "steps": [
    {
      "type": "lessThan",
      "left": "$count",
      "right": "$target",
      "output": "$continue"
    },
    {
      "type": "if",
      "condition": "$continue",
      "then": [
        {
          "type": "while",
          "condition": "$continue",
          "body": [
            {
              "type": "add",
              "left": "$count",
              "right": "$increment",
              "output": "$count"
            },
            {
              "type": "lessThan",
              "left": "$count",
              "right": "$target",
              "output": "$continue"
            }
          ]
        },
        {
          "type": "set",
          "field": "$message",
          "value": "$completedText"
        }
      ],
      "else": [
        {
          "type": "set",
          "field": "$message",
          "value": "$skippedText"
        }
      ]
    }
  ]
}
```

传入：

```json
{ "count": 1, "target": 3 }
```

初始化后 `continue` 与 `message` 为 `undefined`。首次比较写入 `true`，进入分支，循环依次把 `count` 更新为 `2`、`3`，每轮重新比较。比较结果为 `false` 后退出，设置提示，自动返回：

```json
{ "count": 3, "message": "已完成计数" }
```

不传参数则从默认值 `0` 计数到 `3`，得到相同输出。传入 `{ "count": 3, "target": 3 }` 则不进入循环，返回 `{ "count": 3, "message": "无需计数" }`。

## 9. 后续扩展与暂缓范围

Action 和 CallFlow 统一为调用能力，当前支持其他流程与宿主函数。子流程通过各自的局部 `imports` 引用，`name` 用于展示，调用实例由 `invocationId` 区分；函数通过注册表 id 查找，不创建子实例。调用结果可整体写入或按自有属性映射，缺失属性写入 `undefined`；普通对象与数组的输出写入先检查再统一提交，失败不回写，外部效果与共享对象修改不回滚。详见 [外部函数文档](functions.md)。

当前不实现：

- 连线、Pin、画布、反向求值、独立开始结束节点、提前返回。
- 内置模型或 HTTP SDK、JSON 内嵌脚本执行；这些能力可通过宿主函数接入。
- 并行调度、分支汇合、调试快照、执行历史和事件流。
- 断点、暂停、取消、恢复、失败重试。
- 聊天记忆、跨运行持久化、存储适配、UI 与插件市场。

## 10. 验收范围

- JSON 往返序列化保留结构与行为。
- 初值缺省为 `undefined`，输入输出标记缺省为 `false`。
- 同一字段可输入并输出；缺失输入保留初值，显式 `null` 和 `undefined` 正确覆盖。
- 独立运算节点、If、While 及其嵌套按约定执行。
- 条件按真假判断，循环读取最新字段，不隐式重新计算比较。
- 正常结束返回命名对象，初值独立复制，运行时对象按约定共享引用。
- 错误定位到步骤路径，循环保护由运行器实施。
- 子流程隔离、跨流程单步、子实例运行范围、共享忙碌保护、调用深度限制及根重置失效规则符合 [子流程文档](subflows.md)。

## 11. 后续待设计范围

- 独立的 JSON Schema 文件。
- 运行取消、超时等统一控制策略；当前由宿主函数负责。

TypeScript 类型和 Runtime 已落实当前结构。非法输入、运算转换、相等比较、逻辑结果、循环保护及错误行为均已记录在 [Runtime 文档](runtime.md)。本次不支持从指定位置启动，也不提供 `resetFields()`；`reset()` 统一恢复字段与进度。

此前的通用运算节点加 `op`、嵌套条件表达式、循环 `check`、步骤级标识、独立输入输出映射、必填输入和互斥字段角色均已被当前方案替代。
