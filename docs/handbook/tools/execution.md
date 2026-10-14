# 工具执行与脚本

本章逐个说明当前工具。CLI 与 Editor 共享本章接口，实际平台差异见[工具调用约定](contract.md)。

## 使用前先了解

- **执行工具请求**：模型提出的请求交给 tools.execute，结果再交给 memory.addTools；tools.execute 不会自己修改消息历史。
- **选择允许的工具**：tools 参数省略时不额外限制，填 [] 则禁止全部目标。每个请求的 inputs 是已准备好的 JSON 数据，不再次解释里面的 $。
- **失败和限制**：普通工具失败会成为 ok=false 的结果；模型失败、预算耗尽等可能终止批次。每次运行模型和工具调用分别最多 64 次，单批最多 32 项，工具子流程最多 2000 步，工具执行嵌套最多 8 层。
- **脚本返回**：script.run 直接返回代码中 result(...) 设置的 JSON 内容；不调用时返回 null。多次调用以最后一次为准，调用 result 后代码仍继续执行，之后报错仍会失败。脚本写法见[脚本开发](../scripts/development.md)。

以下 YAML 是单个工具的**步骤片段**，不能直接作为流程文件运行。把它放进完整流程的 `steps` 下，并准备 answer 输出字段。完整写法和结果保存方式见[如何阅读工具说明](reference.md#如何阅读工具说明)。

## script.run

执行 JavaScript 模块，用 input 接收数据、result 设置整个返回值。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| code | string | 必填 | 要执行的 JavaScript ES 模块源码 |
| input | JSON | 可选；默认 {} | 交给脚本的数据；脚本通过 input 读取，例如 input.count |

返回：3，直接返回数字，不包成 {result: 3}。

使用 output 保存完整返回值，不要假设它额外包了一层 result。

```yaml
- type: call
  target: script.run
  inputs:
    code: result(input.count + 1);
    input:
      count: 2
  output: $answer
```

## tools.execute

执行模型提出的工具请求，逐项返回成功或失败；之后由 memory.addTools 追加上下文。

| 参数 | 类型 | 是否必填与默认值 | 说明 |
| --- | --- | --- | --- |
| calls | JSON | 必填 | 工具请求列表，每项含 id、target、inputs |
| tools | string[] | 可选 | 省略时不额外限制；填写列表后只允许其中的目标，填写 [] 则禁止全部目标。 |

返回：{results: [{id: "one", target: "math.abs", ok: true, value: {result: 2}}]}。

命名输出属性：`results`。可用 outputs 分别映射；也可用 output 保存完整对象。

```yaml
- type: call
  target: tools.execute
  inputs:
    calls:
      - id: one
        target: math.abs
        inputs:
          value: -2
    tools:
      - math.abs
  output: $answer
```
