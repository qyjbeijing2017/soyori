import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button, Menu } from "@mantine/core";
import { type ComponentProps, useState } from "react";
import type { Step } from "soyori-core";
import { ConfirmDelete } from "./ConfirmDelete";
import { type DragPath, FieldDrag, FieldDrop } from "./FieldDrag";
import { GroupBlock } from "./GroupBlock";
import { tr } from "./i18n";
import { MarkdownText } from "./MarkdownText";
import { SortableRow } from "./Sortable";
import { StepDialog } from "./StepDialog";
import { StepIcon } from "./StepIcon";
import type { StepRecord } from "./session";
import { errorAdvice } from "./session";
import { moveStepEntry } from "./step-drag";
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

function StepGroup({
  dropPath,
  disabled,
  ...props
}: ComponentProps<typeof GroupBlock> & { dropPath: DragPath; disabled: boolean }) {
  return (
    <FieldDrop path={dropPath} disabled={disabled}>
      {(ref, over) => (
        <GroupBlock {...props} dropRef={ref} dropActive={over} active={over || props.active} />
      )}
    </FieldDrop>
  );
}

interface Props {
  dragPath?: DragPath;
  withinDrag?: boolean;
  steps: Step[];
  prefix?: string;
  onChange: (steps: Step[]) => void | Promise<void>;
  onEdit: (step: Step, path: string) => void;
  records: StepRecord[];
  executed?: ReadonlySet<string>;
  nextPath?: string | null;
  failedPath?: string;
  disabled: boolean;
  onExtract?: (index: number) => void;
}
export function StepList(props: Props) {
  if (props.withinDrag) return <StepListContent {...props} />;
  return (
    <FieldDrag
      disabled={props.disabled}
      onMove={(from, parent, index) => {
        if (!props.disabled)
          void Promise.resolve(
            props.onChange(moveStepEntry(props.steps, from, parent, index)),
          ).catch(() => {});
      }}
    >
      <StepListContent {...props} />
    </FieldDrag>
  );
}
function StepListContent({
  dragPath = [],
  steps,
  prefix = "steps",
  onChange,
  onEdit,
  records,
  executed,
  nextPath,
  failedPath,
  disabled,
  onExtract,
}: Props) {
  const activeWithin = (path: string) => {
    const focus = failedPath ?? nextPath ?? records.at(-1)?.path;
    return focus?.startsWith(`${path}[`) ? `${focus}:${records.length}` : undefined;
  };
  function update(value: Step[]) {
    void Promise.resolve(onChange(value)).catch(() => {});
  }
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
      <SortableContext
        items={steps.map((_, i) => JSON.stringify([...dragPath, i]))}
        strategy={verticalListSortingStrategy}
      >
        {steps.map((step, index) => {
          const path = `${prefix}[${index}]`;
          const visits = records.filter((record) => record.path === path);
          const last = visits.at(-1);
          const failed = failedPath === path || Boolean(last?.error);
          const current = nextPath === path && !failed;
          const label = stepTitle(step);
          const nested = (branch: "then" | "else" | "body" | "steps", children: Step[]) => (
            <StepList
              steps={children}
              withinDrag
              dragPath={[...dragPath, index, branch]}
              prefix={`${path}.${branch}`}
              onChange={(value) =>
                onChange(
                  steps.map((s, i) => (i === index ? ({ ...s, [branch]: value } as Step) : s)),
                )
              }
              onExtract={(childIndex) => {
                const remaining = children.filter((_, i) => i !== childIndex);
                update(
                  steps.flatMap((s, i) =>
                    i === index
                      ? [{ ...s, [branch]: remaining } as Step, children[childIndex]]
                      : [s],
                  ),
                );
              }}
              onEdit={onEdit}
              records={records}
              executed={executed}
              nextPath={nextPath}
              failedPath={failedPath}
              disabled={disabled}
            />
          );
          return (
            <SortableRow
              previewOrder={false}
              key={path}
              id={JSON.stringify([...dragPath, index])}
              disabled={disabled}
              label={label}
              container={step.type === "if" || step.type === "group" || step.type === "while"}
              intoPath={
                step.type === "group"
                  ? [...dragPath, index, "steps"]
                  : step.type === "while"
                    ? [...dragPath, index, "body"]
                    : undefined
              }
            >
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
                    <div className="step-details">
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
                      </button>
                      {step.description && (
                        <MarkdownText
                          className="editor-description step-description"
                          source={step.description}
                        />
                      )}
                    </div>
                    {(failed || current || executed?.has(path)) && (
                      <span className={`status ${failed ? "bad" : current ? "next" : "done"}`}>
                        {failed ? tr("出错") : current ? tr("下一步") : tr("已执行")}
                      </span>
                    )}
                    <Menu withinPortal>
                      <Menu.Target>
                        <Button
                          variant="subtle"
                          size="compact-sm"
                          disabled={disabled}
                          aria-label={tr("整理步骤")}
                        >
                          •••
                        </Button>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          onClick={() =>
                            update(
                              steps.map((s, i) =>
                                i === index
                                  ? {
                                      type: "group",
                                      name: tr("步骤分组"),
                                      collapsed: false,
                                      steps: [s],
                                    }
                                  : s,
                              ),
                            )
                          }
                        >
                          {tr("放入新分组")}
                        </Menu.Item>
                        {steps.map(
                          (target, targetIndex) =>
                            target.type === "group" &&
                            targetIndex !== index && (
                              <Menu.Item
                                key={`${prefix}[${String(targetIndex)}]`}
                                onClick={() =>
                                  update(
                                    steps.flatMap((s, i) =>
                                      i === index
                                        ? []
                                        : i === targetIndex && s.type === "group"
                                          ? [{ ...s, steps: [...s.steps, step] }]
                                          : [s],
                                    ),
                                  )
                                }
                              >
                                {tr("移入 {{name}}", { name: target.name })}
                              </Menu.Item>
                            ),
                        )}
                        {onExtract && (
                          <Menu.Item onClick={() => onExtract(index)}>{tr("移到外层")}</Menu.Item>
                        )}
                        {step.type === "group" && (
                          <Menu.Item
                            onClick={() =>
                              update(steps.flatMap((s, i) => (i === index ? step.steps : [s])))
                            }
                          >
                            {tr("解散分组（保留内容）")}
                          </Menu.Item>
                        )}
                      </Menu.Dropdown>
                    </Menu>
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
                  {step.type === "group" && (
                    <StepGroup
                      dropPath={[...dragPath, index, "steps"]}
                      disabled={disabled}
                      name={step.name}
                      count={step.steps.length}
                      collapsed={step.collapsed}
                      active={activeWithin(`${path}.steps`)}
                    >
                      {nested("steps", step.steps)}
                    </StepGroup>
                  )}
                  {step.type === "if" && (
                    <div className="branches">
                      <StepGroup
                        dropPath={[...dragPath, index, "then"]}
                        disabled={disabled}
                        name={tr("成立")}
                        collapsed
                        active={activeWithin(`${path}.then`)}
                      >
                        {nested("then", step.then)}
                      </StepGroup>
                      <StepGroup
                        dropPath={[...dragPath, index, "else"]}
                        disabled={disabled}
                        name={tr("否则")}
                        collapsed
                        active={activeWithin(`${path}.else`)}
                      >
                        {nested("else", step.else ?? [])}
                      </StepGroup>
                    </div>
                  )}
                  {step.type === "while" && (
                    <div className="branches">
                      <StepGroup
                        dropPath={[...dragPath, index, "body"]}
                        disabled={disabled}
                        name={tr("循环")}
                        active={activeWithin(`${path}.body`)}
                      >
                        {nested("body", step.body)}
                      </StepGroup>
                    </div>
                  )}
                </article>
              )}
            </SortableRow>
          );
        })}
      </SortableContext>
      <FieldDrop
        path={dragPath}
        disabled={disabled}
        action={
          <Button
            variant="light"
            className="add-step"
            type="button"
            disabled={disabled}
            onClick={() => setAdding(true)}
          >
            {tr("＋ 添加步骤")}
          </Button>
        }
      />
      {adding && (
        <StepDialog
          mode="add"
          step={newStep("set")}
          disabled={disabled}
          onClose={() => setAdding(false)}
          onSave={async (step) => {
            await onChange([...steps, step]);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}
