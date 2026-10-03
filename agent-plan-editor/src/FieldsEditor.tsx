import { Button, Checkbox, Modal, TextInput, UnstyledButton } from "@mantine/core";
import {
  type FieldDefinition,
  type FlowDefinition,
  type JsonValue,
  parseFlow,
} from "agent-plan-core";
import { useEffect, useRef, useState } from "react";
import { ConfirmDelete } from "./ConfirmDelete";
import { DescriptionInput } from "./DescriptionInput";
import { tr } from "./i18n";
import { MarkdownText } from "./MarkdownText";
import { arrayMove, SortableList, SortableRow } from "./Sortable";
import { IconButton } from "./ui";
import { AutoValueInput, ValueTypeTag } from "./ValueEditor";

type Fields = FlowDefinition["fields"];
type Draft = { original: string | null; name: string; field: FieldDefinition };
export function FieldsEditor({
  flow,
  onSave,
  disabled,
  values,
  debugging,
  finished,
  onValueChange,
  onPending,
}: {
  flow: FlowDefinition;
  onSave: (fields: Fields) => Promise<void>;
  disabled: boolean;
  values?: Readonly<Record<string, unknown>>;
  debugging: boolean;
  finished: boolean;
  onValueChange: (name: string, value: JsonValue | undefined) => void;
  onPending: (value: boolean) => void;
}) {
  const fields = flow.fields;
  const paused = debugging && !finished;
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const latest = useRef(fields);
  const modalContent = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraft = useRef<Draft | null>(null);
  const draftJob = useRef<Promise<void>>(Promise.resolve());
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  latest.current = fields;
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function save(next: Fields) {
    parseFlow({ ...flow, fields: next });
    setError("");
    latest.current = next;
    try {
      await saveRef.current(next);
    } catch (cause) {
      setError(String(cause));
      throw cause;
    }
  }
  async function applyDraft(draft: Draft) {
    const name = draft.name.trim();
    if (!name || (name !== draft.original && Object.hasOwn(latest.current, name)))
      throw Error(tr("变量名不能为空或重复。"));
    const entries = Object.entries(latest.current);
    const next = Object.fromEntries(
      draft.original === null
        ? [...entries, [name, draft.field]]
        : entries.map(([key, value]) =>
            key === draft.original ? [name, draft.field] : [key, value],
          ),
    );
    await save(next);
    if (pendingDraft.current?.original === draft.original)
      pendingDraft.current = { ...pendingDraft.current, original: name };
    setEditing((current) =>
      current?.original === draft.original ? { ...current, original: name } : current,
    );
  }
  function edit(draft: Draft) {
    setEditing(draft);
    pendingDraft.current = draft;
    setError("");
    if (timer.current) clearTimeout(timer.current);
    onPending(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      draftJob.current = draftJob.current
        .catch(() => {})
        .then(() => applyDraft(pendingDraft.current ?? draft))
        .catch((cause) => setError(String(cause)))
        .finally(() => onPending(false));
    }, 500);
  }
  async function close() {
    const invalid = Array.from(modalContent.current?.querySelectorAll("textarea,input") ?? []).find(
      (element) => !(element as HTMLInputElement).checkValidity(),
    ) as HTMLInputElement | undefined;
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    try {
      await draftJob.current;
      const draft = pendingDraft.current;
      if (draft && (draft.name.trim() || draft.original)) await applyDraft(draft);
      setEditing(null);
      pendingDraft.current = null;
      setError("");
    } catch (cause) {
      setError(String(cause));
    } finally {
      onPending(false);
    }
  }
  const names = Object.keys(fields);
  return (
    <section className="variables-form" aria-label={tr("变量")}>
      {deleting !== null && (
        <ConfirmDelete
          title={tr("删除变量")}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            if (disabled || paused) return;
            const next = Object.fromEntries(
              Object.entries(latest.current).filter(([name]) => name !== deleting),
            );
            if (Object.hasOwn(parseFlow({ ...flow, fields: next }).fields, deleting))
              throw Error(tr("此变量仍被步骤引用，请先移除引用再删除。"));
            await save(next);
            if (editing?.original === deleting) {
              setEditing(null);
              pendingDraft.current = null;
            }
          }}
        />
      )}
      <SortableList
        ids={names}
        onMove={(from, to) => {
          if (!disabled && !paused)
            void save(Object.fromEntries(arrayMove(Object.entries(fields), from, to))).catch(
              () => {},
            );
        }}
      >
        {names.map((name) => {
          const field = fields[name],
            value = values?.[name];
          return (
            <SortableRow key={name} id={name} label={name} disabled={disabled || paused}>
              {(handle) => (
                <div className="variable-entry">
                  {handle}
                  <div className="variable-line">
                    <div className="parameter-row">
                      <UnstyledButton
                        className="parameter-name variable-label"
                        title={field.description || name}
                        aria-label={tr("设置变量 {{name}}", { name })}
                        disabled={disabled || paused}
                        onClick={() => {
                          setError("");
                          setEditing({ original: name, name, field: structuredClone(field) });
                          pendingDraft.current = null;
                        }}
                      >
                        {name}
                        <ValueTypeTag value={value} literal />
                        {(field.input || field.output) && (
                          <small>
                            {[field.input && tr("输入"), field.output && tr("输出")]
                              .filter(Boolean)
                              .join(" / ")}
                          </small>
                        )}
                      </UnstyledButton>
                      <AutoValueInput
                        label={name}
                        value={value}
                        allowUnset
                        disabled={disabled}
                        onChange={(value) => onValueChange(name, value)}
                      />
                    </div>
                    <IconButton
                      icon="delete"
                      label={tr("删除变量 {{name}}", { name })}
                      disabled={disabled || paused}
                      onClick={() => setDeleting(name)}
                    />
                  </div>
                  {field.description && (
                    <MarkdownText
                      className="editor-description variable-description"
                      source={field.description}
                    />
                  )}
                </div>
              )}
            </SortableRow>
          );
        })}
      </SortableList>
      {debugging &&
        Object.entries(values ?? {})
          .filter(([name]) => !Object.hasOwn(fields, name))
          .map(([name, value]) => (
            <div className="parameter-row" key={name}>
              <span className="parameter-name">
                {name}
                <ValueTypeTag value={value} literal />
              </span>
              <AutoValueInput label={name} value={value} disabled onChange={() => {}} />
            </div>
          ))}
      {!paused && (
        <Button
          className="add-step"
          fullWidth
          disabled={disabled}
          onClick={() => {
            setError("");
            setEditing({ original: null, name: "", field: {} });
            pendingDraft.current = null;
          }}
        >
          {tr("＋ 添加变量")}
        </Button>
      )}
      {!editing && error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Modal
        opened={Boolean(editing)}
        onClose={() => void close()}
        title={tr(editing?.original ? "编辑变量" : "添加变量")}
        size="lg"
        closeButtonProps={{ "aria-label": tr("关闭") }}
      >
        {editing && (
          <div className="variable-modal dialog-form" ref={modalContent}>
            <section className="dialog-section dialog-identity">
              <TextInput
                label={tr("名称")}
                value={editing.name}
                onChange={(e) => edit({ ...editing, name: e.target.value })}
              />
            </section>
            <section className="dialog-section">
              <h3>{tr("变量用途")}</h3>
              <div className="check-row">
                <Checkbox
                  label={tr("输入")}
                  checked={editing.field.input ?? false}
                  onChange={(e) =>
                    edit({ ...editing, field: { ...editing.field, input: e.target.checked } })
                  }
                />
                <Checkbox
                  label={tr("输出")}
                  checked={editing.field.output ?? false}
                  onChange={(e) =>
                    edit({ ...editing, field: { ...editing.field, output: e.target.checked } })
                  }
                />
              </div>
            </section>
            <section className="dialog-section">
              <div className="parameter-row">
                <span className="parameter-name">{tr("默认值")}</span>
                <AutoValueInput
                  label={tr("默认值")}
                  value={editing.field.initial}
                  allowUnset
                  onChange={(value) => {
                    const { initial: _initial, ...rest } = editing.field;
                    edit({
                      ...editing,
                      field: value === undefined ? rest : { ...rest, initial: value },
                    });
                  }}
                />
              </div>
            </section>
            <section className="dialog-section dialog-description">
              <DescriptionInput
                label={tr("说明（可选）")}
                autosize
                minRows={2}
                maxRows={5}
                value={editing.field.description ?? ""}
                onChange={(e) =>
                  edit({ ...editing, field: { ...editing.field, description: e.target.value } })
                }
              />
            </section>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <Button onClick={() => void close()}>{tr("完成")}</Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
