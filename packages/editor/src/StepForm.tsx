import { Badge, Button, Checkbox, Group, Select, Text, TextInput } from "@mantine/core";
import { useContext, useEffect, useId, useState } from "react";
import type { JsonValue, Step } from "soyori-core";
import { fieldDefinitions } from "soyori-core";
import { CallChoices } from "./CallChoices";
import { CodeEditor } from "./CodeEditor";
import {
  callOutputDestinations,
  callOutputNames,
  callParameterEntries,
  callParameterNames,
  callParameterPlaceholder,
  callTargetGroups,
  restrictCallInputs,
  toolDefinitions,
  tools,
} from "./call-tools";
import { DescriptionInput } from "./DescriptionInput";
import { tr } from "./i18n";
import { defaultOperand } from "./library-calls";
import { ParameterFields } from "./ParameterFields";
import { StepIcon } from "./StepIcon";
import { newStep, stepCategory, stepNames, stepSummary } from "./step-model";
import { TemplateInput } from "./TemplateInput";
import { ToolListInput } from "./ToolListInput";
import { AutoValueInput, ValueEditor, ValueTypeTag } from "./ValueEditor";
import { VariableInput } from "./VariableInput";

export function StepForm({
  step,
  onSave,
  onCancel,
  onSummaryChange,
}: {
  step: Step;
  onSave: (step: Step) => void | Promise<void>;
  onCancel: () => void;
  onSummaryChange?: (summary: string) => void;
}) {
  const choices = useContext(CallChoices);
  const formId = useId();
  const [draft, setDraft] = useState<Step>(() => structuredClone(step));
  useEffect(() => {
    onSummaryChange?.(stepSummary(draft));
  }, [draft, onSummaryChange]);
  const [error, setError] = useState("");
  const callNames =
    draft.type === "call"
      ? callParameterNames(draft.target, choices.find((c) => c.alias === draft.target)?.flow)
      : null;
  const callFlow =
    draft.type === "call" ? choices.find((c) => c.alias === draft.target)?.flow : undefined;
  const outputNames =
    draft.type === "call"
      ? callOutputNames(draft.target, choices.find((c) => c.alias === draft.target)?.flow)
      : [];
  const outputDestinations =
    draft.type === "call" ? callOutputDestinations(draft, outputNames) : {};
  const wholeReturn = draft.type === "call" && Boolean(toolDefinitions[draft.target]?.returns);
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
        emptyStringAsBlank={
          property === "value" && (draft.type === "set" || draft.type === "append")
        }
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
            await onSave(
              wholeReturn
                ? output
                  ? { ...base, output }
                  : base
                : Object.keys(mapped).length
                  ? { ...base, outputs: mapped }
                  : base,
            );
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
        {draft.type === "group" && (
          <section className="dialog-section">
            <TextInput
              label={tr("分组名称")}
              required
              value={draft.name}
              onChange={(e) => patch({ name: e.currentTarget.value })}
            />
            <Checkbox
              label={tr("默认折叠")}
              checked={draft.collapsed ?? false}
              onChange={(e) => patch({ collapsed: e.currentTarget.checked })}
            />
            <p className="muted">{tr("分组不创建变量作用域，内部步骤按顺序执行。")}</p>
          </section>
        )}
        {draft.type !== "call" && draft.type !== "group" && (
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
                data={callTargetGroups(choices, draft.target).map((group) => ({
                  ...group,
                  items: group.items.map((item) => ({ ...item, label: item.value })),
                }))}
                renderOption={({ option }) => (
                  <Group justify="space-between" wrap="nowrap" w="100%" miw={0}>
                    <Text size="sm" truncate title={option.value} style={{ minWidth: 0 }}>
                      {option.value.slice(option.value.indexOf(".") + 1)}
                      {option.disabled ? ` (${tr("不可用")})` : ""}
                    </Text>
                    {choices.some((choice) => choice.alias === option.value && choice.current) && (
                      <Badge size="sm" variant="light" style={{ flexShrink: 0 }}>
                        {tr("当前流程")}
                      </Badge>
                    )}
                  </Group>
                )}
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
                          Object.entries(fieldDefinitions(choice?.flow?.fields ?? {}))
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
            <section className="dialog-section" aria-label={tr("调用参数")}>
              <h3>{tr("调用参数")}</h3>
              <ParameterFields
                key={`${draft.target}-inputs`}
                translate={Object.hasOwn(tools, draft.target)}
                entries={callParameterEntries(draft.target, "inputs", callFlow)}
                renderField={({ name, required, valueType }) => {
                  const Input =
                    draft.target === "script.run" && name === "code"
                      ? ScriptCodeInput
                      : name === "tools" &&
                          [
                            "llm.auto",
                            "llm.local",
                            "llm.openai",
                            "llm.anthropic",
                            "tools.execute",
                          ].includes(draft.target)
                        ? ToolListInput
                        : AutoValueInput;
                  return (
                    <div className="parameter-row" key={name}>
                      <span className="parameter-name" title={name}>
                        <span title={valueType}>
                          {name}
                          {required && <span className="required-marker"> *</span>}
                        </span>
                        <ValueTypeTag value={draft.inputs?.[name]} />
                      </span>
                      <Input
                        label={name}
                        value={draft.inputs?.[name]}
                        placeholder={callParameterPlaceholder(draft.target, name, callFlow)}
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
                  );
                }}
              />
              {callNames?.length === 0 && <p className="muted">{tr("此调用无需参数")}</p>}
              {extraInputs.length > 0 && (
                <p className="muted">
                  {tr("应用时将移除未声明的参数：{{names}}", { names: extraInputs.join(", ") })}
                </p>
              )}
            </section>
            <section className="dialog-section">
              <h3>{tr("输出结果")}</h3>
              <ParameterFields
                key={`${draft.target}-outputs`}
                translate={Object.hasOwn(tools, draft.target)}
                entries={callParameterEntries(draft.target, "outputs", callFlow)}
                renderField={({ name }) => (
                  <label
                    className="parameter-output"
                    key={name}
                    htmlFor={`${formId}-result-${name}`}
                  >
                    {name}
                    <VariableInput
                      id={`${formId}-result-${name}`}
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
                )}
              />
              {wholeReturn && destination("output", draft.output ?? "", tr("保存返回值"))}
              {!wholeReturn && outputNames.length === 0 && (
                <p className="muted">{tr("此调用没有输出变量")}</p>
              )}
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

function ScriptCodeInput({
  value,
  onChange,
  label,
}: {
  value: unknown;
  onChange: (value: JsonValue | undefined) => void;
  label: string;
}) {
  return (
    <CodeEditor
      script
      label={label}
      value={typeof value === "string" ? value : ""}
      onChange={(value) => onChange(value || undefined)}
    />
  );
}
