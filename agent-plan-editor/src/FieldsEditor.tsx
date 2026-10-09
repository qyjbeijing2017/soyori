import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button, Checkbox, Modal, Select, TextInput, UnstyledButton } from "@mantine/core";
import {
  type FieldDefinition,
  type FieldEntry,
  type FieldGroup,
  type FlowDefinition,
  fieldDefinitions,
  fieldEntries,
  type JsonValue,
  parseFlow,
} from "agent-plan-core";
import { useEffect, useRef, useState } from "react";
import { ConfirmDelete } from "./ConfirmDelete";
import { DescriptionInput } from "./DescriptionInput";
import { FieldDrag, FieldDrop } from "./FieldDrag";
import { changeFieldList, fieldLocation, moveFieldEntry, putField } from "./field-layout";
import { GroupBlock } from "./GroupBlock";
import { tr } from "./i18n";
import { MarkdownText } from "./MarkdownText";
import { SortableRow } from "./Sortable";
import { IconButton } from "./ui";
import { AutoValueInput, ValueTypeTag } from "./ValueEditor";

type Fields = FlowDefinition["fields"];
type Draft = { original: string | null; name: string; field: FieldDefinition; group?: number[] };
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
  const fields = fieldDefinitions(flow.fields);
  const [groupEditing, setGroupEditing] = useState<{
    path: number[];
    index: number | null;
    draft: FieldGroup;
  } | null>(null);
  const paused = debugging && !finished;
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const latest = useRef(flow.fields);
  const modalContent = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraft = useRef<Draft | null>(null);
  const draftJob = useRef<Promise<void>>(Promise.resolve());
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  latest.current = flow.fields;
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
    if (!name || (name !== draft.original && Object.hasOwn(fieldDefinitions(latest.current), name)))
      throw Error(tr("变量名不能为空或重复。"));
    const next = putField(
      latest.current,
      draft.original,
      { ...draft.field, name },
      draft.group ?? fieldLocation(latest.current, draft.original ?? "")?.path ?? [],
    );
    await save(next);
    if (pendingDraft.current?.original === draft.original)
      pendingDraft.current = {
        ...pendingDraft.current,
        original: name,
        group: fieldLocation(next, name)?.path,
      };
    setEditing((current) =>
      current?.original === draft.original
        ? { ...current, original: name, group: fieldLocation(next, name)?.path }
        : current,
    );
  }
  function edit(draft: Draft) {
    setEditing(draft);
    pendingDraft.current = draft;
    setError("");
    if (timer.current) clearTimeout(timer.current);
    if (draft.original === null) return;
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
  const adding = Boolean(editing && editing.original === null) || groupEditing?.index === null;
  function typeSelector() {
    if (!adding) return null;
    return (
      <section className="dialog-section dialog-identity">
        <Select
          label={tr("变量类型")}
          value={groupEditing ? "group" : "field"}
          allowDeselect={false}
          data={[
            { value: "field", label: tr("变量") },
            { value: "group", label: tr("变量分组") },
          ]}
          onChange={(value) => {
            setError("");
            if (value === "group" && editing) {
              setGroupEditing({
                path: editing.group ?? [],
                index: null,
                draft: {
                  type: "group",
                  name: editing.name,
                  ...(editing.field.description === undefined
                    ? {}
                    : { description: editing.field.description }),
                  fields: [],
                  collapsed: false,
                },
              });
              setEditing(null);
              pendingDraft.current = null;
            } else if (value === "field" && groupEditing) {
              const draft: Draft = {
                original: null,
                name: groupEditing.draft.name,
                field:
                  groupEditing.draft.description === undefined
                    ? {}
                    : { description: groupEditing.draft.description },
                group: groupEditing.path,
              };
              setEditing(draft);
              pendingDraft.current = draft;
              setGroupEditing(null);
            }
          }}
        />
      </section>
    );
  }
  function renderList(entries: FieldEntry[], path: number[] = []) {
    return (
      <>
        <SortableContext
          items={entries.map((_, index) => JSON.stringify([...path, index]))}
          strategy={verticalListSortingStrategy}
        >
          {entries.map((entry, index) => {
            const id = JSON.stringify([...path, index]);
            if (entry.type === "group")
              return (
                <SortableRow
                  previewOrder={false}
                  key={id}
                  id={id}
                  label={entry.name}
                  intoPath={[...path, index]}
                  disabled={disabled || paused}
                >
                  {(handle) => (
                    <div className="variable-group-row">
                      {handle}
                      <FieldDrop path={[...path, index]} disabled={disabled || paused}>
                        {(ref, over) => (
                          <GroupBlock
                            dropRef={ref}
                            dropActive={over}
                            active={over}
                            onEdit={() =>
                              setGroupEditing({ path, index, draft: structuredClone(entry) })
                            }
                            editDisabled={disabled || paused}
                            name={entry.name}
                            description={entry.description}
                            collapsed={entry.collapsed}
                            count={Object.keys(fieldDefinitions(entry.fields)).length}
                            actions={
                              <IconButton
                                icon="ungroup"
                                label={tr("解散分组（保留内容）")}
                                disabled={disabled || paused}
                                onClick={() =>
                                  void save(
                                    changeFieldList(latest.current, path, (items) =>
                                      items.flatMap((item, i) =>
                                        i === index && item.type === "group" ? item.fields : [item],
                                      ),
                                    ),
                                  ).catch(() => {})
                                }
                              />
                            }
                          >
                            {renderList(entry.fields, [...path, index])}
                          </GroupBlock>
                        )}
                      </FieldDrop>
                    </div>
                  )}
                </SortableRow>
              );
            const name = entry.name;
            const field = fields[name],
              value = values?.[name];
            return (
              <SortableRow
                previewOrder={false}
                key={name}
                id={id}
                label={name}
                disabled={disabled || paused}
              >
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
                            setEditing({
                              original: name,
                              name,
                              field: structuredClone(field),
                              group: path,
                            });
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
        </SortableContext>
        {!paused && (
          <FieldDrop
            path={path}
            disabled={disabled}
            action={
              <Button
                className="add-step"
                fullWidth
                disabled={disabled}
                onClick={() => {
                  setError("");
                  setEditing({ original: null, name: "", field: {}, group: path });
                  pendingDraft.current = null;
                }}
              >
                {tr("＋ 添加变量")}
              </Button>
            }
          />
        )}
      </>
    );
  }

  return (
    <section className="variables-form" aria-label={tr("变量")}>
      {deleting !== null && (
        <ConfirmDelete
          title={tr("删除变量")}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            if (disabled || paused) return;
            const location = fieldLocation(latest.current, deleting)!;
            const next = changeFieldList(latest.current, location.path, (items) =>
              items.filter((_, index) => index !== location.index),
            );
            if (
              Object.hasOwn(fieldDefinitions(parseFlow({ ...flow, fields: next }).fields), deleting)
            )
              throw Error(tr("此变量仍被步骤引用，请先移除引用再删除。"));
            await save(next);
            if (editing?.original === deleting) {
              setEditing(null);
              pendingDraft.current = null;
            }
          }}
        />
      )}
      <FieldDrag
        disabled={disabled || paused}
        onMove={(from, parent, index) => {
          void save(
            moveFieldEntry(latest.current, from as number[], parent as number[], index),
          ).catch(() => {});
        }}
      >
        {renderList(fieldEntries(flow.fields))}
      </FieldDrag>
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
      <Modal
        opened={Boolean(groupEditing || editing)}
        onClose={() => {
          if (editing) void close();
          else {
            setGroupEditing(null);
            setError("");
          }
        }}
        title={tr(adding ? "添加变量" : groupEditing ? "编辑分组" : "编辑变量")}
        size="lg"
        closeButtonProps={{ "aria-label": tr("关闭") }}
      >
        {groupEditing && (
          <form
            className="dialog-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await save(
                  changeFieldList(latest.current, groupEditing.path, (items) =>
                    groupEditing.index === null
                      ? [...items, groupEditing.draft]
                      : items.map((item, i) =>
                          i === groupEditing.index ? groupEditing.draft : item,
                        ),
                  ),
                );
                setGroupEditing(null);
              } catch (cause) {
                setError(String(cause));
              }
            }}
          >
            {typeSelector()}
            <section className="dialog-section dialog-identity">
              <TextInput
                label={tr("分组名称")}
                required
                value={groupEditing.draft.name}
                onChange={(e) =>
                  setGroupEditing({
                    ...groupEditing,
                    draft: { ...groupEditing.draft, name: e.currentTarget.value },
                  })
                }
              />
            </section>
            <section className="dialog-section dialog-description">
              <DescriptionInput
                label={tr("说明（可选）")}
                value={groupEditing.draft.description ?? ""}
                onChange={(e) =>
                  setGroupEditing({
                    ...groupEditing,
                    draft: { ...groupEditing.draft, description: e.currentTarget.value },
                  })
                }
              />
            </section>
            <section className="dialog-section">
              <Checkbox
                label={tr("默认折叠")}
                checked={groupEditing.draft.collapsed ?? false}
                onChange={(e) =>
                  setGroupEditing({
                    ...groupEditing,
                    draft: { ...groupEditing.draft, collapsed: e.currentTarget.checked },
                  })
                }
              />
            </section>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <Button variant="subtle" onClick={() => setGroupEditing(null)}>
                {tr("关闭")}
              </Button>
              <Button type="submit">{tr("保存分组")}</Button>
            </div>
          </form>
        )}
        {editing && (
          <div className="variable-modal dialog-form" ref={modalContent}>
            {typeSelector()}
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
      {!editing && !groupEditing && error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
