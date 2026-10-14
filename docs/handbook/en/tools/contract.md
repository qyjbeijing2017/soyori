# Tool contracts and platform support

Use tools through Call steps. Most names and inputs are shared between CLI and Editor; some tools belong only to the web assistant. Start with the [complete example](reference.md#how-to-read-tool-documentation) before using this developer reference.

## Tool definitions

Core RuntimeFunction accepts an input object and returns a value or Promise. It can carry a ToolDefinition containing name, description, inputs, outputs, and optional returns. Parameters can declare valueType, required, defaultValue, initial, placeholder, and display groups.

defaultValue documents handler behavior without inserting a step input. initial is the operand inserted by the Editor when a tool is selected. Display groups do not change input structure.

Definitions drive forms and model tool schemas, not a second automatic validator. Handlers validate actual inputs. Subflow interfaces derive from marked fields. Host functions exposed to models need an interface definition.

## Shared calling rules

Step inputs resolve operands before invocation. Returns stay unchanged: output saves the whole value; outputs selects direct properties. The shared scheduler waits for a Promise. Throwing fails the step without committing pending outputs; external effects are not rolled back.

Tools have their own limits and prefixes such as WEB_NETWORK, AI_CONFIG, and BASIC_INPUT. Core adds flow/step locations. Host errors are not all structurally identical; inspect both structured locations and messages.

## Actual support matrix

| Tools | CLI | Editor | Difference |
| --- | --- | --- | --- |
| time.now, math.*, text.*, array.* | Yes | Yes | Host timezone by default |
| web.fetch, web.search | Yes | Yes | Browser CORS and header restrictions |
| storage.read/write/delete/list | Yes | Yes | Disk JSON vs IndexedDB; no automatic sync |
| env.get/override/load | Yes | Yes | Different startup sources; overrides do not persist |
| env.list/inspect/set | No | Assistant only | Obscured state; set writes only this conversation |
| tokens.count | Yes | Yes | Local needs tokenizer; browser requires download permission |
| memory.init/save/setSystem/addUser/addAssistant/addTools | Yes | Yes | Each host uses its own storage |
| llm.auto/openai/anthropic/local | Yes | Yes | Shared fallback rules; browser WebGPU vs CLI GPU with initialization fallback to CPU |
| tools.execute | Yes | Yes | Current scope, registry, and shared budget |
| script.run | Yes | Yes | Module sources, packages, and timeout scope differ |
| project.docs/tools | No | Yes | Editor assistant interface |
| workspace.list/read/write/mkdir/move/copy/delete | No | Yes | Browser Library |
| flow.create/inspect/run | No | Yes | Saved flows, not live source drafts |

CLI inspect/run commands are not the same tool interfaces as assistant flow.inspect/run. Similar capabilities do not mean those tools are registered in CLI.

## Discover tools

Editor's Call selector lists available tools. The assistant uses project.tools, optionally with name for one definition. CLI can use built-ins or --functions; it has no project.tools discovery command.

When developing a tool, document input, defaults, return data, errors, side effects, timeout, and cancellation. Verify shared changes on both hosts and update this matrix. Do not mark unimplemented capabilities as supported.
