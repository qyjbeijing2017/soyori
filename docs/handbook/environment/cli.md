# 环境变量：CLI

CLI 将持久全局配置、操作系统环境和本次命令参数合成为运行环境。它独立于流程字段，不根据 threadId 选择配置，也不自动读取网页设置。

## 配置与优先级

启动时同名字段按 `--env > 操作系统环境 > Soyori 全局配置` 选择。启动后，流程中的 `env.override/load` 可进一步覆盖本次运行。步骤显式填写的 LLM 参数仍优先于运行环境。

```powershell
soyori env --help
soyori env set --help
soyori env set OPENAI_MODEL your-model-id
soyori env set OPENAI_API_KEY demo-key --sensitive
soyori env list --json
soyori run flow.yaml --env LLM_PROVIDER=openai --env OPENAI_MODEL=another-model --json
```

示例密钥只作演示。实际凭证保存在本机，敏感标记遮挡显示，不加密。运行和环境管理使用同一 `--storage-dir`，否则可能读取不同的全局配置。

## 系统环境与临时覆盖

```powershell
$env:OPENAI_BASE_URL = "https://your-service.example/v1"
soyori run flow.yaml --env LLM_PROVIDER=openai --json
Remove-Item Env:OPENAI_BASE_URL
```

PowerShell 的 `$env:` 影响当前终端及后续子进程；`--env` 只影响这次 run/validate。可重复传入，同名最后一项生效，只在第一个等号处分割，值始终为字符串。`NAME=` 用空字符串覆盖下层值。

`env set/delete` 修改持久全局配置，系统环境不会因此保存。`env list` 显示来源与状态，系统环境值默认敏感。删除全局项不会删除同名系统环境。

## 文件加载与运行内覆盖

CLI 不自动加载 `.env`，没有 `--env-file`。需要约定 JSON 时，在流程中调用 `env.load`；相对路径以正在调用它的流程文件为基准，子流程使用自己的目录，远端流程不能读电脑配置。

```yaml
- type: call
  target: env.load
  inputs:
    path: ./environment.json
- type: call
  target: llm.auto
  inputs:
    input: 你好
  outputs:
    result: $answer
```

这是步骤片段，需放入有 answer 输出字段的完整流程。JSON 格式、空值规则和敏感值行为见[共同原理](../agents/environment.md)。CLI 运行与 trace 见[命令参考](../cli/guide.md)。
