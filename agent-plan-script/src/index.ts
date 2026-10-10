import { parse } from "acorn";
import { type ToolDefinition, toJsonValue } from "agent-plan-core";
import type { build, Plugin } from "esbuild-wasm";

export const SCRIPT_TOOL_DEFINITION: ToolDefinition = {
  name: "script.run",
  description: "Execute a JavaScript module with JSON input and output in a fresh Worker.",
  inputs: [
    {
      name: "code",
      valueType: "string",
      required: true,
      description:
        "ES module source. Read input and set output with result(value); import external scripts.",
    },
    { name: "input", valueType: "JSON", defaultValue: {} },
  ],
  outputs: [],
  returns: { valueType: "JSON", description: "The script return value." },
};

export function scriptInput(raw: Record<string, unknown>) {
  if (Object.keys(raw).some((key) => !["code", "input"].includes(key)))
    throw Error("INVALID_SCRIPT: Unsupported parameter.");
  const { code } = raw;
  if (typeof code !== "string" || !code.trim())
    throw Error("INVALID_SCRIPT: Provide nonempty code.");
  return { code };
}

/** Each host calls this inside its fresh Worker before evaluating the module graph. */
export async function executeScript(input: unknown, evaluate: () => Promise<unknown>) {
  let output: unknown = null;
  Object.defineProperties(globalThis, {
    input: { value: toJsonValue(input === undefined ? {} : input), configurable: true },
    result: {
      value: (value: unknown) => {
        try {
          output = toJsonValue(value);
        } catch {
          throw Error("SCRIPT_OUTPUT_NOT_JSON: Script result must be JSON-compatible.");
        }
      },
      configurable: true,
    },
  });
  try {
    await evaluate();
    return output;
  } finally {
    Reflect.deleteProperty(globalThis, "input");
    Reflect.deleteProperty(globalThis, "result");
  }
}

/** Validate dynamic specifiers and retain the original module URL after bundling. */
export function moduleSource(code: string, source: string): string {
  const tree = parse(code, { ecmaVersion: "latest", sourceType: "module" });
  const pending: unknown[] = [tree];
  const edits: { start: number; end: number }[] = [];
  while (pending.length) {
    const item = pending.pop();
    if (!item || typeof item !== "object") continue;
    const node = item as {
      type?: string;
      name?: string;
      source?: { type?: string; value?: unknown };
      object?: { type?: string; meta?: { name?: string }; property?: { name?: string } };
      computed?: boolean;
      property?: { name?: string };
      start: number;
      end: number;
    };
    if (
      node.type === "ImportExpression" &&
      !(node.source?.type === "Literal" && typeof node.source.value === "string")
    )
      throw Error("SCRIPT_IMPORT_UNSUPPORTED: Dynamic import requires a string literal.");
    if (node.type === "Identifier" && node.name === "require")
      throw Error("SCRIPT_IMPORT_UNSUPPORTED: Use ESM import instead of require.");
    if (
      node.type === "MemberExpression" &&
      node.object?.type === "MetaProperty" &&
      node.object.meta?.name === "import" &&
      node.object.property?.name === "meta" &&
      !node.computed &&
      node.property?.name === "url"
    )
      edits.push(node as { start: number; end: number });
    pending.push(...Object.values(node));
  }
  for (const edit of edits.sort((a, b) => b.start - a.start))
    code = code.slice(0, edit.start) + JSON.stringify(source) + code.slice(edit.end);
  return code;
}

export interface ModuleHost {
  platform: "node" | "browser";
  resolve(reference: string, parent?: string): Promise<string> | string;
  load(source: string): Promise<{ source: string; text: string }>;
  /** CLI directory for already-installed package resolution. */
  directory?(source: string): string | undefined;
}

export async function bundleScript(
  raw: Record<string, unknown>,
  parent: string | undefined,
  host: ModuleHost,
  compiler?: typeof build,
) {
  const { code } = scriptInput(raw);
  const entry = parent ?? "workspace:/inline.js";
  const loaded = new Map<string, Promise<{ source: string; text: string }>>();
  const canonical = new Map<string, { source: string; text: string }>();
  async function load(source: string) {
    let promise = loaded.get(source);
    if (!promise) {
      if (loaded.size >= 256 || canonical.size >= 128)
        throw Error("SCRIPT_TOO_LARGE: More than 128 modules.");
      promise = source === entry ? Promise.resolve({ source, text: code }) : host.load(source);
      loaded.set(source, promise);
    }
    const file = await promise;
    const prior = canonical.get(file.source);
    if (prior) return prior;
    canonical.set(file.source, file);
    loaded.set(file.source, Promise.resolve(file));
    return file;
  }
  let total = 0;
  const plugin: Plugin = {
    name: "script-files",
    setup(builder) {
      builder.onResolve({ filter: /.*/, namespace: "script" }, async (args) => {
        const base = (args.pluginData as { source?: string } | undefined)?.source ?? args.importer;
        const bare = !/^(\.{1,2}\/|\/|[a-z][a-z\d+.-]*:)/i.test(args.path);
        if (bare || args.path.startsWith("node:")) {
          const dir = host.directory?.(base);
          if (host.platform !== "node" || !dir)
            throw Error(
              `SCRIPT_IMPORT_UNSUPPORTED: Package/builtin import ${args.path} from ${base}.`,
            );
          return builder.resolve(args.path, { resolveDir: dir, kind: args.kind });
        }
        return {
          path: (await load(await host.resolve(args.path, base))).source,
          namespace: "script",
        };
      });
      builder.onResolve({ filter: /^agent-plan:entry$/ }, () => ({
        path: entry,
        namespace: "script",
      }));
      builder.onLoad({ filter: /.*/, namespace: "script" }, async (args) => {
        const file = await load(args.path);
        const bytes = new TextEncoder().encode(file.text).length;
        total += bytes;
        if (bytes > 2 * 1024 * 1024 || total > 16 * 1024 * 1024)
          throw Error("SCRIPT_TOO_LARGE: Module exceeds 2 MiB or graph exceeds 16 MiB.");
        const json = args.path !== entry && /\.json(?:[?#]|$)/i.test(file.source);
        return {
          contents: json ? file.text : moduleSource(file.text, file.source),
          loader: json ? "json" : "js",
          pluginData: { source: file.source },
          resolveDir: host.directory?.(file.source),
        };
      });
    },
  };
  const compile = compiler ?? (await import("esbuild-wasm")).build;
  const result = await compile({
    ...(host.platform === "node" && entry.startsWith("file:")
      ? {
          banner: {
            js: `import { createRequire as __agentPlanCreateRequire } from "node:module"; const require = __agentPlanCreateRequire(${JSON.stringify(entry)});`,
          },
        }
      : {}),
    entryPoints: ["agent-plan:entry"],
    bundle: true,
    write: false,
    format: "esm",
    platform: host.platform,
    target: "es2022",
    plugins: [plugin],
    logLevel: "silent",
  });
  return result.outputFiles[0].text;
}
