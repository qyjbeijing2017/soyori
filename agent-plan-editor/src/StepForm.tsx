import { Button, Select } from "@mantine/core";
import type { JsonValue, Step } from "agent-plan-core";
import { useContext, useId, useState } from "react";
import { CallChoices } from "./CallChoices";
import {
  callOutputDestinations,
  callOutputNames,
  callParameterNames,
  restrictCallInputs,
  tools,
} from "./call-tools";
import { DescriptionInput } from "./DescriptionInput";
import { tr } from "./i18n";
import { defaultOperand } from "./library-calls";
import { StepIcon } from "./StepIcon";
import { newStep, stepCategory, stepNames } from "./step-model";
import { TemplateInput } from "./TemplateInput";
import { AutoValueInput, ValueEditor, ValueTypeTag } from "./ValueEditor";
import { VariableInput } from "./VariableInput";

export function StepForm({
  step,
  onSave,
  onCancel,
}: {
  step: Step;
  onSave: (step: Step) => void | Promise<void>;
  onCancel: () => void;
}) {
  const choices = useContext(CallChoices);
  const formId = useId();
  const [draft, setDraft] = useState<Step>(() => structuredClone(step));
  const [error, setError] = useState("");
  const callNames =
    draft.type === "call"
      ? callParameterNames(draft.target, choices.find((c) => c.alias === draft.target)?.flow)
      : null;
  const outputNames =
    draft.type === "call"
      ? callOutputNames(draft.target, choices.find((c) => c.alias === draft.target)?.flow)
      : [];
  const outputDestinations =
    draft.type === "call" ? callOutputDestinations(draft, outputNames) : {};
  const extraInputs =
    draft.type === "call" && callNames
      ? Object.keys(draft.inputs ?? {}).filter((name) => !callNames.includes(name))
      : [];
  function patch(value: Record<string, unknown>) {
    setDraft({ ...draft, ...value } as Step);
  }
  function operand(property: string, label: string, value: JsonValue) {
    return (
      <ValueEditor
        key={property}
        label={label}
        value={value}
        onChange={(next) => patch({ [property]: next })}
      />
    );
  }
  const destination = (property: string, value: string, label = tr("保存到变量")) => (
    <label htmlFor={`${formId}-1`}>
      {label}
      <VariableInput
        id={`${formId}-1`}
        aria-label={label}
        suggest
        destination
        autosize
        minRows={1}
        required={draft.type !== "call"}
        onValue={(next) => patch({ [property]: next })}
        value={value}
        onChange={(e) => patch({ [property]: e.target.value })}
        placeholder="answer"
      />
    </label>
  );
  return (
    <form
      className="step-form"
      onKeyDown={(event) => {
        // Let child comboboxes select suggestions, but never implicitly submit from an input.
        if (event.key === "Enter" && event.target instanceof HTMLInputElement)
          event.preventDefault();
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          if (draft.type === "call") {
            if (!callNames) throw Error(tr("请先选择可用的调用目标"));
            const { output, outputs, inputs, ...rest } = draft;
            const base = { ...rest, inputs: restrictCallInputs(inputs ?? {}, callNames) };
            const mapped = Object.fromEntries(
              Object.entries(outputDestinations).filter(([, value]) => value.trim()),
            );
            await onSave(Object.keys(mapped).length ? { ...base, outputs: mapped } : base);
          } else await onSave(draft);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }}
    >
      <div className="form-fields dialog-form">
        <section className="dialog-section dialog-identity">
          <Select
            label={tr("步骤类型")}
            leftSection={<StepIcon type={draft.type} />}
            leftSectionWidth={40}
            classNames={{ groupLabel: "step-type-group" }}
            renderOption={({ option }) => (
              <span className="step-type-option">
                <StepIcon type={option.value as Step["type"]} />
                <span>{option.label}</span>
              </span>
            )}
            value={draft.type}
            searchable
            allowDeselect={false}
            nothingFoundMessage={tr("没有匹配的步骤")}
            comboboxProps={{ withinPortal: true, zIndex: 350 }}
            data={(
              [
                ["call", "调用工具"],
                ["data", "变量操作"],
                ["control", "流程控制"],
                ["text", "文本处理"],
                ["math", "数学运算"],
                ["logic", "比较与逻辑"],
              ] as const
            ).map(([category, title]) => ({
              group: tr(title),
              items: Object.entries(stepNames)
                .filter(([id]) => stepCategory(id as Step["type"]) === category)
                .map(([value, name]) => ({ value, label: tr(name) })),
            }))}
            onChange={(value) => {
              if (value)
                setDraft({
                  ...newStep(value as Step["type"]),
                  ...(draft.description === undefined ? {} : { description: draft.description }),
                });
            }}
          />
        </section>
        {draft.type !== "call" && (
          <section className="dialog-section">
            <h3>{tr(draft.type === "if" || draft.type === "while" ? "判断条件" : "输入参数")}</h3>
            {(draft.type === "set" || draft.type === "append") &&
              operand("value", tr("写入内容"), draft.value)}
            {draft.type === "template" && (
              <TemplateInput
                label={tr("模板正文")}
                inputWrapperOrder={["label", "input", "description", "error"]}
                styles={{ description: { gridColumn: 2 } }}
                description={tr("用 $变量名$ 插入变量，$$ 显示 $；保留换行和缩进。")}
                autosize
                minRows={5}
                maxRows={16}
                value={draft.template}
                onValue={(template) => patch({ template })}
              />
            )}
            {"left" in draft && (
              <>
                {operand("left", tr("左侧"), draft.left)}
                {operand("right", tr("右侧"), draft.right)}
              </>
            )}
            {(draft.type === "and" || draft.type === "or") && (
              <ValueEditor
                label={tr("输入项")}
                value={draft.inputs}
                validate={(value) => {
                  if (!Array.isArray(value))
                    throw Error(tr("请输入列表，例如 [1, 2] 或 YAML 列表"));
                }}
                onChange={(value) => {
                  if (Array.isArray(value)) patch({ inputs: value });
                }}
              />
            )}
            {draft.type === "not" && <>{operand("input", tr("输入"), draft.input)}</>}
            {(draft.type === "if" || draft.type === "while") && (
              <>
                {operand("condition", tr("判断条件"), draft.condition)}
                <p className="muted">
                  {tr("分支内的步骤在列表中展开编辑。引用一个判断结果变量即可。")}
                </p>
              </>
            )}
          </section>
        )}
        {draft.type !== "call" && "output" in draft && (
          <section className="dialog-section">
            <h3>{tr("输出结果")}</h3>
            {destination("output", draft.output)}
          </section>
        )}
        {(draft.type === "set" || draft.type === "append") && (
          <section className="dialog-section">
            <h3>{tr("输出结果")}</h3>
            {destination("field", draft.field)}
          </section>
        )}
        {draft.type === "call" && (
          <>
            <section className="dialog-section">
              <h3>{tr("调用目标")}</h3>
              <Select
                label={tr("选择调用目标")}
                placeholder={tr("搜索工具或流程")}
                searchable
                required
                allowDeselect={false}
                value={draft.target || null}
                nothingFoundMessage={tr("没有匹配的调用目标")}
                comboboxProps={{ withinPortal: true, zIndex: 350 }}
                data={[
                  {
                    group: tr("内置工具"),
                    items: Object.keys(tools).map((value) => ({ value, label: value })),
                  },
                  {
                    group: tr("流程库"),
                    items: choices.map((choice) => ({
                      value: choice.alias,
                      label: choice.label,
                      disabled: choice.unavailable,
                    })),
                  },
                  ...(!Object.hasOwn(tools, draft.target) &&
                  !choices.some((c) => c.alias === draft.target) &&
                  draft.target
                    ? [
                        {
                          group: tr("不可用"),
                          items: [{ value: draft.target, label: draft.target, disabled: true }],
                        },
                      ]
                    : []),
                ]}
                onChange={(target) => {
                  if (!target) return;
                  const choice = choices.find((c) => c.alias === target);
                  const { output: _output, outputs: _outputs, ...base } = draft;
                  setDraft({
                    ...base,
                    target,
                    inputs: structuredClone(
                      (Object.hasOwn(tools, target) ? tools[target] : undefined) ??
                        Object.fromEntries(
                          Object.entries(choice?.flow?.fields ?? {})
                            .filter(([, field]) => field.input)
                            .map(([name, field]) => [
                              name,
                              defaultOperand(field.initial === undefined ? "" : field.initial),
                            ]),
                        ),
                    ),
                  });
                }}
              />
            </section>
            <section className="dialog-section">
              <section className="parameter-map" aria-label={tr("调用参数")}>
                <h3>{tr("调用参数")}</h3>
                {callNames?.map((name) => (
                  <div className="parameter-row" key={name}>
                    <span className="parameter-name" title={name}>
                      {name}
                      <ValueTypeTag value={draft.inputs?.[name]} />
                    </span>
                    <AutoValueInput
                      label={name}
                      value={draft.inputs?.[name]}
                      allowUnset
                      suggest
                      onChange={(value) => {
                        const inputs = { ...draft.inputs };
                        if (value === undefined) delete inputs[name];
                        else
                          Object.defineProperty(inputs, name, {
                            value,
                            enumerable: true,
                            configurable: true,
                            writable: true,
                          });
                        patch({ inputs });
                      }}
                    />
                  </div>
                ))}
                {callNames?.length === 0 && <p className="muted">{tr("此调用无需参数")}</p>}
                {extraInputs.length > 0 && (
                  <p className="muted">
                    {tr("应用时将移除未声明的参数：{{names}}", { names: extraInputs.join(", ") })}
                  </p>
                )}
              </section>
            </section>
            <section className="dialog-section">
              <h3>{tr("输出结果")}</h3>
              {outputNames.map((name, index) => (
                <label key={name} htmlFor={`${formId}-result-${index}`}>
                  {name}
                  <VariableInput
                    id={`${formId}-result-${index}`}
                    aria-label={tr("保存输出 {{name}}", { name })}
                    suggest
                    destination
                    placeholder={tr("留空不保存")}
                    value={outputDestinations[name]}
                    onValue={(value) => {
                      const { output: _output, outputs: _outputs, ...base } = draft;
                      setDraft({
                        ...base,
                        outputs: { ...outputDestinations, [name]: value as `$${string}` },
                      });
                    }}
                  />
                </label>
              ))}
              {outputNames.length === 0 && <p className="muted">{tr("此调用没有输出变量")}</p>}
            </section>
          </>
        )}
        <section className="dialog-section dialog-description">
          <DescriptionInput
            label={tr("说明（可选）")}
            value={draft.description ?? ""}
            autosize
            minRows={2}
            maxRows={5}
            onChange={(e) => patch({ description: e.currentTarget.value })}
          />
        </section>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <Button variant="subtle" onClick={onCancel}>
          {tr("关闭")}
        </Button>
        <Button variant="filled" className="primary" type="submit">
          {tr("应用步骤")}
        </Button>
      </div>
    </form>
  );
}
