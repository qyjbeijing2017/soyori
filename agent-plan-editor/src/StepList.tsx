import type { Step } from "agent-plan-core";
import type { StepRecord } from "./session";
import { errorAdvice } from "./session";
import { newStep, stepNames } from "./step-model";

interface Props {
  steps: Step[];
  prefix?: string;
  onChange: (steps: Step[]) => void;
  onEdit: (step: Step, path: string) => void;
  records: StepRecord[];
  executed?: ReadonlySet<string>;
  nextPath?: string | null;
  failedPath?: string;
  disabled: boolean;
}
export function StepList({
  steps,
  prefix = "steps",
  onChange,
  onEdit,
  records,
  executed,
  nextPath,
  failedPath,
  disabled,
}: Props) {
  function move(index: number, offset: number) {
    const next = [...steps];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  }
  return (
    <div className="step-list">
      {steps.map((step, index) => {
        const path = `${prefix}[${index}]`;
        const visits = records.filter((record) => record.path === path);
        const last = visits.at(-1);
        const failed = failedPath === path || Boolean(last?.error);
        const current = nextPath === path && !failed;
        const label = step.description || stepNames[step.type];
        const nested = (branch: "then" | "else" | "body", children: Step[]) => (
          <StepList
            steps={children}
            prefix={`${path}.${branch}`}
            onChange={(value) =>
              onChange(steps.map((s, i) => (i === index ? ({ ...s, [branch]: value } as Step) : s)))
            }
            onEdit={onEdit}
            records={records}
            executed={executed}
            nextPath={nextPath}
            failedPath={failedPath}
            disabled={disabled}
          />
        );
        return (
          <article
            key={path}
            className={`step-card ${failed ? "has-error" : current ? "is-current" : ""}`}
          >
            <div className="step-top">
              <span className="step-number">{index + 1}</span>
              <button
                className="step-name"
                type="button"
                disabled={disabled}
                onClick={() => onEdit(step, path)}
              >
                <strong>{label}</strong>
                <span>{stepNames[step.type]} · 点击编辑</span>
              </button>
              <span className={`status ${failed ? "bad" : ""}`}>
                {failed ? "出错" : current ? "下一步" : executed?.has(path) ? "已执行" : "待运行"}
              </span>
            </div>
            <details className="step-menu">
              <summary>更多操作</summary>
              <div className="step-tools">
                <button
                  type="button"
                  disabled={disabled || index === 0}
                  aria-label={`上移 ${label}`}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={disabled || index === steps.length - 1}
                  aria-label={`下移 ${label}`}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange([
                      ...steps.slice(0, index + 1),
                      structuredClone(step),
                      ...steps.slice(index + 1),
                    ])
                  }
                >
                  复制
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(steps.filter((_, i) => i !== index))}
                >
                  删除
                </button>
              </div>
            </details>
            {last?.error && <p className="error">{errorAdvice(last.error.code)}</p>}
            {last && (
              <details className="step-results">
                <summary>
                  查看步骤结果{visits.length > 1 ? `（最近 ${visits.length} 次）` : ""}
                </summary>
                {visits.map((record, i) => (
                  <div key={String(i)} className="visit">
                    {visits.length > 1 && <strong>第 {i + 1} 条保留记录</strong>}
                    {record.branch && (
                      <p>
                        分支：
                        {{
                          then: "条件成立",
                          else: "条件不成立",
                          body: "进入循环",
                          exit: "退出循环",
                        }[record.branch] ?? record.branch}
                      </p>
                    )}
                    <p>执行后数据</p>
                    <pre>{record.after}</pre>
                    <details>
                      <summary>执行前数据与步骤配置</summary>
                      <pre>{record.before}</pre>
                      <pre>{JSON.stringify(step, null, 2)}</pre>
                    </details>
                    {record.error && (
                      <pre className="error">
                        {record.error.code}: {record.error.message}
                      </pre>
                    )}
                  </div>
                ))}
              </details>
            )}
            {step.type === "if" && (
              <div className="branches">
                <details open>
                  <summary>条件成立时</summary>
                  {nested("then", step.then)}
                </details>
                <details>
                  <summary>否则</summary>
                  {nested("else", step.else ?? [])}
                </details>
              </div>
            )}
            {step.type === "while" && (
              <div className="branches">
                <details open>
                  <summary>循环执行</summary>
                  {nested("body", step.body)}
                </details>
              </div>
            )}
          </article>
        );
      })}
      <button
        className="add-step"
        type="button"
        disabled={disabled}
        onClick={() => onChange([...steps, newStep("set")])}
      >
        ＋ 添加步骤
      </button>
    </div>
  );
}
