# 运行与调试

调试先确认运行的是哪一版文件、传入什么输入，再定位具体层级。保存成功、校验成功和执行成功是三个不同结果。

## 推荐顺序

1. 保存流程及脚本，记录路径和输入；助手读取 revision。
2. 检查 JSON/YAML 和 Core 结构，再检查导入路径、调用目标与输入输出映射。
3. 用最小固定输入运行；复杂流程单步观察条件和变量。
4. 找到实际失败的 source、flowName、path 与调用栈，不只看最外层 call。
5. 修复后重新校验，使用同一输入验证，再补充边界输入。

Editor 提供单步与变量面板。暂停通常在步骤之间生效，正在等待的宿主调用不是可冻结现场。停止传播取消并清理支持的执行环境，不回滚外部效果。运行状态是实时视图，记录不是恢复快照。

## 用一个真实错误练习

本章「修复除零错误」包含 broken.yaml 和 fixed.yaml。broken 的步骤为：

```yaml
- type: divide
  left: 10
  right: 0
  output: $answer
```

运行失败为 DIVISION_BY_ZERO，位置 steps[0]。把 right 改为 2，保存重新运行，预期输出 `{answer: 5}`。不要只修改提示词或吞掉错误；应该修复实际分母。

## 常见失败

| 现象 | 检查与修复 |
| --- | --- |
| INVALID_FLOW / INVALID_YAML | 检查字段结构、缩进、重复键、未知节点和路径，定位文件解析错误 |
| 调用目标不存在 | 查当前文件 imports 和工具注册表，别名不是流程 name |
| INVALID_NUMBER | 检查引用是否读取对象、数组或不可转换值 |
| LOOP_LIMIT / FLOW_LIMIT | 循环内是否更新条件，工具请求是否持续产生；先修循环再调整限制 |
| 输出缺失 | 字段是否 output=true、映射是否正确、是否读取旧 result 属性 |
| 脚本返回 null | 是否调用 result，是否错误地只导出了函数 |
| 脚本导入失败 | 相对调用流程/模块解析，检查文件大小写及浏览器不支持的包 |
| WORKSPACE_CONFLICT | 完整重读最新文件和 revision，合并后保存 |
| AI_CONFIG / HTTP 状态错误 | 检查服务 URL、model、apiKey 与接口支持 |
| 网络错误 | 区分连接、超时、浏览器 CORS 和 SDK 处理，不能仅凭通用提示认定 CORS |
| OUTPUT_NOT_JSON | CLI 结果含 undefined、循环或特殊值；显式转换后返回 JSON |

## 嵌套调用定位

错误中的 invocationId 区分不同调用，flowName 是显示名，source 是文件来源，path 定位节点。call 事件的 childInvocationId 指向子实例，trace 的 returned 表示本步出栈的实例；多层返回可能一次有多个 returned。

Core getStack 返回实时根到栈顶视图，成功子流程出栈，不是历史列表。错误保留失败链，修复父 call 之前先查看最深的实际错误。

## CLI trace

```powershell
pnpm cli run docs/handbook/examples/subflows/main.yaml --trace run-001.jsonl --trace-values --json
```

trace 文件必须不存在。JSONL 记录 start、initial、step-start、step-end、end。默认不采集字段，--trace-values 显式开启有限摘要，可能包含敏感输入。可按 source/path 和 childInvocationId 检查子流程，不能从摘要恢复运行。

CLI 默认总超时 30 秒，包括流程加载、模块、模型及 trace 等待。--timeout 显式值优先于 SOYORI_TIMEOUT；超时退出 124，中断 130。它能终止执行子进程，但不能撤销网络或文件副作用。

## 助手如何验证修复

助手先读完整文件与手册，再保存、flow.inspect、flow.run。成功且 resultAvailable=true 时用真实 result 判断类型和数值；output 是有损文本，不能根据引号推断数字变成了字符串。不可 JSON 或超限时应报告 resultUnavailable，不能伪造完整结果。记录最多 100 条，应如实报告 truncated。失败工具返回和运行 status=failed 都不是成功。

助手当前只能运行已保存文件，不能读取未保存草稿、设置断点或操纵 Editor 现场。用户应保存相关文件，助手用相同输入重跑；需要人工单步时切到 Editor。接口见 [助手工具](../tools/assistant.md)。
