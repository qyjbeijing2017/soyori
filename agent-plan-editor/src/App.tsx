import { createRuntime, parseFlow, type Runtime } from "agent-plan-core";
import { useRef, useState } from "react";
import example from "./example.json";
import { formatState } from "./format-state";

export function App() {
  const [source, setSource] = useState(JSON.stringify(example, null, 2));
  const [result, setResult] = useState("尚未创建运行。点击校验或单步开始。");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const runtime = useRef<Runtime | null>(null);

  async function act(action: "validate" | "step" | "reset") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const flow = parseFlow(JSON.parse(source));
      if (action === "validate") {
        setResult(`校验通过：${flow.name}（${flow.steps.length} 个顶层步骤）`);
      } else {
        if (action === "reset" || !runtime.current) runtime.current = createRuntime(flow);
        if (action === "step") await runtime.current.step();
        const state = runtime.current.getState();
        setResult(
          formatState({
            status: state.status,
            nextStepPath: state.nextStepPath,
            fields: state.fields,
            error: state.error,
          }),
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header>
        <div className="brand">
          <img
            className="brand-logo"
            src={`${import.meta.env.BASE_URL}brand/agent-plan-logo.png`}
            alt=""
            width="80"
            height="80"
          />
          <div className="brand-label">
            <span className="brand-name">Agent Plan</span>
            <span className="eyebrow">EDITOR</span>
          </div>
        </div>
        <h1>把想法，逐步运行。</h1>
        <p>编辑流程，观察每一步的数据变化。</p>
      </header>
      <div className="workspace">
        <section aria-labelledby="source-heading">
          <h2 id="source-heading">流程定义</h2>
          <p>基础工程预览 · 修改定义会清空当前运行。</p>
          <label htmlFor="flow-source">JSON 源码</label>
          <textarea
            id="flow-source"
            spellCheck={false}
            value={source}
            disabled={busy}
            onChange={(event) => {
              setSource(event.target.value);
              runtime.current = null;
              setError("");
              setResult("定义已修改，下次单步将创建新运行。");
            }}
          />
          <div className="actions">
            <button type="button" disabled={busy} onClick={() => void act("validate")}>
              校验
            </button>
            <button
              className="primary"
              type="button"
              disabled={busy}
              onClick={() => void act("step")}
            >
              执行下一步
            </button>
            <button type="button" disabled={busy} onClick={() => void act("reset")}>
              重新开始
            </button>
          </div>
        </section>
        <section aria-labelledby="state-heading">
          <h2 id="state-heading">运行状态</h2>
          <p>使用 agent-plan-core，在当前浏览器内执行。</p>
          <pre aria-live="polite">{result}</pre>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
      <footer>
        当前为基础项目：内容仅保留在本页面，刷新后重置。文件保存、助手与仓库同步尚未接入。
      </footer>
    </main>
  );
}
