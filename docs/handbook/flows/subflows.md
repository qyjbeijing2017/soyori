# 子流程与调用

用子流程复用一段可理解的步骤。每个文件通过局部 imports 声明依赖，每次调用有独立变量和进度，父子通过输入输出映射交换数据。

## 完整例子

`add-one.yaml`：

```yaml
schemaVersion: 1
name: 加一子流程
fields:
  - name: count
    input: true
    output: true
    initial: 0
steps:
  - type: add
    left: $count
    right: 1
    output: $count
```

同目录的 `main.yaml`：

```yaml
schemaVersion: 1
name: 调用加一
imports:
  increment: ./add-one.yaml
fields:
  - name: answer
    output: true
steps:
  - type: call
    target: increment
    inputs:
      count: 2
    outputs:
      count: $answer
```

运行 main 得到 `{answer: 3}`。可导入本章「子流程调用」示例；CLI 从总工作区执行 `pnpm cli run docs/handbook/examples/subflows/main.yaml --json`。

## 来源和作用域

别名 increment 仅在 main 中有效，不是全局工具名；子流程必须声明自己的 imports。name 只是显示名称，不参与目标查找。工具名与本流程 imports 别名冲突时运行前报错，不存在优先级。

Editor 的子流程 imports 从 Library 解析相对文件路径；CLI 还支持本地及 HTTP(S) 来源。相对引用以导入方文件或重定向后的最终 URL 为基准。远程流程不能引用本地文件。Core 接收宿主链接好的 LoadedFlow 图，不自行读取文件或网络。

## 输入输出

inputs 左侧是子流程 input 字段名，右侧是 Operand；省略使用子流程初值。outputs 左侧是 output 字段名，右侧是父流程写入路径。不能映射未标记的输入输出。

用 `output: $childResult` 可保存完整输出对象，不能同时写 outputs。只有标记 output 的字段返回。缺失输出属性回写 undefined，数据不自动 JSON 序列化。

父子字段容器独立，但引用对象可共享；修改同一对象的内部会互相可见。没有隐式深克隆。

## 单步与调用栈

执行 call 的一步创建子实例并入栈，下一步才执行内部节点。子流程最后一步完成后自动提交输出并出栈。父流程等待期间停在 call 位置。

调用栈由根到当前栈顶；每次调用都有 invocationId，重复调用同一个流程也不同。通过 source、flowName、path 定位文件与节点，通过 childInvocationId 关联子调用。默认最大调用深度为 32，包含根。

子流程失败会使等待中的祖先失败，保留实际出错位置与调用栈；不会自动重试或恢复。完整定位方法见 [调试](../debugging/guide.md)。
