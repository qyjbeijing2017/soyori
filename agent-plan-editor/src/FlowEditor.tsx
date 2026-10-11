import { Button, Modal } from "@mantine/core";
import {
  type FlowDefinition,
  fieldDefinitions,
  parseFlow,
  type Step,
  toJsonValue,
  withFieldDefinitions,
} from "agent-plan-core";
import { useEffect, useRef, useState } from "react";
import type { AiSettings, BrowserAiHost } from "./ai-host";
import { CallChoices } from "./CallChoices";
import { CodeFilePath } from "./CodeEditor";
import { ConfirmDelete } from "./ConfirmDelete";
import { canChat, enableChat } from "./chat-contract";
import { FieldsEditor } from "./FieldsEditor";
import { tr } from "./i18n";
import type { FlowDocument } from "./library";
import { bindLibraryCalls, libraryChoices, loadLibraryGraph } from "./library-calls";
import { StepDialog } from "./StepDialog";
import { StepList } from "./StepList";
import { createSession, type Session } from "./session";
import { replaceStep } from "./step-model";
import { Icon } from "./ui";
import { VariableNames } from "./VariableInput";

export function FlowEditor({
  doc,
  documents,
  onSave,
  aiHost,
  settings,
  onBusy,
  saving,
  executionBusy = false,
}: {
  doc: FlowDocument;
  documents: FlowDocument[];
  onSave: (flow: FlowDefinition) => Promise<void>;
  aiHost: BrowserAiHost;
  settings: AiSettings;
  onBusy: (busy: boolean) => void;
  saving: boolean;
  executionBusy?: boolean;
}) {
  const [flow, setFlow] = useState(doc.flow);
  const [valuesOpen, setValuesOpen] = useState(true);
  const [stepsOpen, setStepsOpen] = useState(true);
  const [clearing, setClearing] = useState<"variables" | "steps" | null>(null);
  const [clearBlocked, setClearBlocked] = useState(false);
  const choices = libraryChoices(flow, documents, doc.id);
  const latestFlow = useRef(flow);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [pending, setPending] = useState(false);
  const [writes, setWrites] = useState(0);
  const [editing, setEditing] = useState<{ step: Step; path: string } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [, paint] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(tr("选择一个步骤，编辑它的参数。"));
  const [runValues, setRunValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      Object.entries(fieldDefinitions(doc.flow.fields)).map(([name, field]) => [
        name,
        structuredClone(field.initial),
      ]),
    ),
  );
  const variablesPanel = useRef<HTMLDivElement>(null);
  const [undo, setUndo] = useState<FlowDefinition | null>(null);
  const abort = useRef<AbortController | null>(null);
  const running = useRef(false);
  const pause = useRef(false);
  const state = session?.runtime.getState();
  useEffect(() => {
    if (state?.nextStepPath || state?.error || session?.records.length) setStepsOpen(true);
  }, [state?.nextStepPath, state?.error, session?.records.length]);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    // Library rename is external to this editor; save acknowledgements must not replace newer edits.
    const metadata = {
      name: doc.flow.name,
      ...(doc.flow.description === undefined ? {} : { description: doc.flow.description }),
    };
    const syncMetadata = (current: FlowDefinition): FlowDefinition => {
      const { description: _description, ...rest } = current;
      return { ...rest, ...metadata };
    };
    latestFlow.current = syncMetadata(latestFlow.current);
    setFlow(syncMetadata);
  }, [doc.flow.name, doc.flow.description]);
  async function commit(next: FlowDefinition) {
    const valid = parseFlow(bindLibraryCalls(next, libraryChoices(next, documents, doc.id))),
      previous = latestFlow.current;
    if (JSON.stringify(valid) === JSON.stringify(previous)) return;
    latestFlow.current = valid;
    setFlow(valid);
    setWrites((v) => v + 1);
    const task = queue.current.catch(() => {}).then(() => onSave(valid));
    queue.current = task;
    try {
      await task;
      setUndo(previous);
      setSession(null);
      setRunValues((current) =>
        Object.fromEntries(
          Object.entries(fieldDefinitions(valid.fields)).map(([name, field]) => [
            name,
            Object.hasOwn(current, name) ? current[name] : structuredClone(field.initial),
          ]),
        ),
      );
      setError("");
    } catch (cause) {
      setError(String(cause));
      if (latestFlow.current === valid) {
        latestFlow.current = previous;
        setFlow(previous);
      }
      throw cause;
    } finally {
      setWrites((v) => v - 1);
    }
  }
  async function safeCommit(next: FlowDefinition) {
    try {
      await commit(next);
      setEditing(null);
    } catch (cause) {
      setError(String(cause));
    }
  }
  async function execute(single: boolean) {
    if (running.current || executionBusy) return;
    const invalid = Array.from(
      variablesPanel.current?.querySelectorAll("textarea,input") ?? [],
    ).find((element) => !(element as HTMLInputElement).checkValidity()) as
      | HTMLInputElement
      | undefined;
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    running.current = true;
    pause.current = false;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      let current = session;
      if (!current || ["completed", "failed"].includes(current.runtime.getState().status)) {
        abort.current = new AbortController();
        const graph = loadLibraryGraph({ ...doc, flow: latestFlow.current }, documents);
        current = createSession(
          graph,
          {},
          aiHost.tools(
            settings,
            abort.current.signal,
            setNotice,
            graph,
            () => current?.runtime.getStack().at(-1)?.source,
          ),
        );
        current.runtime.setFields(runValues);
        setSession(current);
      }
      let count = 0;
      do {
        await current.step();
        setRunValues({ ...current.runtime.getState().fields });
        paint((v) => v + 1);
        count++;
        if (["completed", "failed"].includes(current.runtime.getState().status)) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      } while (!single && !pause.current && count < 2000);
      const next = current.runtime.getState();
      setNotice(
        next.status === "completed"
          ? tr("运行完成")
          : next.status === "failed"
            ? tr("运行失败，请检查错误步骤。")
            : tr("已暂停，可以继续运行。"),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      running.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  const locked = busy || saving || writes > 0 || pending;
  let defaultsMatch = true;
  let nextDefaults: FlowDefinition["fields"] | null = null;
  try {
    const canonical = (value: unknown) =>
      JSON.stringify(value, (_key, item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
          : item,
      );
    nextDefaults = withFieldDefinitions(
      flow.fields,
      Object.fromEntries(
        Object.entries(fieldDefinitions(flow.fields)).map(([name, field]) => {
          const value = runValues[name] === undefined ? undefined : toJsonValue(runValues[name]);
          if (canonical(value) !== canonical(field.initial)) defaultsMatch = false;
          const { initial: _initial, ...rest } = field;
          return [name, value === undefined ? rest : { ...rest, initial: value }];
        }),
      ),
    );
  } catch {
    defaultsMatch = false;
  }
  return (
    <CodeFilePath.Provider value={doc.path ?? "flow.yaml"}>
      <CallChoices.Provider value={choices}>
        <VariableNames.Provider value={Object.keys(fieldDefinitions(flow.fields))}>
          <section className="editor-page compact-editor">
            {clearing && (
              <ConfirmDelete
                title={tr(clearing === "variables" ? "清空变量" : "清空步骤")}
                message={tr(
                  clearing === "variables"
                    ? "确认删除所有变量及其默认值和运行值？"
                    : "确认删除所有流程步骤（包括嵌套步骤）？",
                )}
                confirmLabel={tr("确认清空")}
                onClose={() => setClearing(null)}
                onConfirm={async () => {
                  if (locked) return;
                  if (clearing === "variables") {
                    const next = { ...latestFlow.current, fields: {} };
                    if (Object.keys(fieldDefinitions(parseFlow(next).fields)).length) {
                      setClearing(null);
                      setClearBlocked(true);
                      return;
                    }
                    await commit(next);
                  } else await commit({ ...latestFlow.current, steps: [] });
                  setNotice("");
                }}
              />
            )}
            <Modal
              opened={clearBlocked}
              onClose={() => setClearBlocked(false)}
              title={tr("清空变量")}
              centered
              zIndex={400}
              closeButtonProps={{ "aria-label": tr("关闭") }}
            >
              <p role="status">{tr("变量仍被步骤引用，请先移除引用或清空步骤。")}</p>
            </Modal>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <section className="variables-panel" ref={variablesPanel}>
              <div className="section-caption run-values-heading">
                <button
                  className="panel-toggle"
                  type="button"
                  aria-expanded={valuesOpen}
                  onClick={() => setValuesOpen(!valuesOpen)}
                >
                  <Icon name={valuesOpen ? "down" : "chevronRight"} />
                  {tr("运行值")}
                </button>
                <div className="run-values-actions">
                  {Object.keys(fieldDefinitions(flow.fields)).length > 0 && (
                    <Button
                      variant="subtle"
                      aria-label={tr("清空变量")}
                      disabled={locked}
                      onClick={() => {
                        if (
                          Object.keys(
                            fieldDefinitions(
                              parseFlow({ ...latestFlow.current, fields: {} }).fields,
                            ),
                          ).length
                        )
                          setClearBlocked(true);
                        else setClearing("variables");
                      }}
                    >
                      {tr("清空")}
                    </Button>
                  )}
                  {!canChat(flow) && (
                    <Button
                      variant="subtle"
                      disabled={locked}
                      onClick={() => void commit(enableChat(latestFlow.current)).catch(() => {})}
                    >
                      {tr("设置为对话")}
                    </Button>
                  )}
                  {!defaultsMatch && (
                    <>
                      <Button
                        variant="subtle"
                        disabled={locked || defaultsMatch}
                        onClick={() => {
                          setSession(null);
                          setRunValues(
                            Object.fromEntries(
                              Object.entries(fieldDefinitions(latestFlow.current.fields)).map(
                                ([name, field]) => [name, structuredClone(field.initial)],
                              ),
                            ),
                          );
                          setNotice(tr("已重置"));
                        }}
                      >
                        {tr("重置到默认值")}
                      </Button>
                      <Button
                        variant="subtle"
                        disabled={locked || defaultsMatch || !nextDefaults}
                        onClick={() => {
                          if (nextDefaults)
                            void commit({ ...latestFlow.current, fields: nextDefaults }).catch(
                              () => {},
                            );
                        }}
                      >
                        {tr("设置为默认值")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {session && (
                <div className="variable-run-status">
                  <span role="status">{notice}</span>
                </div>
              )}
              {state?.error && (
                <div className="error" role="alert">
                  <strong>{state.error.path}</strong>
                  <p>{state.error.message}</p>
                </div>
              )}
              <div hidden={!valuesOpen}>
                <FieldsEditor
                  flow={flow}
                  disabled={busy}
                  values={runValues}
                  debugging={Boolean(session)}
                  finished={state?.status === "completed" || state?.status === "failed"}
                  onPending={setPending}
                  onValueChange={(name, value) => {
                    if (
                      session &&
                      !["completed", "failed"].includes(session.runtime.getState().status)
                    ) {
                      session.runtime.setFields({ [name]: value });
                      paint((v) => v + 1);
                    }
                    setRunValues((current) => ({ ...current, [name]: value }));
                  }}
                  onSave={(fields) => commit({ ...latestFlow.current, fields })}
                />
              </div>
            </section>
            <section className="steps-panel" aria-label={tr("流程步骤")}>
              <div className="section-caption run-values-heading">
                <button
                  className="panel-toggle"
                  type="button"
                  aria-expanded={stepsOpen}
                  onClick={() => setStepsOpen(!stepsOpen)}
                >
                  <Icon name={stepsOpen ? "down" : "chevronRight"} />
                  {tr("流程步骤")}
                </button>
                {flow.steps.length > 0 && (
                  <div className="run-values-actions">
                    <Button
                      variant="subtle"
                      aria-label={tr("清空步骤")}
                      disabled={locked}
                      onClick={() => setClearing("steps")}
                    >
                      {tr("清空")}
                    </Button>
                  </div>
                )}
              </div>
              <div hidden={!stepsOpen}>
                <StepList
                  steps={flow.steps}
                  onChange={(steps) =>
                    commit({ ...latestFlow.current, steps }).catch((cause) => {
                      setError(String(cause));
                      throw cause;
                    })
                  }
                  onEdit={(step, path) => setEditing({ step, path })}
                  records={session?.records ?? []}
                  executed={session?.executed}
                  nextPath={state?.nextStepPath}
                  failedPath={
                    session?.records.filter((record) => record.error).at(-1)?.path ??
                    state?.error?.path
                  }
                  disabled={locked}
                />
              </div>
            </section>
            <div className="editor-bottom-bar">
              <Button
                aria-label={tr("撤销修改")}
                disabled={locked || !undo}
                onClick={() => {
                  if (undo) void safeCommit(undo);
                }}
              >
                <Icon name="undo" />
                <span className="run-label">{tr("撤销修改")}</span>
              </Button>
              <Button
                aria-label={tr("下一步")}
                disabled={locked || executionBusy}
                onClick={() => void execute(true)}
              >
                <Icon name="next" />
                <span className="run-label">{tr("下一步")}</span>
              </Button>
              {busy ? (
                <>
                  <Button
                    aria-label={tr("步骤间暂停")}
                    onClick={() => {
                      pause.current = true;
                    }}
                  >
                    <Icon name="pause" />
                    <span className="run-label">{tr("步骤间暂停")}</span>
                  </Button>
                  <Button
                    aria-label={tr("取消调用")}
                    onClick={() => {
                      pause.current = true;
                      abort.current?.abort();
                    }}
                  >
                    <Icon name="stop" />
                    <span className="run-label">{tr("取消调用")}</span>
                  </Button>
                </>
              ) : (
                <Button
                  variant="filled"
                  aria-label={tr("运行测试")}
                  disabled={locked || executionBusy}
                  onClick={() => void execute(false)}
                >
                  <Icon name="play" />
                  <span className="run-label">
                    {session && state?.status !== "completed" && state?.status !== "failed"
                      ? tr("继续运行")
                      : tr("运行测试")}
                  </span>
                </Button>
              )}
            </div>
            {editing && (
              <StepDialog
                key={editing.path}
                mode="edit"
                step={editing.step}
                disabled={locked}
                onClose={() => setEditing(null)}
                onSave={async (step) => {
                  await commit({
                    ...latestFlow.current,
                    steps: replaceStep(latestFlow.current.steps, editing.path, step),
                  });
                  setEditing(null);
                }}
              />
            )}
          </section>
        </VariableNames.Provider>
      </CallChoices.Provider>
    </CodeFilePath.Provider>
  );
}
