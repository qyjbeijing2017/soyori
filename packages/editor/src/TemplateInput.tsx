import { Badge, Combobox, Textarea, type TextareaProps, useCombobox } from "@mantine/core";
import { useContext, useRef, useState } from "react";
import { tr } from "./i18n";
import { templateCompletion } from "./template-completion";
import { VariableNames } from "./VariableInput";
import { fieldReference, normalizeReference } from "./variable-reference";

export function TemplateInput({
  value,
  onValue,
  ...props
}: Omit<TextareaProps, "value" | "onChange"> & { value: string; onValue: (text: string) => void }) {
  const names = useContext(VariableNames);
  const input = useRef<HTMLTextAreaElement>(null);
  const [cursor, setCursor] = useState(0);
  const [composing, setComposing] = useState(false);
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const token = templateCompletion(value, cursor);
  const matches = token
    ? names.filter((name) => name.toLocaleLowerCase().includes(token.query.toLocaleLowerCase()))
    : [];
  const candidate = token?.query ? normalizeReference(`$${token.query}`) : null;
  const create = matches.length === 0 ? candidate : null;
  const visible = !composing && token !== null && (matches.length > 0 || Boolean(create));
  function sync(element: HTMLTextAreaElement) {
    setCursor(element.selectionStart);
    combobox.resetSelectedOption();
    if (element.selectionStart === element.selectionEnd) combobox.openDropdown();
    else combobox.closeDropdown();
  }
  function choose(reference: string) {
    if (!token) return;
    const next = `${value.slice(0, token.start)}${reference}$${value.slice(token.end)}`;
    const position = token.start + reference.length + 1;
    onValue(next);
    setCursor(position);
    combobox.closeDropdown();
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(position, position);
      combobox.closeDropdown();
    });
  }
  return (
    <Combobox store={combobox} withinPortal zIndex={450} onOptionSubmit={choose}>
      <Combobox.Target withKeyboardNavigation={visible} withAriaAttributes={visible}>
        <Textarea
          {...props}
          ref={input}
          value={value}
          onChange={(event) => {
            onValue(event.currentTarget.value);
            sync(event.currentTarget);
          }}
          onSelect={(event) => sync(event.currentTarget)}
          onBlur={() => combobox.closeDropdown()}
          onCompositionStart={() => {
            setComposing(true);
            combobox.closeDropdown();
          }}
          onCompositionEnd={(event) => {
            setComposing(false);
            sync(event.currentTarget);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) event.stopPropagation();
          }}
        />
      </Combobox.Target>
      <Combobox.Dropdown hidden={!visible}>
        <Combobox.Options style={{ maxHeight: 220, overflowY: "auto" }}>
          {matches.map((name) => (
            <Combobox.Option key={name} value={fieldReference(name)}>
              {fieldReference(name)}$
            </Combobox.Option>
          ))}
          {create && (
            <Combobox.Option value={create} aria-label={tr("新增字段 {{name}}", { name: create })}>
              <span style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>{create}$</span>
                <Badge size="xs" variant="light">
                  {tr("新增")}
                </Badge>
              </span>
            </Combobox.Option>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
