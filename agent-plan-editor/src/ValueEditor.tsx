import { Badge, TextInput } from "@mantine/core";
import type { JsonValue } from "agent-plan-core";
import { useEffect, useRef, useState } from "react";
import { tr } from "./i18n";
import { formatValue, inferValue, valueKind } from "./parameter-value";
import { IconButton } from "./ui";
import { VariableInput } from "./VariableInput";

const typeColors: Record<string, string> = {
  文本: "blue",
  数字: "teal",
  布尔值: "orange",
  列表: "violet",
  对象: "indigo",
  变量引用: "grape",
  空值: "gray",
  未设置: "gray",
};

export function ValueTypeTag({ value, literal = false }: { value: unknown; literal?: boolean }) {
  const kind = valueKind(value, literal);
  return (
    <Badge className="value-type-tag" size="xs" variant="light" color={typeColors[kind]}>
      {tr(kind)}
    </Badge>
  );
}

export function AutoValueInput({
  value,
  onChange,
  label,
  allowUnset = false,
  disabled = false,
  validate,
  suggest = false,
  placeholder,
  emptyStringAsBlank = false,
}: {
  value: unknown;
  onChange: (value: JsonValue | undefined) => void;
  label: string;
  placeholder?: string;
  emptyStringAsBlank?: boolean;
  suggest?: boolean;
  allowUnset?: boolean;
  disabled?: boolean;
  validate?: (value: JsonValue | undefined) => void;
}) {
  let formatted = "";
  let unsupported = false;
  try {
    formatted = emptyStringAsBlank && value === "" ? "" : formatValue(value);
  } catch {
    unsupported = true;
    formatted = tr("此值不是 JSON 数据，请在工具中处理");
  }
  const [text, setText] = useState(formatted);
  const [error, setError] = useState("");
  const lastSent = useRef(formatted);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (formatted !== lastSent.current) {
      setText(formatted);
      lastSent.current = formatted;
      setError("");
      input.current?.setCustomValidity("");
    }
  }, [formatted]);
  return (
    <div className="auto-value">
      <VariableInput
        suggest={suggest}
        onValue={(source) => {
          setText(source);
          const next = inferValue(source, allowUnset);
          validate?.(next);
          onChange(next);
          lastSent.current = emptyStringAsBlank && next === "" ? "" : formatValue(next);
          setError("");
          input.current?.setCustomValidity("");
        }}
        ref={input}
        aria-label={label}
        aria-invalid={Boolean(error)}
        autosize
        minRows={1}
        maxRows={8}
        styles={{ input: { minHeight: 0, lineHeight: "22px", paddingTop: 10, paddingBottom: 10 } }}
        value={text}
        disabled={disabled || unsupported}
        placeholder={placeholder ?? (allowUnset ? tr("未设置") : tr("输入值"))}
        onChange={(e) => {
          const source = e.target.value;
          setText(source);
          try {
            const next = inferValue(source, allowUnset);
            validate?.(next);
            onChange(next);
            lastSent.current = emptyStringAsBlank && next === "" ? "" : formatValue(next);
            setError("");
            e.target.setCustomValidity("");
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : String(cause);
            setError(message);
            e.target.setCustomValidity(message);
          }
        }}
      />
      {(error || unsupported) && (
        <small className={error ? "error" : "muted"} role={error ? "alert" : undefined}>
          {error || tr("仅查看")}
        </small>
      )}
    </div>
  );
}

export function ValueEditor({
  value,
  onChange,
  label = tr("值"),
  literal = false,
  validate,
  emptyStringAsBlank = false,
}: {
  value: JsonValue;
  onChange: (value: JsonValue) => void;
  label?: string;
  literal?: boolean;
  validate?: (value: JsonValue | undefined) => void;
  emptyStringAsBlank?: boolean;
}) {
  return (
    <div className="parameter-row">
      <span className="parameter-name" title={label}>
        {label}
        <ValueTypeTag value={value} literal={literal} />
      </span>
      {literal ? (
        <VariableInput
          aria-label={label}
          value={String(value)}
          suggest
          destination
          autosize
          minRows={1}
          onChange={(event) => onChange(event.currentTarget.value)}
          onValue={onChange}
        />
      ) : (
        <AutoValueInput
          emptyStringAsBlank={emptyStringAsBlank}
          suggest={!validate}
          label={label}
          value={value}
          validate={validate}
          onChange={(next) => {
            if (next !== undefined) onChange(next);
          }}
        />
      )}
    </div>
  );
}

export function ParameterMap({
  value,
  onChange,
  label,
  literal = false,
}: {
  value: Record<string, JsonValue>;
  onChange: (value: Record<string, JsonValue>) => void;
  label: string;
  literal?: boolean;
}) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  return (
    <section className="parameter-map" aria-label={label}>
      <h3>{label}</h3>
      {Object.entries(value).map(([key, item]) => (
        <div className="parameter-with-action" key={key}>
          <ValueEditor
            label={key}
            value={item}
            literal={literal}
            onChange={(next) => onChange({ ...value, [key]: next })}
          />
          <IconButton
            icon="delete"
            label={tr("移除 {{name}}", { name: key })}
            onClick={() =>
              onChange(Object.fromEntries(Object.entries(value).filter(([name]) => name !== key)))
            }
          />
        </div>
      ))}
      <div className="parameter-add">
        <TextInput
          aria-label={tr("{{name}} 新参数名", { name: label })}
          placeholder={tr("参数名")}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <IconButton
          icon="plus"
          label={tr("添加{{name}}", { name: label })}
          onClick={() => {
            const name = newName.trim();
            if (!name || Object.hasOwn(value, name)) {
              setError(tr("参数名不能为空或重复"));
              return;
            }
            onChange({ ...value, [name]: "" });
            setNewName("");
            setError("");
          }}
        />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function ValueView({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (depth > 8) return <span className="muted">{tr("更多嵌套内容")}</span>;
  if (value === undefined) return <span className="muted">{tr("未设置")}</span>;
  if (value === null) return <span className="muted">{tr("空值")}</span>;
  if (typeof value !== "object")
    return (
      <span className="data-value">
        {typeof value === "boolean" ? (value ? tr("是") : tr("否")) : String(value)}
      </span>
    );
  const entries = Object.entries(value);
  return (
    <div className="data-tree">
      {entries.length === 0 ? (
        <span className="muted">{Array.isArray(value) ? tr("空列表") : tr("空对象")}</span>
      ) : (
        entries.map(([key, child]) => (
          <div className="data-row" key={key}>
            <span className="data-key">{Array.isArray(value) ? Number(key) + 1 : key}</span>
            <ValueView value={child} depth={depth + 1} />
          </div>
        ))
      )}
    </div>
  );
}
