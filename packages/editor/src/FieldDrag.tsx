import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useReducedMotion } from "@mantine/hooks";
import { type ReactNode, useRef } from "react";
import { DragFeedback } from "./Sortable";

const collision: CollisionDetection = (args) => {
  const candidates = {
    ...args,
    droppableContainers: args.droppableContainers.filter((item) => {
      const source = JSON.parse(String(args.active.id)) as DragPath;
      const target = JSON.parse(String(item.id).replace(/^(into|end):/, "")) as DragPath;
      return !(target.length >= source.length && source.every((part, i) => target[i] === part));
    }),
  };
  const hits = pointerWithin(candidates);
  if (!hits.length) return args.pointerCoordinates ? [] : closestCenter(candidates);
  hits.sort((a, b) => {
    const left = args.droppableRects.get(a.id)!;
    const right = args.droppableRects.get(b.id)!;
    return left.width * left.height - right.width * right.height;
  });
  const hit = hits[0];
  const item = candidates.droppableContainers.find((entry) => entry.id === hit.id);
  const intoPath = item?.data.current?.intoPath;
  const rect = args.droppableRects.get(hit.id);
  if (
    intoPath &&
    rect &&
    args.pointerCoordinates &&
    args.pointerCoordinates.y > rect.top + 20 &&
    args.pointerCoordinates.y < rect.bottom - 20
  ) {
    const intoId = `into:${JSON.stringify(intoPath)}`;
    if (candidates.droppableContainers.some((entry) => entry.id === intoId))
      return [{ id: intoId }];
  }
  // A condition card's middle is not a sibling insertion slot: its two
  // branches are explicit targets. Do not push them away while approaching.
  if (
    item?.data.current?.container &&
    rect &&
    args.pointerCoordinates &&
    args.pointerCoordinates.y > rect.top + 20 &&
    args.pointerCoordinates.y < rect.bottom - 20
  )
    return [];
  return hits;
};

export type DragPath = (number | string)[];

export function FieldDrag({
  children,
  disabled,
  onMove,
}: {
  children: ReactNode;
  disabled: boolean;
  onMove: (from: DragPath, parent: DragPath, index: number) => void;
}) {
  const settling = useRef<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={(args) =>
        settling.current ? [{ id: settling.current }] : collision(args)
      }
      onDragStart={() => {
        settling.current = null;
      }}
      onDragCancel={() => {
        settling.current = null;
      }}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      cancelDrop={async ({ over }) => {
        const preview = previewRef.current;
        const scope = scopeRef.current;
        if (!over || !preview || !scope) return true;
        // Animate while the drag preview and its target slot still exist.
        // Applying the move afterwards avoids looking up a recycled positional id.
        const slot = scope.querySelector<HTMLElement>("[data-drag-slot]");
        const source = scope.querySelector<HTMLElement>("[data-drag-source]");
        const destination = slot ?? source;
        settling.current = String(over.id);
        if (destination && !reducedMotion) {
          const start = preview.getBoundingClientRect();
          // Cross-list placement removes the old gap before measuring the final landing.
          // Freeze hit testing during settlement so this reflow cannot change the chosen target.
          const previousDisplay = source?.style.display ?? "";
          if (slot && source) source.style.display = "none";
          const end = destination.getBoundingClientRect();
          const animation = preview.animate(
            [
              { transform: "translate(0, 0)" },
              { transform: `translate(${end.left - start.left}px, ${end.top - start.top}px)` },
            ],
            { duration: 180, easing: "ease-out", fill: "forwards" },
          );
          await animation.finished.catch(() => {});
          if (source) source.style.display = previousDisplay;
        }
        return false;
      }}
      onDragEnd={({ active, over }) => {
        settling.current = null;
        if (disabled || !over || active.id === over.id) return;
        const from = JSON.parse(String(active.id)) as DragPath;
        if (/^(into|end):/.test(String(over.id)))
          onMove(
            from,
            JSON.parse(String(over.id).slice(String(over.id).indexOf(":") + 1)),
            Number.MAX_SAFE_INTEGER,
          );
        else {
          const target = JSON.parse(String(over.id)) as DragPath;
          const below =
            (active.rect.current.translated?.top ?? 0) +
              (active.rect.current.translated?.height ?? 0) / 2 >
            over.rect.top + over.rect.height / 2;
          const sameList =
            from.length === target.length &&
            from.slice(0, -1).every((part, i) => target[i] === part);
          const after = sameList ? Number(from.at(-1)) < Number(target.at(-1)) : below;
          onMove(from, target.slice(0, -1), Number(target.at(-1)) + (after ? 1 : 0));
        }
      }}
    >
      <div ref={scopeRef} className="drag-scope">
        {children}
      </div>
      <DragFeedback previewRef={previewRef} />
    </DndContext>
  );
}

export function FieldDrop({
  path,
  disabled,
  children,
  action,
}: {
  path: DragPath;
  disabled: boolean;
  action?: ReactNode;
  children?: (ref: (node: HTMLElement | null) => void, over: boolean) => ReactNode;
}) {
  const { active, over } = useDndContext();
  const source = active ? (JSON.parse(String(active.id)) as DragPath) : [];
  const invalid = Boolean(
    active && path.length >= source.length && source.every((part, i) => path[i] === part),
  );
  const { setNodeRef, isOver } = useDroppable({
    id: `${children ? "into" : "end"}:${JSON.stringify(path)}`,
    disabled: disabled || invalid,
  });
  if (children) return children(setNodeRef, isOver);
  const preview =
    active && !invalid && !disabled && (isOver || over?.id === `into:${JSON.stringify(path)}`);
  return (
    <div ref={setNodeRef} className={`field-drop-target ${preview ? "has-preview" : ""}`}>
      <div className="field-drop-action">{action}</div>
      {preview && (
        <div className={`field-drop-end ${isOver ? "is-over" : ""}`}>
          <div className="drag-placeholder" data-drag-slot aria-hidden="true">
            {String(active.data.current?.label ?? "")}
          </div>
        </div>
      )}
    </div>
  );
}
