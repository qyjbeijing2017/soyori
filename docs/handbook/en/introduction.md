# What is Soyori?

Soyori helps you combine AI and tools into an assistant that can complete tasks: an AI Agent. Edit and run flows on a computer or phone, then inspect each step when something goes wrong. You can start with examples even if you have never written code.

Work directly, or ask the built-in assistant to read the handbook, edit files, and test saved flows.

Open the [official website / online Editor](https://soyori.joycows.com) to get started. The [online handbook](https://soyori.joycows.com/#document/introduction) uses the same chapters; choose English or Chinese in Settings.

Start with a translation assistant: [desktop Editor](quick-start.md), [mobile Editor](quick-start-mobile.md), or [YAML + CLI](quick-start-cli.md). Continue with [lesson 2: memory](quick-start-memory.md) and [lesson 3: tools](quick-start-tools.md). Both include Editor instructions, complete YAML, and CLI commands.

A **Flow** is the whole definition in one YAML or JSON file. **Fields** hold data; **Steps** describe actions to perform in order. The Editor uses the same names, and files use `fields` and `steps`.

## Reading this handbook

Complete a quick start, then look up what you need:

| Topic | Start here |
| --- | --- |
| Flows | [Overview](flows/language.md), then fields, steps, and subflows |
| Editor | [Chat](editor/chat.md), [Library](workspace.md), [fields](editor/values.md), [steps](editor/flow.md), [debugging](debugging/guide.md), and [settings](editor/settings.md) |
| CLI | [Command reference](cli/guide.md) |
| Environment variables | [Shared principles](agents/environment.md), then [CLI](environment/cli.md) or [Editor](environment/editor.md) |
| Built-in tools | [Overview](tools/reference.md), then individual tool guides |
| Scripts | [Input, results, modules, and debugging](scripts/development.md) |
| Agent examples | [Models and tool loops](agents/models.md), [storage and memory](agents/storage.md) |

The language follows your language setting in Settings. Chapter IDs stay the same. Importing an example uses the current language; switching languages does not rewrite files already in Library. English examples use English names, descriptions, prompts, and messages. Chinese text is retained only as source input for the translation lesson. Screenshots show the English desktop and phone interfaces. Model names and environment values in screenshots are demonstrations, not usable credentials.

## The basic structure of an AI Agent

An Agent usually consists of **an AI model, a set of tools, and a flow that brings them together**:

1. **Receive a task:** the user describes what they want.
2. **Choose an action:** the model decides whether to answer or request a tool.
3. **Execute a tool:** read a file, search, or run code, then give the result to the model.
4. **Continue or finish:** the model uses the result to choose another action or answer the user.

Soyori lets you build, run, and debug this loop.

## How a flow works

Consider an Agent that answers weather questions.

### Flow: one run for each message

Each message sent from Chat starts a new run. The run ends after returning a reply. You can also run a flow directly in the Editor.

Asking “Will it rain in Beijing tomorrow?” starts one run. Asking about the following day starts another run of the same flow.

### Steps: break the task into actions

1. Ask the model to extract the city and requested day.
2. Get today's date to turn “tomorrow” into a specific date.
3. Request a forecast from a weather service you have connected.
4. Ask the model to explain whether rain is expected.

Select steps and change their order in the Editor to build your own flow.

### Tools: give steps their capabilities

| Tool | Used for |
| --- | --- |
| `llm.openai` | Understanding the question and composing the answer with an OpenAI-compatible model, such as DeepSeek |
| `time.now` | Getting the current date and time |
| `web.fetch` | Calling a weather API; you need a service that provides forecast data |

**Contact and feedback:** Report bugs through [GitHub Issues](https://github.com/qyjbeijing2017/soyori/issues). Include steps to reproduce, expected and actual results, your browser version, and screenshots with sensitive information removed. For other inquiries, email author Jacson at [qyjbeijing@gmail.com](mailto:qyjbeijing@gmail.com).
