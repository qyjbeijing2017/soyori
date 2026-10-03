import {
  createRuntime,
  type FlowDefinition,
  type LoadedFlow,
  type RuntimeFailure,
  type RuntimeFunction,
} from "agent-plan-core";
import { formatState } from "./format-state.ts";

export interface StepRecord {
  path: string;
  before: string;
  after: string;
  error?: RuntimeFailure;
  branch?: string;
}
export function createSession(
  flow: FlowDefinition | LoadedFlow,
  inputs: Record<string, unknown>,
  functions: Record<string, RuntimeFunction> = {},
) {
  const runtime = createRuntime(flow, inputs, { functions });
  const records: StepRecord[] = [];
  const executed = new Set<string>();
  let pending: StepRecord | undefined;
  return {
    runtime,
    records,
    executed,
    async step() {
      const before = formatState(runtime.getState().fields);
      const result = await runtime.step();
      if (result.event?.invocationId === runtime.invocationId) {
        const record: StepRecord = {
          path: result.event.path,
          before,
          after: formatState(result.state.fields),
          ...(result.event.error ? { error: { ...result.event.error } } : {}),
          branch: result.event.branch,
        };
        if (runtime.getState().status === "waiting") pending = record;
        else {
          executed.add(record.path);
          records.push(record);
        }
        if (records.length > 300) records.shift();
      }
      if (pending && runtime.getState().status !== "waiting") {
        pending.after = formatState(runtime.getState().fields);
        if (runtime.getState().error) pending.error = { ...runtime.getState().error! };
        executed.add(pending.path);
        records.push(pending);
        if (records.length > 300) records.shift();
        pending = undefined;
      }
      return result;
    },
  };
}
export type Session = ReturnType<typeof createSession>;
export function errorAdvice(code: string) {
  switch (code) {
    case "DIVISION_BY_ZERO":
      return "除数不能为 0。修改这一项后重新运行。";
    case "INVALID_NUMBER":
      return "这个计算需要数字。检查输入值和引用的数据。";
    case "LOOP_LIMIT":
      return "循环次数已达到上限。检查循环内是否更新了判断条件。";
    case "INVALID_PATH":
      return "数据位置写法有误。请检查 $ 开头的变量路径。";
    default:
      return "检查这一步的参数和引用的数据，修改后重新运行。";
  }
}
