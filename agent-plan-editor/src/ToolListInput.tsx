import { MultiSelect } from "@mantine/core";
import type { JsonValue } from "agent-plan-core";
import { useContext, useState } from "react";
import { CallChoices } from "./CallChoices";
import { callTargetGroups } from "./call-tools";
import { tr } from "./i18n";
import { AutoValueInput } from "./ValueEditor";
import { VariableNames } from "./VariableInput";
import { fieldReference, normalizeReference } from "./variable-reference";

/** A whole-list variable and an explicit tool list are alternative operands. */
export function ToolListInput({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: unknown;
  onChange: (value: JsonValue | undefined) => void;
  label: string;
  placeholder?: string;
}) {
  const choices = useContext(CallChoices);
  const names = useContext(VariableNames);
  const [search, setSearch] = useState("");
  const reference =
    typeof value === "string" && value.startsWith("$") && normalizeReference(value) === value;
  const list =
    Array.isArray(value) && value.every((v) => typeof v === "string") ? (value as string[]) : [];
  const selected = reference ? [`variable:${value}`] : list.map((name) => `tool:${name}`);
  const variables = names.map(fieldReference);
  const candidate = search.startsWith("$") ? normalizeReference(search) : null;
  if (candidate && !variables.includes(candidate)) variables.push(candidate);
  if (reference && !variables.includes(value as string)) variables.push(value as string);
  const groups = callTargetGroups(choices, "")
    .map((group) => ({
      group: group.group,
      items: group.items.map((item) => ({
        value: `tool:${item.value}`,
        label: item.value,
        disabled: item.disabled,
      })),
    }))
    .filter((group) => group.items.length);
  const available = new Set(groups.flatMap((group) => group.items.map((item) => item.value)));
  const missing = list.filter((name) => !available.has(`tool:${name}`));
  if (missing.length)
    groups.push({
      group: tr("不可用"),
      items: missing.map((name) => ({ value: `tool:${name}`, label: name, disabled: true })),
    });
  if (
    value !== undefined &&
    !reference &&
    !(
      Array.isArray(value) &&
      value.every((v) => typeof v === "string") &&
      new Set(value).size === value.length
    )
  )
    return (
      <AutoValueInput
        label={label}
        value={value}
        onChange={onChange}
        allowUnset
        suggest
        validate={(next) => {
          if (
            next !== undefined &&
            !(Array.isArray(next) && next.every((v) => typeof v === "string")) &&
            !(typeof next === "string" && next.startsWith("$") && normalizeReference(next) === next)
          )
            throw Error(tr("请选择工具列表或变量引用"));
        }}
      />
    );
  return (
    <MultiSelect
      aria-label={label}
      searchable
      clearable
      hidePickedOptions
      searchValue={search}
      onSearchChange={setSearch}
      value={selected}
      placeholder={
        Array.isArray(value) && value.length === 0
          ? tr("空列表")
          : (placeholder ?? tr("搜索工具或输入 $ 选择变量"))
      }
      data={[
        {
          group: tr("变量引用"),
          items: variables.map((name) => ({ value: `variable:${name}`, label: name })),
        },
        ...groups,
      ]}
      nothingFoundMessage={tr("没有匹配的调用目标")}
      comboboxProps={{ withinPortal: true, zIndex: 450 }}
      onChange={(next) => {
        const added = next.find((item) => !selected.includes(item));
        if (added?.startsWith("variable:")) onChange(added.slice(9));
        else {
          const tools = next
            .filter((item) => item.startsWith("tool:"))
            .map((item) => item.slice(5));
          onChange(tools.length ? tools : undefined);
        }
        setSearch("");
      }}
    />
  );
}
