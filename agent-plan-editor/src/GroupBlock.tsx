import { type ReactNode, type Ref, useEffect, useId, useState } from "react";
import { tr } from "./i18n";
import { MarkdownText } from "./MarkdownText";
import { Icon } from "./ui";

/** Opening a group is view state; the saved collapsed flag is only its default. */
export function GroupBlock({
  name,
  description,
  collapsed = false,
  active = false,
  count,
  leading,
  onEdit,
  editDisabled,
  headingRef,
  dropRef,
  dropActive,
  actions,
  children,
}: {
  name: string;
  description?: string;
  collapsed?: boolean;
  active?: boolean | string;
  count?: number;
  leading?: ReactNode;
  onEdit?: () => void;
  editDisabled?: boolean;
  headingRef?: Ref<HTMLDivElement>;
  dropRef?: Ref<HTMLElement>;
  dropActive?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!collapsed || Boolean(active));
  const id = useId();
  useEffect(() => {
    setOpen(!collapsed);
  }, [collapsed]);
  useEffect(() => {
    if (active || !collapsed) setOpen(true);
  }, [active, collapsed]);
  return (
    <section ref={dropRef} className="group-block">
      <div ref={headingRef} className={`group-heading ${dropActive ? "is-over" : ""}`}>
        {leading}
        <button
          type="button"
          className={`group-toggle ${onEdit ? "group-fold-button" : ""}`}
          aria-label={onEdit ? tr(open ? "折叠 {{name}}" : "展开 {{name}}", { name }) : undefined}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? "down" : "chevronRight"} />
          {!onEdit && (
            <>
              <strong>{name}</strong>
              {count !== undefined && <span className="muted">{count}</span>}
            </>
          )}
          <span className="sr-only">{tr(open ? "折叠" : "展开")}</span>
        </button>
        {onEdit && (
          <button
            type="button"
            className="group-edit-title"
            disabled={editDisabled}
            onClick={onEdit}
            aria-label={tr("编辑 {{name}}", { name })}
          >
            <strong>{name}</strong>
            {count !== undefined && <span className="muted">{count}</span>}
          </button>
        )}
        {actions}
      </div>
      {description && <MarkdownText className="group-description muted" source={description} />}
      <div id={id} hidden={!open} className="group-content" onInvalidCapture={() => setOpen(true)}>
        {children}
      </div>
    </section>
  );
}
