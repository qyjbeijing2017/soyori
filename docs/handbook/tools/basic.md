# 数学、文本与列表

本章逐个说明当前工具。CLI 与 Editor 共享本章接口，实际平台差异见[工具调用约定](contract.md)。

## 使用前先了解

- **数字输入**：填写真正的数字，例如 3；文字 "3" 不会自动转换。min / max 的数字列表不能为空。
- **文字与列表**：文字最多 100000 个 UTF-16 文本单位，列表最多 100000 项。UTF-16 是计算文字长度的方式，一个常见汉字通常占一单位，部分表情占两单位。
- **报错时**：BASIC_INPUT 表示输入不符合要求，BASIC_LIMIT 表示结果超过大小限制。各工具的具体要求见对应参数表。

以下 YAML 是单个工具的**步骤片段**，不能直接作为流程文件运行。把它放进完整流程的 `steps` 下，并准备 answer 输出字段。完整写法和结果保存方式见[如何阅读工具说明](reference.md#如何阅读工具说明)。

## math.abs

把负数转换为对应的非负数，常用于距离或误差。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| value | number | 必填 | 要计算的数字，例如 -3 或 2.8 |

返回：{result: 3}。

命名输出属性：`result`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: math.abs
  inputs:
    value: -3
  output: $answer
```

## math.floor

向负无穷方向取整，适合计算完整份数。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| value | number | 必填 | 要计算的数字，例如 -3 或 2.8 |

返回：{result: 2}。

命名输出属性：`result`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: math.floor
  inputs:
    value: 2.8
  output: $answer
```

## math.ceil

向正无穷方向取整，适合计算需要多少页或批次。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| value | number | 必填 | 要计算的数字，例如 -3 或 2.8 |

返回：{result: 3}。

命名输出属性：`result`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: math.ceil
  inputs:
    value: 2.1
  output: $answer
```

## math.round

取最近整数，中点向正无穷取整；-1.5 得到 -1。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| value | number | 必填 | 要计算的数字，例如 -3 或 2.8 |

返回：{result: 3}。

命名输出属性：`result`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: math.round
  inputs:
    value: 2.5
  output: $answer
```

## math.min

从非空数字列表中取最小值。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| values | number[] | 必填 | 非空有限数字列表 |

返回：{result: 1}。

命名输出属性：`result`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: math.min
  inputs:
    values:
      - 3
      - 1
      - 2
  output: $answer
```

## math.max

从非空数字列表中取最大值。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| values | number[] | 必填 | 非空有限数字列表 |

返回：{result: 3}。

命名输出属性：`result`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: math.max
  inputs:
    values:
      - 3
      - 1
      - 2
  output: $answer
```

## math.clamp

将数字限制在最小值和最大值之间，包含两个边界。例如限制到 0–10 时，12 会变成 10，-2 会变成 0，5 保持不变。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| value | number | 必填 | 要计算的数字，例如 -3 或 2.8 |
| min | number | 必填 | 区间下界 |
| max | number | 必填 | 区间上界 |

返回：{result: 10}。

命名输出属性：`result`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: math.clamp
  inputs:
    value: 12
    min: 0
    max: 10
  output: $answer
```

## math.random

生成大于或等于 min、且小于 max 的随机小数。默认得到 0 到 1 之间的小数，包含 0，不包含 1。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| min | number | 可选；默认 0 | 区间下界 |
| max | number | 可选；默认 1 | 区间上界 |

返回：result 满足 0 ≤ result < 1，不固定。

命名输出属性：`result`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: math.random
  inputs:
    min: 0
    max: 1
  output: $answer
```

## text.trim

删除文字两端空白，保留内部空白。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| text | string | 必填 | 要处理的文字 |

返回：{result: "你好"}。

命名输出属性：`result`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: text.trim
  inputs:
    text: "  你好  "
  output: $answer
```

## text.split

按字面分隔符将文字拆成列表，不执行正则表达式。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| text | string | 必填 | 要处理的文字 |
| separator | string | 必填 | 字面分隔符；空字符串按 UTF-16 单元拆分 |

返回：{result: ["a", "b"]}。

命名输出属性：`result`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: text.split
  inputs:
    text: a,b
    separator: ","
  output: $answer
```

## text.replace

替换全部字面匹配，不只替换第一处。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| text | string | 必填 | 要处理的文字 |
| search | string | 必填 | 要查找的非空文字，不是正则表达式 |
| replacement | string | 必填 | 替换后的文字，可以为空 |

返回：{result: "x-b-x"}。

命名输出属性：`result`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: text.replace
  inputs:
    text: a-b-a
    search: a
    replacement: x
  output: $answer
```

## array.concat

依次合并多个列表，只展开一层。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| arrays | JSON | 必填 | 待合并的多个列表组成的列表 |

返回：{result: [1, 2, 3]}。

命名输出属性：`result`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: array.concat
  inputs:
    arrays:
      - - 1
        - 2
      - - 3
  output: $answer
```

## array.slice

截取列表片段，end 不包含在结果中，负下标从末尾计算。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| array | JSON | 必填 | 待处理的列表 |
| start | integer | 可选；默认 0 | 起始下标，包含；负数从末尾计 |
| end | integer | 可选 | 结束下标，不包含；省略取到末尾 |

返回：{result: [2, 3]}。

命名输出属性：`result`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: array.slice
  inputs:
    array:
      - 1
      - 2
      - 3
    start: 1
    end: 3
  output: $answer
```

## array.length

计算列表元素数量，常用于循环条件。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| array | JSON | 必填 | 待处理的列表 |

返回：{result: 3}。

命名输出属性：`result`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: array.length
  inputs:
    array:
      - 1
      - 2
      - 3
  output: $answer
```
