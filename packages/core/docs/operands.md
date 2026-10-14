# 变量、对象与数组方案

状态：已实现。流程尚未投入实际应用，本次直接修改格式，`schemaVersion` 保持 `1`，不根据字段是否存在猜测旧字符串的含义。

## 输入与写入目标

所有步骤输入统一使用 Operand，包括 `set/append.value`、运算输入、`if/while.condition`、`call.inputs` 的值。

| 输入 | 含义 |
| --- | --- |
| `10`、`true`、`null`、`"hello"` | JSON 固定值 |
| `"$count"` | 读取整个变量 |
| `"$request.options.temperature"` | 读取对象属性 |
| `"$messages[0].content"` | 读取数组元素的属性 |
| `"$data[\"a.b\"]"` | 属性名本身包含点号 |
| `"$[\"a.b\"]"` | 根字段名本身包含点号 |
| `"$$name"` | 固定字符串 `$name` |
| 对象、数组 | 递归解析值中的引用，键名保持原样 |

写入位置 `field`、`output`、`outputs` 的目标值必须是 `$` 引用。`fields` 的键、工具参数名、`outputs` 左侧返回属性名、imports 别名和工具 id 都是普通名称，不加 `$`。

`fields.initial`、创建/重置输入、宿主 `setFields()` 和工具返回值是数据，不解释 `$`。引用读出的对象不再次解析；因此工具返回的提示词可以直接包含 `$`。字面量容器每次执行新建，引用值按身份传递，不隐式克隆。

```json
{
  "type": "call",
  "target": "search",
  "inputs": {
    "query": "$context.user.query",
    "limit": 10,
    "options": {
      "region": "$context.region",
      "language": "zh"
    }
  },
  "output": "$result.search"
}
```

不执行表达式、插值、动态下标或方法调用。`$count + 1`、`$items[$index]` 不合法；`hello $name` 是完整的固定文本。运算使用运算节点；文本插值仅在 `template` 节点的正文中使用 `$path$`，普通 Operand 不执行插值。保证执行过程可以逐步查看。

## 路径和读取

点号名称支持 Unicode 字母、下划线开头，后续可带数字；空格、点号、连字符、空名称等使用双引号方括号语法。括号字符串采用 JSON 转义；数组索引使用非负十进制整数，无前导零。数字下标 `[0]` 表示数组位置，字符串下标 `["0"]` 表示对象属性。

`$`、`$x..y`、`$x[0`、`$x[abc]`、负数或小数索引在流程校验时失败。路径中的 `__proto__`、`constructor`、`prototype` 一律拒绝，包括转义后的名称；不沿原型链读取。

缺失或无法继续的读取返回 `undefined`，不创建结构、不修改数据。`$items.length` 可以读取数组长度。自有 getter/setter 属性不作为路径数据访问，以免读取触发隐式执行。宿主提供的类实例等值可以整体传递；特殊对象不承诺通用属性操作能力。

初始化时递归收集所有引用的根字段，包括未执行分支；未声明根字段初始化为 `undefined`。固定字符串不参与收集。

## 自动创建与覆盖

设置整个变量直接替换旧值。写入路径时根据下一段选择容器：数字下标需要数组，属性名需要普通对象。已有兼容容器保留其他内容；缺失、`null`、数字、字符串、布尔值或不兼容容器自动替换。

```json
{
  "type": "set",
  "field": "$request.options.temperature",
  "value": 0.7
}
```

无论 `request` 原来不存在还是 `123`，都会得到 `{ "options": { "temperature": 0.7 } }`。如果原来还有 `name` 属性，则保留它。对象和数组容器类型冲突时也会替换，原值不会自动包装或合并。

相同规则适用于 `set`、数学/比较/逻辑结果，以及 `call.output/outputs`。修改共享对象会被所有引用它的字段观察到；整体替换某个字段不改变其他字段原来持有的对象。只读属性、冻结或不可扩展的兼容容器仍可能写入失败，不偷偷克隆绕过宿主约束。

## 数组

```json
{
  "type": "append",
  "field": "$messages",
  "value": {
    "role": "user",
    "content": "$userInput"
  }
}
```

`append` 算一步，先解析输入值，再追加到数组末尾；目标不是数组时直接替换为新数组。`value` 是数组时作为一项添加，不展开、不批量追加。

`set "$items[3]"` 自动扩展并用 `null` 补齐此前缺失的位置。支持嵌套数组及数组元素内部写入。写入数字下标范围为 `0..9999`，`append` 扩展后的数组长度最多为 10,000；同一步通过路径扩展新增的数组槽位总量最多为 10,000，避免嵌套路径或多个输出放大分配。不限制整个宿主输入或字面量数组的长度；这项限制针对路径操作，不是通用内存沙箱。当前路径解析器也限制读取的数字下标到上述范围。

不通过 `.length` 改数组大小；数组追加使用 `append`。数组改用普通属性路径会按容器规则替换为对象，不在数组上添加隐藏的命名属性。

## 调用回写与错误

`call.inputs` 先解析，再调用工具或进入子流程。`outputs` 左侧只选返回值的直接自有属性；读取深层返回数据可以先用 `output` 保存结果，后续通过路径读取。

重复及祖先/后代重叠目标在校验时拒绝，包括 `$result.x` 和 `$result["x"]`；`$result.a` 与 `$result.b` 可以同时写入。不同路径若在运行时引用同一个对象，按输出映射顺序写入。

普通对象/数组的写入先准备并检查，再提交。输出读取失败、只读目标或数组扩展超限，不会留下部分路径修改。子流程返回时回写失败，错误归属父流程的 `call`，保留调用栈。宿主函数外部效果、共享对象的自行修改、Proxy 陷阱等不保证回滚。

静态路径错误以 `INVALID_FLOW` 定位到步骤定义；执行时的写入失败使用 `INVALID_VALUE`、`INVALID_PATH` 或 `ARRAY_LIMIT`，沿用现有失败状态和调用栈协议。

## 迁移与 editor

- 旧 `"count"` 字段引用改为 `"$count"`；不提供双语义兼容模式。
- 常量字段仍然可用，也可直接改为步骤中的 JSON 值。
- 参数和字段声明名保持不变；CLI 的 `--set`、运行输入及 `setFields()` 仍使用完整原始字段名，不解释路径。
- editor 显示“设置值”“添加一项”，支持选择字段及属性；后续调试可显示覆盖前后值。当前 core 仍只提供实时状态，不新增历史快照。
- 现有类型、校验、运行器、JSON/YAML 示例、CLI 夹具及测试统一采用本方案。

### Grouped declarations

`fields` uses a name-to-configuration mapping. Ordinary entries contain `initial?`, `input?`, `output?`, `sensitive?` and `description?`. An entry with `type: "group"` contains nested `fields` using the same mapping syntax, an optional display `name`, `description?` and `collapsed?`. Legacy arrays remain readable, while Editor saves mappings. Groups do not change reference paths or scope; ordinary field names remain globally unique. See [groups and tool interfaces](groups-and-tools.md).
