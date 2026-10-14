import { Button, Checkbox, Modal, Stack, TextInput, UnstyledButton } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import {
  type Environment,
  type EnvironmentValue,
  loadEnvironment,
  readEnvironment,
  validateEnvironmentName,
} from "soyori-storage/environment";
import { ConfirmDelete } from "./ConfirmDelete";
import {
  environmentStorage,
  flushEnvironmentWrites,
  persistEnvironment,
} from "./environment-store";
import { tr } from "./i18n";
import { TimedPasswordInput } from "./TimedPasswordInput";
import { IconButton } from "./ui";

type Draft = { original: string | null; name: string; entry: EnvironmentValue };
export function EnvironmentEditor({
  threadId,
  fileId,
  disabled = false,
  draftValues,
  onSaveDraft,
}: {
  threadId?: string;
  fileId?: string;
  disabled?: boolean;
  draftValues?: Environment;
  onSaveDraft?: (values: Environment) => void;
}) {
  const [values, setValues] = useState<Environment | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const revision = useRef(0);
  const draftRef = useRef(draftValues);
  draftRef.current = draftValues;
  useEffect(() => {
    let active = true;
    setValues(null);
    setError("");
    setEditing(null);
    setDeleting(null);
    if (draftRef.current !== undefined) {
      setValues(draftRef.current);
      return;
    }
    const reload = () =>
      void flushEnvironmentWrites()
        .catch(() => {})
        .then(() => loadEnvironment(environmentStorage, threadId, fileId))
        .then((v) => {
          if (active) setValues(v);
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    reload();
    globalThis.addEventListener("agent-plan-environment-changed", reload);
    return () => {
      active = false;
      globalThis.removeEventListener("agent-plan-environment-changed", reload);
    };
  }, [threadId, fileId]);
  const locked = disabled;
  function change(next: Environment) {
    try {
      readEnvironment(next);
    } catch (cause) {
      setError(String(cause));
      return;
    }
    setValues(next);
    setNotice("");
    setError("");
    if (onSaveDraft) {
      onSaveDraft(next);
      setNotice(tr("环境已自动保存，下次运行生效。"));
      return;
    }
    const current = ++revision.current;
    setSaving(true);
    void persistEnvironment(next, threadId, fileId)
      .then(() => {
        if (revision.current === current) setNotice(tr("环境已自动保存，下次运行生效。"));
      })
      .catch((cause) => {
        if (revision.current === current) setError(String(cause));
      })
      .finally(() => {
        if (revision.current === current) setSaving(false);
      });
  }
  return (
    <Stack className="environment-editor" gap="md">
      <p className="environment-description">
        {tr(
          fileId
            ? "此环境仅用于当前文件的编辑器运行测试；未设置的环境变量使用全局值。"
            : threadId || draftValues !== undefined
              ? "当前对话优先使用这里的值；未设置的环境变量使用全局值。"
              : "全局环境作为所有对话和编辑器运行的默认值。",
        )}
      </p>
      <p className="environment-description muted">
        {tr("环境值保存在本机浏览器，不随流程导出；敏感标记仅遮挡显示，不加密，也不限制工具读取。")}
      </p>
      <div className="environment-variables variables-form">
        {values &&
          Object.entries(values).map(([name, entry]) => (
            <div className="variable-entry" key={name}>
              <div className="variable-line">
                <div className="parameter-row">
                  <UnstyledButton
                    className="parameter-name variable-label"
                    aria-label={tr("设置环境变量 {{name}}", { name })}
                    disabled={locked}
                    onClick={() => {
                      setEditing({ original: name, name, entry: { ...entry } });
                      setError("");
                    }}
                  >
                    {name}
                    <small>{tr(entry.sensitive ? "敏感值" : "文本")}</small>
                  </UnstyledButton>
                  {entry.sensitive ? (
                    <TimedPasswordInput
                      aria-label={name}
                      value={entry.value}
                      disabled={locked}
                      onChange={(e) =>
                        change({ ...values, [name]: { ...entry, value: e.currentTarget.value } })
                      }
                    />
                  ) : (
                    <TextInput
                      aria-label={name}
                      value={entry.value}
                      disabled={locked}
                      onChange={(e) =>
                        change({ ...values, [name]: { ...entry, value: e.currentTarget.value } })
                      }
                    />
                  )}
                </div>
                <IconButton
                  icon="delete"
                  label={tr("删除环境变量 {{name}}", { name })}
                  disabled={locked}
                  onClick={() => setDeleting(name)}
                />
              </div>
            </div>
          ))}
        <Button
          className="add-step"
          fullWidth
          disabled={locked || !values}
          onClick={() => {
            setEditing({ original: null, name: "", entry: { value: "", sensitive: true } });
            setError("");
          }}
        >
          {tr("＋ 添加环境变量")}
        </Button>
      </div>
      {error && !editing && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {saving && (
        <p role="status" className="muted">
          {tr("保存中…")}
        </p>
      )}
      <Modal
        opened={editing !== null}
        onClose={() => {
          setEditing(null);
          setError("");
        }}
        title={tr(editing?.original === null ? "添加环境变量" : "编辑环境变量")}
        centered
        zIndex={350}
        closeButtonProps={{ "aria-label": tr("关闭") }}
      >
        {editing && (
          <form
            className="dialog-form"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const name = editing.name.trim();
                validateEnvironmentName(name);
                if (name !== editing.original && Object.hasOwn(values!, name))
                  throw Error(tr("环境变量名不能为空或重复。"));
                const next = Object.fromEntries(
                  Object.entries(values!).map(([key, value]) =>
                    key === editing.original ? [name, editing.entry] : [key, value],
                  ),
                );
                if (editing.original === null) next[name] = editing.entry;
                change(next);
                setEditing(null);
              } catch (cause) {
                setError(String(cause));
              }
            }}
          >
            <section className="dialog-section dialog-identity">
              <TextInput
                data-autofocus
                label={tr("名称")}
                placeholder="SEARCH_API_KEY"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.currentTarget.value })}
              />
            </section>
            <section className="dialog-section">
              <Checkbox
                label={tr("敏感值")}
                checked={editing.entry.sensitive}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    entry: { ...editing.entry, sensitive: e.currentTarget.checked },
                  })
                }
              />
            </section>
            <section className="dialog-section">
              {editing.entry.sensitive ? (
                <TimedPasswordInput
                  label={tr("值")}
                  value={editing.entry.value}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      entry: { ...editing.entry, value: e.currentTarget.value },
                    })
                  }
                />
              ) : (
                <TextInput
                  label={tr("值")}
                  value={editing.entry.value}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      entry: { ...editing.entry, value: e.currentTarget.value },
                    })
                  }
                />
              )}
            </section>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <Button
                variant="subtle"
                onClick={() => {
                  setEditing(null);
                  setError("");
                }}
              >
                {tr("取消")}
              </Button>
              <Button type="submit">{tr("完成")}</Button>
            </div>
          </form>
        )}
      </Modal>
      {deleting && (
        <ConfirmDelete
          title={tr("删除环境变量 {{name}}", { name: deleting })}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const next = { ...values };
            delete next[deleting];
            change(next);
          }}
        />
      )}
    </Stack>
  );
}
