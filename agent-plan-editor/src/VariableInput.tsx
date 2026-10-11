import {
  Badge,
  Combobox,
  Textarea,
  type TextareaProps,
  TextInput,
  useCombobox,
} from "@mantine/core";
import { useMergedRef } from "@mantine/hooks";
import { createContext, forwardRef, useContext, useEffect, useRef, useState } from "react";
import { tr } from "./i18n";
import { fieldReference, normalizeReference, variableQuery } from "./variable-reference";

export const VariableNames = createContext<string[]>([]);

export const VariableInput = forwardRef<
  HTMLTextAreaElement,
  TextareaProps & {
    suggest?: boolean;
    destination?: boolean;
    onValue: (value: string) => void;
  }
>(function VariableInput(
  {
    suggest = false,
    destination = false,
    onValue,
    onChange,
    onFocus,
    onBlur,
    value,
    onCompositionStart,
    onCompositionEnd,
    ...props
  },
  ref,
) {
  const names = useContext(VariableNames);
  const [draftText, setDraftText] = useState(String(value ?? props.defaultValue ?? ""));
  const composingRef = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const destinationInput = useRef<HTMLInputElement>(null);
  const mergedRef = useMergedRef(ref, input);
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const text = String(value ?? draftText);
  const error = destination && normalizeReference(text) === null ? tr("输入的变量名不合法") : "";
  useEffect(() => {
    if (destination) destinationInput.current?.setCustomValidity(error);
  }, [destination, error]);
  const query = variableQuery(text);
  const matches =
    query === null
      ? []
      : names.filter((name) => name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const candidate = query ? normalizeReference(text) : null;
  const create = matches.length === 0 && candidate;
  const visible =
    !composingRef.current && suggest && query !== null && (matches.length > 0 || Boolean(create));
  function updateDropdown(source: string) {
    const nextQuery = variableQuery(source);
    const hasOptions =
      nextQuery !== null &&
      (names.some((name) => name.toLocaleLowerCase().includes(nextQuery.toLocaleLowerCase())) ||
        Boolean(nextQuery && normalizeReference(source)));
    if (suggest && !composingRef.current && hasOptions) {
      combobox.resetSelectedOption();
      combobox.openDropdown();
    } else if (combobox.dropdownOpened) {
      combobox.closeDropdown();
    }
  }
  function choose(next: string) {
    onValue(next);
    combobox.closeDropdown();
  }
  return (
    <Combobox store={combobox} withinPortal zIndex={450} onOptionSubmit={choose}>
      <Combobox.Target withKeyboardNavigation={visible} withAriaAttributes={visible}>
        {destination ? (
          <TextInput
            ref={destinationInput}
            id={props.id}
            aria-label={props["aria-label"]}
            required={props.required}
            disabled={props.disabled}
            placeholder={props.placeholder}
            value={text.startsWith("$") ? text.slice(1) : text}
            leftSection={<span aria-hidden="true">$</span>}
            leftSectionWidth={28}
            leftSectionPointerEvents="none"
            error={error || props.error}
            onFocus={() => updateDropdown(text)}
            onBlur={() => combobox.closeDropdown()}
            onChange={(event) => {
              const source = event.currentTarget.value;
              onValue(source ? (source.startsWith("$") ? source : `$${source}`) : "");
              updateDropdown(source ? (source.startsWith("$") ? source : `$${source}`) : "");
            }}
          />
        ) : (
          <Textarea
            {...props}
            ref={mergedRef}
            value={value}
            leftSection={props.leftSection}
            leftSectionWidth={props.leftSectionWidth}
            leftSectionPointerEvents={props.leftSectionPointerEvents}
            error={error || props.error}
            onFocus={(event) => {
              onFocus?.(event);
              updateDropdown(event.currentTarget.value);
            }}
            onCompositionStart={(event) => {
              composingRef.current = true;
              if (combobox.dropdownOpened) combobox.closeDropdown();
              onCompositionStart?.(event);
            }}
            onCompositionEnd={(event) => {
              composingRef.current = false;
              onCompositionEnd?.(event);
            }}
            onChange={(event) => {
              if (value === undefined) setDraftText(event.currentTarget.value);
              onChange?.(event);
              if (
                composingRef.current ||
                ("isComposing" in event.nativeEvent && event.nativeEvent.isComposing)
              )
                return;
              updateDropdown(event.currentTarget.value);
            }}
            onBlur={(event) => {
              combobox.closeDropdown();
              onBlur?.(event);
            }}
          />
        )}
      </Combobox.Target>
      <Combobox.Dropdown hidden={!visible}>
        <Combobox.Options style={{ maxHeight: 220, overflowY: "auto" }}>
          {matches.map((name) => (
            <Combobox.Option key={name} value={fieldReference(name)}>
              {fieldReference(name)}
            </Combobox.Option>
          ))}
          {create && (
            <Combobox.Option value={create} aria-label={tr("新增变量 {{name}}", { name: create })}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span style={{ overflowWrap: "anywhere", minWidth: 0 }}>{create}</span>
                <Badge size="xs" variant="light" style={{ flexShrink: 0 }}>
                  {tr("新增")}
                </Badge>
              </span>
            </Combobox.Option>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
});
