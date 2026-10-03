import { Button, Modal } from "@mantine/core";
import type { Step } from "agent-plan-core";
import { useState } from "react";
import { ConfirmDelete } from "./ConfirmDelete";
import { tr } from "./i18n";
import { arrayMove, SortableList, SortableRow } from "./Sortable";
import { StepForm } from "./StepForm";
import { StepIcon } from "./StepIcon";
import type { StepRecord } from "./session";
import { errorAdvice } from "./session";
import { newStep, stepCategory, stepSummary, stepTitle } from "./step-model";
import { EllipsisText, IconButton } from "./ui";
import { ValueView } from "./ValueEditor";

function snapshot(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

interface Props {
  steps: Step[];
  prefix?: string;
  onChange: (steps: Step[]) => void | Promise<void>;
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
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  return (
    <div className="step-list">
      {deleting !== null && (
        <ConfirmDelete
          title={tr("删除步骤")}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            if (!disabled) await onChange(steps.filter((_, i) => i !== deleting));
          }}
        />
      )}
      <SortableList
        ids={steps.map((_, i) => `${prefix}[${i}]`)}
        onMove={(from, to) => {
          if (!disabled) void Promise.resolve(onChange(arrayMove(steps, from, to))).catch(() => {});
        }}
      >
        {steps.map((step, index) => {
          const path = `${prefix}[${index}]`;
          const visits = records.filter((record) => record.path === path);
          const last = visits.at(-1);
          const failed = failedPath === path || Boolean(last?.error);
          const current = nextPath === path && !failed;
          const label = stepTitle(step);
          const nested = (branch: "then" | "else" | "body", children: Step[]) => (
            <StepList
              steps={children}
              prefix={`${path}.${branch}`}
              onChange={(value) =>
                onChange(
                  steps.map((s, i) => (i === index ? ({ ...s, [branch]: value } as Step) : s)),
                )
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
            <SortableRow key={path} id={path} disabled={disabled} label={label}>
              {(handle) => (
                <article
                  className={`step-card category-${stepCategory(step.type)} ${failed ? "has-error" : current ? "is-current" : ""}`}
                >
                  <div className="step-top">
                    {handle}
                    <span
                      className="step-number"
                      title={tr("第 {{count}} 步", { count: index + 1 })}
                    >
                      <StepIcon type={step.type} />
                    </span>
                    <button
                      className="step-name"
                      type="button"
                      disabled={disabled}
                      aria-label={tr("编辑 {{name}}", { name: label })}
                      title={step.description || label}
                      onClick={() => onEdit(step, path)}
                    >
                      <strong>
                        <EllipsisText text={label} />
                      </strong>
                      <EllipsisText text={stepSummary(step)} />
                      {step.description && (
                        <span className="editor-description step-description">
                          {step.description}
                        </span>
                      )}
                    </button>
                    {(failed || current || executed?.has(path)) && (
                      <span className={`status ${failed ? "bad" : current ? "next" : "done"}`}>
                        {failed ? tr("出错") : current ? tr("下一步") : tr("已执行")}
                      </span>
                    )}
                    <IconButton
                      icon="delete"
                      label={tr("删除步骤 {{name}}", { name: label })}
                      disabled={disabled}
                      onClick={() => setDeleting(index)}
                    />
                  </div>
                  {last?.error && <p className="error">{errorAdvice(last.error.code)}</p>}
                  {last && (
                    <details className="step-results">
                      <summary>
                        {tr("查看步骤结果")}
                        {visits.length > 1
                          ? tr("（最近 {{count}} 次）", { count: visits.length })
                          : ""}
                      </summary>
                      {visits.map((record, i) => (
                        <div key={String(i)} className="visit">
                          {visits.length > 1 && (
                            <strong>{tr("第 {{count}} 条保留记录", { count: i + 1 })}</strong>
                          )}
                          {record.branch && (
                            <p>
                              {tr("分支：")}
                              {{
                                then: tr("条件成立"),
                                else: tr("条件不成立"),
                                body: tr("进入循环"),
                                exit: tr("退出循环"),
                              }[record.branch] ?? record.branch}
                            </p>
                          )}
                          <p>{tr("执行后数据")}</p>
                          <ValueView value={snapshot(record.after)} />
                          <details>
                            <summary>{tr("执行前数据")}</summary>
                            <ValueView value={snapshot(record.before)} />
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
                      <details>
                        <summary>{tr("条件成立时")}</summary>
                        {nested("then", step.then)}
                      </details>
                      <details>
                        <summary>{tr("否则")}</summary>
                        {nested("else", step.else ?? [])}
                      </details>
                    </div>
                  )}
                  {step.type === "while" && (
                    <div className="branches">
                      <details open>
                        <summary>{tr("循环执行")}</summary>
                        {nested("body", step.body)}
                      </details>
                    </div>
                  )}
                </article>
              )}
            </SortableRow>
          );
        })}
      </SortableList>
      <Button
        variant="light"
        className="add-step"
        type="button"
        disabled={disabled}
        onClick={() => setAdding(true)}
      >
        {tr("＋ 添加步骤")}
      </Button>
      <Modal
        opened={adding}
        onClose={() => setAdding(false)}
        title={tr("添加步骤")}
        size="lg"
        closeButtonProps={{ "aria-label": tr("关闭") }}
      >
        {adding && (
          <StepForm
            step={newStep("set")}
            onCancel={() => setAdding(false)}
            onSave={async (step) => {
              await onChange([...steps, step]);
              setAdding(false);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
