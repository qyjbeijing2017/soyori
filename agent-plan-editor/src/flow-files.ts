import { parseFlow } from "agent-plan-core";
import { parseDocument } from "yaml";

export function readFlowFile(text: string, filename: string) {
  const source = text.replace(/^\uFEFF/, "");
  if (new TextEncoder().encode(source).length > 5 * 1024 * 1024)
    throw new Error("流程文件不能超过 5 MB。");
  let definition: unknown;
  if (/\.ya?ml$/i.test(filename)) {
    const parsed = parseDocument(source, { uniqueKeys: true });
    if (parsed.errors.length || parsed.warnings.length)
      throw parsed.errors[0] ?? parsed.warnings[0];
    definition = parsed.toJS({ maxAliasCount: 100 });
  } else if (/\.json$/i.test(filename)) definition = JSON.parse(source);
  else throw new Error("仅支持 JSON、YAML 和 YML 流程文件。");
  return parseFlow(definition);
}
