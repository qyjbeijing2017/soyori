# Environment variables: CLI

CLI combines persistent global configuration, OS environment, and command overrides into a run environment. It is separate from fields, does not use threadId for selection, and does not read browser settings.

## Configuration and priority

At startup: **--env > OS environment > Soyori global configuration**. env.override/load can then override this run. Explicit model step parameters still take priority.

```powershell
soyori env --help
soyori env set --help
soyori env set OPENAI_MODEL your-model-id
soyori env set OPENAI_API_KEY demo-key --sensitive
soyori env list --json
soyori run flow.yaml --env LLM_PROVIDER=openai --env OPENAI_MODEL=another-model --json
```

The demo key is not a credential. Settings are local plaintext; Sensitive obscures display rather than encrypting. Use the same --storage-dir for environment management and execution to read the same global configuration.

## OS environment and temporary overrides

```powershell
$env:OPENAI_BASE_URL = "https://your-service.example/v1"
soyori run flow.yaml --env LLM_PROVIDER=openai --json
Remove-Item Env:OPENAI_BASE_URL
```

PowerShell $env: affects the current terminal and later child processes. --env affects only this run/validate. Repeat it as needed; the last same-name value wins. It splits at the first equals sign and always supplies text. NAME= overrides with an empty string.

env set/delete changes persistent global settings, not OS settings. env list shows source and state; OS values default to sensitive. Deleting a global entry does not remove an OS entry of the same name.

## Load files and override within a run

CLI does not auto-load .env and has no --env-file. Call env.load for the documented JSON format. Relative paths use the calling flow's directory; remote flows cannot read local configuration.

```yaml
- type: call
  target: env.load
  inputs:
    path: ./environment.json
- type: call
  target: llm.auto
  inputs:
    input: Hello
  outputs:
    result: $answer
```

This is a step fragment: place it in a complete flow with an answer output field. See [shared principles](../agents/environment.md) and [CLI reference](../cli/guide.md).
