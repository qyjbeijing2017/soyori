import { extname } from "node:path";
import { parseFlow, RuntimeError } from "soyori-core";
import { parseDocument } from "yaml";
import { readSource, resolveSource } from "./flow-source.js";
import { parseJson } from "./input.js";
import { CliError } from "./protocol.js";

function parseYaml(text: string, source: string): unknown {
  try {
    const document = parseDocument(text, {
      version: "1.2",
      schema: "core",
      stringKeys: true,
      uniqueKeys: true,
      merge: false,
      resolveKnownTags: false,
    });
    const issue = document.errors[0] ?? document.warnings[0];
    if (issue) throw issue;
    if (document.directives?.yaml.version !== "1.2") throw new Error("Only YAML 1.2 is supported.");
    return document.toJS({ maxAliasCount: 100 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Cannot parse document.";
    throw new CliError("INVALID_YAML", `Invalid YAML in ${source}: ${message}`);
  }
}

/** File format belongs to the host; both formats share core validation and field semantics. */
export async function loadFlow(path: string) {
  return (await loadFlowDocument(await resolveSource(path))).definition;
}

export async function loadFlowDocument(source: string) {
  const document = await readSource(source);
  const { text } = document;
  const path = document.source;
  const extension = extname(new URL(path).pathname).toLowerCase();
  const value =
    extension === ".yaml" || extension === ".yml" ? parseYaml(text, path) : parseJson(text, path);
  try {
    return { definition: parseFlow(value), source: path };
  } catch (error) {
    if (error instanceof RuntimeError) error.source = path;
    throw error;
  }
}
