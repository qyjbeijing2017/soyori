# 脚本开发

使用 `script.run` 执行 JavaScript 模块。它适合解析数据、格式转换和复杂计算；顺序、条件、循环和调用仍可以留在流程中，方便逐步查看。

脚本是一段用 JavaScript 写成的操作说明。普通字段操作、计算和工具调用都可以通过现有步骤完成；需要编写自定义处理时，再使用本章。不熟悉代码时，可以让助手根据输入和预期结果编写、测试脚本。

## 输入和输出

必填 `code` 是 ES 模块源码；可选 `input` 是 JSON 数据，省略为 `{}`。模块读取全局 input，通过全局 `result(value)` 设置返回值。

可以先从最简单的例子理解：输入 `{count: 2}`，代码写 `result(input.count + 1);`，就会返回数字 `3`。其中 `input.count` 读取传入的 count，`result(...)` 告诉流程要交回什么结果。JavaScript 代码中的字段读取不加 `$`。

下面的步骤片段计算两个商品的总价；它需要放在完整流程的 `steps` 中，并准备 summary 字段保存结果：

```yaml
- type: call
  target: script.run
  inputs:
    code: |
      const total = input.items.reduce((sum, item) => sum + item.price, 0);
      result({ total, count: input.items.length });
    input:
      items:
        - price: 2
        - price: 3
  output: $summary
```

结果为 `{total: 5, count: 2}`。若用 `outputs: {total: "$total"}` 则只保存 total。输入和输出都必须符合 JSON 边界；undefined、循环引用和函数等不能返回。

result 不结束执行，按调用时的 JSON 快照保存；多次调用以最后一次为准，不调用返回 null。模块求值和顶层 await 完成后返回，不等待未 await 的后台任务。设置结果后再抛错仍使整个调用失败。

## 模块和完整工程

`flow.yaml`：

```yaml
schemaVersion: 1
name: 手册脚本
fields:
  chatOut:
    output: true
steps:
  - type: call
    target: script.run
    inputs:
      code: |
        import { greet } from './lib/greet.js';
        result(greet(input.name));
      input:
        name: 小明
    output: $chatOut
```

`lib/greet.js`：

```js
export function greet(name) {
  return `你好，${name}！`;
}
```

导入本章示例并打开 flow，预期输出 `{chatOut: "你好，小明！"}`。只引入顶层执行脚本也可以写 `code: "import './main.js';"`。导出函数不会自动调用，应显式调用它。

## 依赖解析规则

支持静态 import、再导出、字符串字面量动态 `await import('./module.js')` 和 JSON 模块；不支持计算式 `import(variable)`、用户代码 require。旧 runScript 名称和 script 参数已经移除。

内联代码的相对路径基于调用流程，文件模块的相对路径基于当前模块，远程相对路径基于重定向后的最终 URL。加载器先准备静态与字面量动态依赖，因此没有实际走到的动态分支也可能因文件缺失在准备阶段报错。模块循环和复用由打包器处理，import.meta.url 保留原始来源。

## 浏览器与 CLI

| 项目 | Editor | CLI |
| --- | --- | --- |
| 本地模块 | Library 工作区快照 | 磁盘 |
| HTTPS 模块 | 支持，受 CORS 限制 | 支持，不能转向本地来源 |
| npm 包和 Node 内置模块 | 不支持 | 本地模块可使用已安装包，不自动安装 |
| TypeScript 文件 | 可保存编辑，不作为 JS 模块执行 | 当前脚本接口不承诺 TS 执行 |
| 超时 | 每次调用包含加载、编译、执行共 30 秒 | 共用 CLI 全流程超时，默认 30 秒 |

每次调用创建独立 Worker，结束、失败或停止时终止。单模块最多 2 MiB，依赖图最多 128 模块、16 MiB。Worker 是执行边界，不是不可信代码安全沙箱；已发生的网络和文件副作用不会回滚。

## 编写与调试

先用固定的小输入验证，再引用真实流程字段。源码编辑器提供 JS 语法诊断和导入路径补全，不是类型检查器。导入错误检查文件位置和大小写；null 输出检查 result 是否调用；超时检查顶层 await 和无限循环；后续异常检查完整栈。

助手修改脚本时先完整读取文件和 revision，保存后检查调用流程，再运行同一组输入并比较预期结果。见 [助手工具](../tools/assistant.md) 和 [调试](../debugging/guide.md)。
