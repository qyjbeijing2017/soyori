# 流程结构与全部节点

所有流程使用同一份 Core 语义。JSON 和 YAML 只是文件表达方式，节点的名称、属性和行为一致。下面列出当前全部节点；没有表达式节点、任意连线或隐藏执行步骤。

## 顶层结构

必填 `schemaVersion: 1`、非空 `name`、`fields`、`steps`。可选 `description` 和 `imports`。顶层没有流程 `id`；文件来源与调用实例由宿主管理。

`fields` 接受名称到声明的对象，或按顺序排列的声明数组。每个字段可含 `initial`、`input`、`output`、`description`；数组声明还需要 `name`。未给初值是 `undefined`，显式 `null` 是空值。初值只能是 JSON 数据，运行时则允许宿主传入其他 JS 值。

```yaml
schemaVersion: 1
name: 加一
fields:
  - name: count
    initial: 0
    input: true
    output: true
steps:
  - type: add
    left: $count
    right: 1
    output: $count
```

输入 `count: 2` 得到 `{count: 3}`。只接受标记 `input: true` 的运行输入，只有 `output: true` 的字段进入最终输出。步骤引用中未声明的根字段会自动收集，但不自动成为输入或输出。

## 数据与文本节点

| type | 属性 | 行为 |
| --- | --- | --- |
| `set` | `field, value` | 把解析后的值写入目标 |
| `append` | `field, value` | 追加一项；目标非数组则替换为新数组 |
| `template` | `template, output` | 在正文使用 `$path$` 插值、`$$` 转义 |

`field` 和 `output` 必须是 `$` 写入路径。`append` 的数组 value 作为一项加入，不展开。普通字符串输入不执行模板插值。详细数据规则见 [变量与路径](operands.md)。

## 数学 比较 逻辑节点

| type | 输入 | 写入 |
| --- | --- | --- |
| `add`、`subtract`、`multiply`、`divide` | `left, right` | `output` |
| `equal`、`notEqual` | `left, right` | `output` |
| `greaterThan`、`lessThan`、`greaterThanOrEqual`、`lessThanOrEqual` | `left, right` | `output` |
| `and`、`or` | `inputs` 数组 | `output` |
| `not` | `input` | `output` |

数学和大小比较接受可转换的基本值，未设置值按 0 使用；非法数字报 `INVALID_NUMBER`，除零报 `DIVISION_BY_ZERO`。转换不写回源字段。逻辑和条件使用 JS 真假规则，空数组、空对象为真，空字符串、0、null、undefined 为假。

相等比较中普通 JSON 对象与数组按内容比较；其他对象按引用。不同类型的可转换基本值按数字比较；undefined 只等于 undefined，null 只等于 null。

## 条件与循环

`if` 必填 `condition` 和 `then` 步骤数组，可选 `else`。`while` 必填 `condition` 和 `body` 步骤数组，每轮重新读取条件；循环体应更新条件或相关变量。

```yaml
- type: lessThan
  left: $count
  right: 3
  output: $continue
- type: while
  condition: $continue
  body:
    - type: add
      left: $count
      right: 1
      output: $count
    - type: lessThan
      left: $count
      right: 3
      output: $continue
```

起始 count 为 0，最终为 3。循环次数受 Core 的 `maxIterations` 限制；工具循环还受宿主执行预算限制。没有 break、return 或任意跳转节点。可导入「循环计数」示例验证。

## 调用节点

`call` 必填 `target`，可选 `inputs` 和 `output` 或 `outputs`。工具与子流程用同一种节点。`target` 是普通字符串，不是 `$` 引用。

```yaml
- type: call
  target: text.trim
  inputs:
    text: $source
  outputs:
    result: $clean
```

`output` 保存完整返回值，`outputs` 选择直接返回属性；两者互斥。没有输出设置则仅执行调用。映射和作用域见 [子流程与调用](subflows.md)。

## 分组与说明

步骤分组写为 `{type: group, name, steps, collapsed?, description?}`。字段数组中的分组写为 `{type: group, name, fields, collapsed?, description?}`。可嵌套，字段名仍在整个流程中唯一。

分组不创建作用域，不额外占执行步骤；折叠状态只用于展示。每个节点都可写 `description`，用于编辑与调试，不改变执行行为。
