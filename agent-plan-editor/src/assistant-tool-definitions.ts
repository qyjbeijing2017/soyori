import type { ToolDefinition, ToolParameter } from "agent-plan-core";

const text = (name: string, description: string, required = true): ToolParameter => ({
  name,
  description,
  required,
  valueType: "string",
});
const specifications: [string, string, ToolParameter[]][] = [
  [
    "flow.create",
    "在 Agent Plan 文件库创建一个新流程（默认使用新建流程模板）。未提供名称时自动命名，默认保存到根目录，不需要追问名称、类型、格式或详细功能。成功返回实际保存路径，不覆盖已有文件。",
    [
      text("name", "可选流程名称；省略自动生成", false),
      text("directory", "文件库目录；省略或空字符串表示根目录", false),
      text("description", "可选流程说明", false),
    ],
  ],
  [
    "project.docs",
    "Read the official Agent Plan handbook shared with Document. Omit arguments for chapter catalog (no full-text load); query searches contents. Read by chapter id or path, optionally section heading id and offset/limit. Returns version, source, headings and nextOffset for truncated content. Covers flow syntax, scripts, CLI, tools and debugging.",
    [
      text("path", "Document path to read; omit to search/list", false),
      text("query", "Search text", false),
      text(
        "section",
        "Optional heading id returned by a chapter read; offsets are relative to this section",
        false,
      ),
      { name: "offset", valueType: "number" },
      { name: "limit", valueType: "number" },
    ],
  ],
  [
    "project.tools",
    "List available tool names and descriptions, or read one tool's complete interface.",
    [text("name", "Exact tool name; omit to list", false)],
  ],
  [
    "workspace.list",
    "List workspace file metadata filtered by directory prefix and search text; no file contents.",
    [text("prefix", "Directory or path prefix", false), text("query", "Path search text", false)],
  ],
  [
    "workspace.read",
    "Read a UTF-8 text file with its revision. Binary files are not text. Use revision when replacing.",
    [
      text("path", "Workspace relative path"),
      { name: "offset", valueType: "number" },
      { name: "limit", valueType: "number" },
    ],
  ],
  [
    "workspace.write",
    "Create a text file, or replace it using the revision from workspace.read. JSON/YAML may be ordinary files; use flow.inspect to validate flows.",
    [
      text("path", "Workspace relative path"),
      text("content", "Complete UTF-8 file content"),
      text("revision", "Required for replacing an existing file; omit for create", false),
    ],
  ],
  ["workspace.mkdir", "Create an empty workspace directory.", [text("path", "Directory path")]],
  [
    "workspace.move",
    "Rename or move a file/directory; conflicts fail. Flow references are not rewritten.",
    [text("path", "Source path"), text("destination", "New path")],
  ],
  [
    "workspace.copy",
    "Copy file/directory into target directory; duplicate names receive a suffix.",
    [text("path", "Source path"), text("directory", "Target directory, empty for root")],
  ],
  [
    "workspace.delete",
    "Delete a file or directory recursively. Only use when user requested deletion.",
    [text("path", "Source path")],
  ],
  [
    "flow.inspect",
    "Validate a saved JSON/YAML flow and resolve workspace imports, returning its interface and steps. Does not run.",
    [text("path", "Saved flow path")],
  ],
  [
    "flow.run",
    "Run a saved workspace flow with literal inputs through Core. Verify status then resultAvailable: true means result is the actual JSON output preserving numbers, booleans, null, arrays and objects (serialized limit 16000 characters). Otherwise resultUnavailable explains why. output is only a lossy readable summary; do not infer value types from it. Also returns errors, stack and bounded records. Runs saved files, not editor drafts.",
    [
      text("path", "Saved flow path"),
      { name: "inputs", valueType: "JSON", description: "Object of literal input values" },
    ],
  ],
];
export const ASSISTANT_TOOL_DEFINITIONS: Record<string, ToolDefinition> = Object.fromEntries(
  specifications.map(([name, description, inputs]) => [
    name,
    { name, description, inputs, outputs: [], returns: { valueType: "JSON" } },
  ]),
);
