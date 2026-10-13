import { type FlowDefinition, fieldDefinitions, withoutSensitiveInitials } from "agent-plan-core";
import { stringify } from "yaml";
import { readFlowFile } from "./flow-files.ts";

export async function exportFile(content: Blob, path: string): Promise<Blob> {
  if (!/\.(json|ya?ml)$/i.test(path)) return content;
  let flow: FlowDefinition;
  try {
    flow = readFlowFile(await content.text(), path);
  } catch {
    return content;
  }
  if (
    !Object.values(fieldDefinitions(flow.fields)).some(
      (field) => field.sensitive && Object.hasOwn(field, "initial"),
    )
  )
    return content;
  const portable = withoutSensitiveInitials(flow);
  return new Blob(
    [/\.json$/i.test(path) ? JSON.stringify(portable, null, 2) : stringify(portable)],
    { type: content.type },
  );
}
