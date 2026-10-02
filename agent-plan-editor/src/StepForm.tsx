import { AI_TOOLS } from "agent-plan-ai";
import type { JsonValue, Step } from "agent-plan-core";
import { type FormEvent, useState } from "react";
import { newStep, stepNames } from "./step-model";

export function ValueInput({
  name,
  value,
  literal = false,
}: {
  name: string;
  value: JsonValue;
  literal?: boolean;
}) {
  const initialMode =
    typeof value !== "string"
      ? "json"
      : !literal && value.startsWith("$") && !value.startsWith("$$")
        ? "reference"
        : "text";
  const [mode, setMode] = useState(initialMode);
  const initialText =
    initialMode === "json"
      ? JSON.stringify(value, null, 2)
      : !literal && typeof value === "string" && value.startsWith("$$")
        ? value.slice(1)
        : String(value);
  return (
    <div className="value-input">
      <select
        name={`${name}:mode`}
        aria-label={`${name} 输入方式`}
        value={mode}
        onChange={(e) => setMode(e.target.value)}
      >
        <option value="text">直接填写文字</option>
        {!literal && <option value="reference">引用数据（$路径）</option>}
        <option value="json">数字 / 对象 / 布尔值</option>
      </select>
      <textarea
        name={name}
        aria-label={name}
        rows={mode === "json" ? 3 : 2}
        defaultValue={initialText}
        spellCheck={false}
      />
    </div>
  );
}
export function readValue(data: FormData, name: string, literal = false): JsonValue {
  const value = String(data.get(name) ?? "");
  const mode = data.get(`${name}:mode`);
  if (mode === "json") {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`${name}：请填写有效的 JSON，例如 3、true 或 {"key":"value"}。`);
    }
  }
  if (mode === "reference") {
    if (!value.startsWith("$") || value.startsWith("$$"))
      throw new Error(`${name}：引用需要以单个 $ 开头。`);
    return value;
  }
  return !literal && value.startsWith("$") ? `$${value}` : value;
}
export function StepForm({
  step,
  onSave,
  onCancel,
}: {
  step: Step;
  onSave: (step: Step) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(step);
  const [error, setError] = useState("");
  const [formKey, setFormKey] = useState(0);
  const toolId = step.type === "call" && step.target.kind === "function" ? step.target.id : "";
  const initialTool =
    AI_TOOLS.some((id) => id === toolId) &&
    step.type === "call" &&
    step.inputs?.messages === undefined &&
    Object.keys(step.inputs ?? {}).every((key) =>
      ["prompt", "model", "maxTokens", "temperature"].includes(key),
    ) &&
    [step.inputs?.maxTokens, step.inputs?.temperature].every(
      (value) => value === undefined || typeof value === "number",
    ) &&
    (!step.outputs ||
      (Object.keys(step.outputs).length === 1 && step.outputs.text !== undefined)) &&
    (step.output !== undefined || step.outputs?.text !== undefined)
      ? toolId
      : "";
  const [aiTool, setAiTool] = useState(initialTool);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const data = new FormData(event.currentTarget);
      const next = { ...draft, description: String(data.get("description") ?? "") };
      if ("field" in next) next.field = String(data.get("field")) as `$${string}`;
      if ("output" in next) next.output = String(data.get("output")) as `$${string}`;
      if ("value" in next) next.value = readValue(data, "内容");
      if ("left" in next) {
        next.left = readValue(data, "左值");
        next.right = readValue(data, "右值");
      }
      if ("condition" in next) next.condition = readValue(data, "判断条件");
      if (next.type === "not") next.input = readValue(data, "输入");
      if (next.type === "concat" || next.type === "and" || next.type === "or")
        next.inputs = next.inputs.map((_, i) => readValue(data, `第 ${i + 1} 项`));
      if (next.type === "call") {
        if (aiTool) {
          const inputs: Record<string, JsonValue> = {
            prompt: readValue(data, "提示词"),
            maxTokens: Number(data.get("maxTokens")),
          };
          const model = String(data.get("model") ?? "").trim();
          if (model && aiTool !== "local.generate") inputs.model = model;
          const temperature = String(data.get("temperature") ?? "");
          if (temperature !== "") inputs.temperature = Number(temperature);
          const destination = String(data.get("aiOutput")) as `$${string}`;
          onSave({
            type: "call",
            description: next.description,
            target: { kind: "function", id: aiTool },
            inputs,
            ...(data.get("aiOutputMode") === "text"
              ? { outputs: { text: destination } }
              : { output: destination }),
          });
          return;
        }
        const value: unknown = JSON.parse(String(data.get("call")));
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new Error("调用配置必须是对象。");
        onSave({ ...value, type: "call", description: next.description } as Step);
      } else onSave(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  return (
    <form className="step-form" onSubmit={submit}>
      <div className="panel-title">
        <h2>编辑步骤</h2>
        <button type="button" onClick={onCancel}>
          取消
        </button>
      </div>
      <p className="muted">保存后生效，并清空旧运行。切换类型会重置该步参数及子步骤。</p>
      <label>
        操作类型
        <select
          value={draft.type}
          onChange={(e) => {
            setDraft(newStep(e.target.value as Step["type"]));
            setAiTool("");
            setFormKey(formKey + 1);
            setError("");
          }}
        >
          {Object.entries(stepNames).map(([type, name]) => (
            <option key={type} value={type}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <div key={formKey} className="form-fields">
        <label>
          步骤名称
          <input
            name="description"
            defaultValue={draft.description ?? ""}
            placeholder={stepNames[draft.type]}
          />
        </label>
        {"field" in draft && (
          <label>
            保存到数据位置
            <input name="field" defaultValue={draft.field} placeholder="$result" required />
          </label>
        )}
        {"output" in draft && draft.type !== "call" && (
          <label>
            结果保存到
            <input name="output" defaultValue={draft.output} required />
          </label>
        )}
        {"value" in draft && (
          <div>
            <span>内容</span>
            <ValueInput name="内容" value={draft.value} />
          </div>
        )}
        {"left" in draft && (
          <>
            <div>
              左值
              <ValueInput name="左值" value={draft.left} />
            </div>
            <div>
              右值
              <ValueInput name="右值" value={draft.right} />
            </div>
          </>
        )}
        {"condition" in draft && (
          <div>
            判断条件
            <ValueInput name="判断条件" value={draft.condition} />
          </div>
        )}
        {draft.type === "not" && (
          <div>
            输入
            <ValueInput name="输入" value={draft.input} />
          </div>
        )}
        {(draft.type === "concat" || draft.type === "and" || draft.type === "or") && (
          <>
            {draft.inputs.map((value, i) => (
              <div key={String(i)}>
                第 {i + 1} 项<ValueInput name={`第 ${i + 1} 项`} value={value} />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setDraft({ ...draft, inputs: [...draft.inputs, ""] })}
            >
              ＋ 增加一项
            </button>
            {draft.inputs.length > 1 && (
              <button
                type="button"
                onClick={() => setDraft({ ...draft, inputs: draft.inputs.slice(0, -1) })}
              >
                移除最后一项
              </button>
            )}
          </>
        )}
        {draft.type === "call" && (
          <>
            <label>
              调用方式
              <select value={aiTool} onChange={(e) => setAiTool(e.target.value)}>
                <option value="">高级 JSON / 其他调用</option>
                <option value="local.generate">本地 AI（免费，无需密钥）</option>
                <option value="openai.generate">OpenAI / 兼容服务</option>
                <option value="anthropic.generate">Anthropic</option>
              </select>
            </label>
            {aiTool ? (
              <>
                <p className="muted">
                  单次文本调用。密钥与默认模型在页面“AI 设置”中配置；不自动执行工具。
                </p>
                <div>
                  提示词
                  <ValueInput name="提示词" value={draft.inputs?.prompt ?? ""} />
                </div>
                {aiTool !== "local.generate" && (
                  <label>
                    模型（留空使用 AI 设置）
                    <input
                      name="model"
                      defaultValue={
                        typeof draft.inputs?.model === "string" ? draft.inputs.model : ""
                      }
                    />
                  </label>
                )}
                <label>
                  最多生成 Token
                  <input
                    name="maxTokens"
                    type="number"
                    min={1}
                    max={aiTool === "local.generate" ? 512 : 32768}
                    defaultValue={
                      typeof draft.inputs?.maxTokens === "number" ? draft.inputs.maxTokens : 128
                    }
                    required
                  />
                </label>
                <label>
                  随机程度（留空使用默认值）
                  <input
                    name="temperature"
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    defaultValue={
                      typeof draft.inputs?.temperature === "number" ? draft.inputs.temperature : ""
                    }
                  />
                </label>
                <label>
                  保存内容
                  <select
                    name="aiOutputMode"
                    defaultValue={draft.outputs?.text ? "text" : "result"}
                  >
                    <option value="text">回复文字</option>
                    <option value="result">完整结果（含用量和结束原因）</option>
                  </select>
                </label>
                <label>
                  保存到
                  <input
                    name="aiOutput"
                    defaultValue={draft.outputs?.text ?? draft.output ?? "$answer"}
                    required
                  />
                </label>
              </>
            ) : (
              <>
                <p className="muted">
                  支持三个 AI 工具；messages 多轮文本输入可在此配置。外部子流程加载仍未接入。
                </p>
                <label>
                  调用配置（JSON）
                  <textarea name="call" rows={10} defaultValue={JSON.stringify(draft, null, 2)} />
                </label>
              </>
            )}
          </>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" type="submit">
        保存步骤
      </button>
    </form>
  );
}
