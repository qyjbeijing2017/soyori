# 变量与数据路径

步骤输入使用 JSON 常量、`$` 引用和 `$$` 转义。理解数据与代码的边界，能避免把表达式、模板和字段名混用。

## 读取与常量

| 输入 | 解释 |
| --- | --- |
| `10`、`true`、`null`、`"hello"` | 常量 |
| `"$count"` | 变量 count |
| `"$user.name"` | 对象属性 |
| `"$items[0].name"` | 数组元素的属性 |
| `'$data["a.b"]'` | 名称含点的属性 |
| `"$$name"` | 字符串 `$name` |
| 对象或数组 | 递归解析值中的引用，键不解析 |

运行输入、字段初值、宿主 `setFields()` 和工具返回值是原始数据，不解释里面的 `$`。从引用读取的对象不再次递归解释引用。字面量容器每次执行新建，引用对象保留身份。

`$count + 1`、`$items[$index]` 和方法调用不是合法路径。用节点计算，或在 `script.run` 中编写 JavaScript。

## 写入

`field`、`output` 和 `outputs` 的目标必须带 `$`。声明名、输入参数名和返回属性名不带 `$`。

写 `$request.options.temperature` 时，中间缺失或类型不兼容的结构自动创建或替换。兼容对象保留其他属性。写完整 `$request` 则替换整个值。读取缺失路径返回 undefined，不修改数据。

写 `$items[3]` 会扩展数组并用 null 补齐；`append` 追加一项。数字下标范围 0–9999，append 扩展后的长度最多 10000；同一步路径扩展新增槽位总量最多 10000。不通过 `.length` 改数组大小。

路径禁止 `__proto__`、`constructor`、`prototype`，不沿原型链读取，不执行 getter。兼容的冻结或只读对象仍可能写入失败，宽松创建不是取消资源或路径校验。

## 文本模板

```yaml
- type: template
  template: |-
    用户：$user.name$
    第一项：$items[0]$
    价格：$$99
  output: $message
```

模板正文使用成对的 `$path$`，这里变量名不再写额外的前导 `$`。`$$99` 输出 `$99`。未设置值转空字符串；数字、布尔值、null 转文字；普通对象与数组转 YAML。循环对象、二进制和特殊对象不能直接作为文本，报 `INVALID_TEXT`。

普通 Operand 中的 `你好 $name$` 保持原文，只有 `template` 正文执行插值。旧 concat 节点已移除。

## 调用输出与错误

`outputs: {answer: "$result.answer"}` 读取返回值的直接自有属性 answer。要读取深层结果，先用 `output` 保存完整对象，再用后续节点读取路径。

映射不能重复写入同一位置或重叠祖先路径，例如 `$result` 与 `$result.answer`。普通容器回写准备失败时不会留下部分映射；工具自己的文件写入、网络请求和共享对象修改不回滚。

静态非法路径在校验时定位到步骤；执行中的路径、数组和写入错误使用 `INVALID_PATH`、`ARRAY_LIMIT`、`INVALID_VALUE` 等错误。见 [调试](../debugging/guide.md)。
