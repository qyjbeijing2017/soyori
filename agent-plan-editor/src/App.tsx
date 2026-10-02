import { type FlowDefinition, parseFlow, type Step } from "agent-plan-core";
import { useEffect, useRef, useState } from "react";
import { AiSettings } from "./AiSettings";
import { BrowserAiHost, initialAiSettings } from "./ai-host";
import example from "./example.json";
import { formatState } from "./format-state";
import { readValue, StepForm, ValueInput } from "./StepForm";
import { StepList } from "./StepList";
import { createSession, errorAdvice, type Session } from "./session";
import { replaceStep } from "./step-model";

function EditDialog({
  step,
  onSave,
  onClose,
}: {
  step: Step;
  onSave: (step: Step) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-label="编辑步骤">
      <StepForm step={step} onSave={onSave} onCancel={onClose} />
    </dialog>
  );
}

export function App() {
  const [aiSettings, setAiSettings] = useState(initialAiSettings);
  const [aiHost] = useState(() => new BrowserAiHost());
  const abortAi = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abortAi.current?.abort();
      aiHost.dispose();
    },
    [aiHost],
  );
  const [flow, setFlow] = useState<FlowDefinition>(() => parseFlow(example));
  const [revision, setRevision] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [, repaint] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ step: Step; path: string } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("先试试示例，也可以点击任意步骤修改。");
  const [undo, setUndo] = useState<FlowDefinition | null>(null);
  const inputForm = useRef<HTMLFormElement>(null);
  const resultPanel = useRef<HTMLElement>(null);
  const running = useRef(false);
  const stop = useRef(false);
  const state = session?.runtime.getState();
  const completed = state?.status === "completed";
  const failed = state?.status === "failed";
  const terminal = completed || failed;
  useEffect(() => {
    if (
      !busy &&
      (completed || failed || error) &&
      window.matchMedia("(max-width: 760px)").matches
    ) {
      resultPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [busy, completed, failed, error]);
  const status = busy
    ? "正在运行"
    : failed
      ? "需要修改"
      : completed
        ? "运行完成"
        : session
          ? "等待下一步"
          : "准备就绪";

  function invalidate(message = "修改已应用，下一次将从头运行。") {
    setSession(null);
    setError("");
    setNotice(message);
  }
  function change(next: FlowDefinition) {
    const valid = parseFlow(next);
    setUndo(flow);
    setFlow(valid);
    setRevision((value) => value + 1);
    invalidate();
  }
  async function execute(single: boolean) {
    if (running.current) return;
    running.current = true;
    stop.current = false;
    setError("");
    try {
      let current = session;
      if (!current || terminal) {
        const data = new FormData(inputForm.current!);
        const inputs = Object.fromEntries(
          Object.entries(flow.fields)
            .filter(
              ([name, field]) =>
                field.input && (field.initial !== undefined || data.get(`use:${name}`) === "on"),
            )
            .map(([name]) => [name, readValue(data, `input:${name}`, true)]),
        );
        abortAi.current = new AbortController();
        current = createSession(
          parseFlow(flow),
          inputs,
          aiHost.tools(aiSettings, abortAi.current.signal, setNotice),
        );
        setSession(current);
      }
      setBusy(true);
      let count = 0;
      do {
        await current.step();
        count++;
        repaint((value) => value + 1);
        const next = current.runtime.getState();
        if (next.status === "completed" || next.status === "failed") break;
        // Let the browser paint and accept pause between core steps.
        await new Promise((resolve) => setTimeout(resolve, 16));
      } while (!single && !stop.current && count < 2000);
      setNotice(
        current.runtime.getState().status === "failed"
          ? "运行已停止。检查提示后可从头重新运行。"
          : count >= 2000
            ? "已执行 2000 步，暂时暂停。可继续运行。"
            : stop.current
              ? "已在步骤之间暂停，可以继续。"
              : "步骤结果已更新，可展开每一步查看。",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <img
            className="brand-logo"
            src={`${import.meta.env.BASE_URL}brand/agent-plan-logo.png`}
            alt=""
            width="64"
            height="64"
          />
          <span className="brand-name">Agent Plan</span>
          <span className="edition">工作台</span>
        </div>
        <span className="storage-note">当前页面草稿 · 刷新后重置</span>
      </header>
      <div className="flow-heading">
        <div>
          <span className="eyebrow">从一个小流程开始</span>
          <h1>{flow.name}</h1>
          <p>{flow.description}</p>
        </div>
        <span className={`status big ${failed ? "bad" : ""}`} aria-live="polite">
          {status}
        </span>
      </div>
      <div className="workbench">
        <div className="flow-column">
          <AiSettings
            value={aiSettings}
            disabled={busy}
            onChange={(value) => {
              setAiSettings(value);
              invalidate("AI 设置已更新，下一次从头运行。");
            }}
            onRelease={() => {
              aiHost.dispose();
              setNotice("本地模型内存已释放，下载缓存保留。");
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              let name = "answer";
              for (let i = 2; Object.hasOwn(flow.fields, name); i++) name = `answer${i}`;
              change({
                ...flow,
                fields: { ...flow.fields, [name]: { output: true, description: "AI 回复" } },
                steps: [
                  ...flow.steps,
                  {
                    type: "call",
                    description: "询问本地 AI",
                    target: { kind: "function", id: "local.generate" },
                    inputs: { prompt: "请用中文简短介绍你自己。", maxTokens: 128 },
                    outputs: { text: `$${name}` },
                  },
                ],
              });
            }}
          >
            ＋ 添加 AI 调用
          </button>
          <section className="input-panel" aria-labelledby="input-title">
            <h2 id="input-title">这次的输入</h2>
            <form
              ref={inputForm}
              key={JSON.stringify(flow.fields)}
              onSubmit={(e) => {
                e.preventDefault();
                void execute(false);
              }}
              onChange={() => invalidate("输入已修改，下一次将从头运行。")}
            >
              <fieldset disabled={busy}>
                {Object.entries(flow.fields)
                  .filter(([, field]) => field.input)
                  .map(([name, field]) => (
                    <div className="input-field" key={name}>
                      <span className="field-title">{field.description || name}</span>
                      {field.initial === undefined && (
                        <label className="check">
                          <input name={`use:${name}`} type="checkbox" />
                          提供这个输入（否则保持未定义）
                        </label>
                      )}
                      <ValueInput
                        name={`input:${name}`}
                        value={field.initial === undefined ? "" : field.initial}
                        literal
                      />
                    </div>
                  ))}
                {!Object.values(flow.fields).some((field) => field.input) && (
                  <p className="muted">这个流程无需额外输入。</p>
                )}
              </fieldset>
            </form>
          </section>
          <div className="section-title">
            <h2>
              流程步骤 <span>{flow.steps.length}</span>
            </h2>
            <button
              type="button"
              disabled={busy || !undo}
              onClick={() => {
                if (undo) {
                  const previous = undo;
                  change(previous);
                  setUndo(null);
                }
              }}
            >
              撤销修改
            </button>
          </div>
          <StepList
            steps={flow.steps}
            onChange={(steps) => change({ ...flow, steps })}
            onEdit={(step, path) => setEditing({ step, path })}
            records={session?.records ?? []}
            executed={session?.executed}
            nextPath={state?.nextStepPath}
            failedPath={state?.error?.path}
            disabled={busy}
          />
          <details className="advanced" key={revision}>
            <summary>流程设置与源码</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  const data = new FormData(e.currentTarget);
                  change(parseFlow(JSON.parse(String(data.get("source")))));
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : String(cause));
                }
              }}
            >
              <p className="muted">
                用于修改流程名称、输入/输出字段与完整结构。应用会重建输入表单，并清空旧运行。
              </p>
              <label>
                流程 JSON
                <textarea
                  name="source"
                  rows={18}
                  defaultValue={JSON.stringify(flow, null, 2)}
                  disabled={busy}
                  spellCheck={false}
                />
              </label>
              <button type="submit" disabled={busy}>
                校验并应用源码
              </button>
            </form>
          </details>
        </div>
        <aside ref={resultPanel} className="result-panel" aria-labelledby="result-title">
          <div className="panel-title">
            <h2 id="result-title">运行结果</h2>
            <span className="eyebrow">OUTPUT</span>
          </div>
          {!session && (
            <div className="empty-result">
              <span className="empty-icon">↗</span>
              <h3>看看这几步会发生什么</h3>
              <p>
                运行后，结果会出现在这里。
                <br />
                也可以逐步执行，观察数据变化。
              </p>
            </div>
          )}
          {session && !completed && !failed && (
            <p className="muted">流程尚未结束。展开步骤卡片可以查看已执行的结果。</p>
          )}
          {completed && (
            <div className="output-list">
              {Object.entries(state.output ?? {}).map(([name, value]) => (
                <div key={name}>
                  <span className="field-title">{flow.fields[name]?.description || name}</span>
                  {typeof value === "string" ? (
                    <p className="output-text">{value}</p>
                  ) : (
                    <pre>{formatState(value)}</pre>
                  )}
                </div>
              ))}
              {Object.keys(state.output ?? {}).length === 0 && (
                <p>流程已完成，未配置输出字段。可展开下方的数据详情。</p>
              )}
            </div>
          )}
          {failed && state.error && (
            <div role="alert" className="failure">
              <h3>有一步没有完成</h3>
              <p>{state.error.message}</p>
              <p>{errorAdvice(state.error.code)}</p>
              <p className="muted">位置：{state.error.path}</p>
              <details>
                <summary>原始错误</summary>
                <pre>{formatState(state.error)}</pre>
              </details>
            </div>
          )}
          {error && (
            <div className="failure" role="alert">
              <h3>暂时无法执行或应用修改</h3>
              <p>{error}</p>
              <p className="muted">检查步骤和 AI 设置。外部子流程加载仍未接入当前浏览器。</p>
            </div>
          )}
          {session && (
            <details className="data-details">
              <summary>查看当前全部数据</summary>
              <pre>{formatState(state?.fields)}</pre>
              <p className="muted small">
                仅保留最近 300 条步骤记录；记录用于查看，不支持恢复现场。
              </p>
            </details>
          )}
          <p className="run-note" role="status">
            {notice}
          </p>
        </aside>
      </div>
      <div className="run-bar">
        <div>
          <strong>{status}</strong>
          <span className="muted">修改后从头运行</span>
        </div>
        <div className="actions">
          {busy && (
            <button
              type="button"
              onClick={() => {
                stop.current = true;
                abortAi.current?.abort();
              }}
            >
              取消 AI 调用
            </button>
          )}
          <button
            type="button"
            disabled={busy || !session}
            onClick={() => invalidate("运行已清空，输入保持不变。")}
          >
            重置
          </button>
          <button type="button" disabled={busy} onClick={() => void execute(true)}>
            {terminal ? "从头单步" : "下一步"}
          </button>
          {busy ? (
            <button
              className="primary"
              type="button"
              onClick={() => {
                stop.current = true;
              }}
            >
              暂停
            </button>
          ) : (
            <button className="primary" type="button" onClick={() => void execute(false)}>
              {terminal ? "重新运行" : session ? "继续运行" : "运行流程"}
            </button>
          )}
        </div>
      </div>
      {editing && (
        <EditDialog
          step={editing.step}
          onClose={() => setEditing(null)}
          onSave={(step) => {
            change({ ...flow, steps: replaceStep(flow.steps, editing.path, step) });
            setEditing(null);
          }}
        />
      )}
    </main>
  );
}
