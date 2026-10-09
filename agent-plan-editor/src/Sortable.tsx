import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDndContext,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ActionIcon } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import type { ReactNode, Ref } from "react";
import { createPortal } from "react-dom";
import { tr } from "./i18n";
import { Icon } from "./ui";

export function SortableList({
  ids,
  onMove,
  children,
}: {
  ids: string[];
  onMove: (from: number, to: number) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id) {
          const from = ids.indexOf(String(active.id)),
            to = ids.indexOf(String(over.id));
          if (from >= 0 && to >= 0) onMove(from, to);
        }
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
      <DragFeedback />
    </DndContext>
  );
}
export { arrayMove };

/** One non-interactive preview shared by variable and step drag contexts. */
export function DragFeedback({ previewRef }: { previewRef?: Ref<HTMLDivElement> }) {
  const { active } = useDndContext();
  return createPortal(
    <DragOverlay adjustScale={false} dropAnimation={null}>
      {active ? (
        <div ref={previewRef} className="drag-preview" aria-hidden="true">
          <Icon name="grip" />
          <strong>{String(active.data.current?.label ?? "")}</strong>
        </div>
      ) : null}
    </DragOverlay>,
    document.body,
  );
}

export function SortableRow({
  id,
  disabled,
  label,
  previewOrder = true,
  intoPath,
  container = false,
  children,
}: {
  id: string;
  disabled: boolean;
  label: string;
  previewOrder?: boolean;
  intoPath?: (number | string)[];
  container?: boolean;
  children: ReactNode | ((handle: ReactNode) => ReactNode);
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
    active,
    over,
  } = useSortable({ id, disabled, data: { label, intoPath, container } });
  const reducedMotion = useReducedMotion();
  const sameList =
    active?.data.current?.sortable?.containerId === over?.data.current?.sortable?.containerId;
  const showPreview = previewOrder || sameList;
  const crossPreview = active && !sameList;
  const targeted = active && !isDragging && over?.id === id;
  const after = sameList
    ? active?.data.current?.sortable?.index < over?.data.current?.sortable?.index
    : (active?.rect.current.translated?.top ?? 0) +
        (active?.rect.current.translated?.height ?? 0) / 2 >
      (over?.rect.top ?? 0) + (over?.rect.height ?? 0) / 2;

  const handle = (
    <ActionIcon
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      disabled={disabled}
      variant="transparent"
      className="drag-handle"
      styles={{ root: { background: "transparent", border: 0 } }}
      aria-label={tr("拖动 {{name}}", { name: label })}
    >
      <Icon name="grip" />
    </ActionIcon>
  );
  const placeholder = (
    <div className="drag-placeholder" data-drag-slot aria-hidden="true">
      {String(active?.data.current?.label ?? "")}
    </div>
  );
  return (
    <div
      ref={setNodeRef}
      data-drag-source={isDragging || undefined}
      className={`sortable-row ${crossPreview && targeted ? "cross-drop-target" : ""} ${isDragging ? (crossPreview ? "dragging drag-source-away" : "dragging") : ""} ${targeted ? (after ? "drop-after" : "drop-before") : ""}`}
      style={{
        transform: CSS.Transform.toString(showPreview ? transform : null),
        transition: reducedMotion ? undefined : transition,
      }}
    >
      {crossPreview && targeted && !after && placeholder}
      {typeof children !== "function" && handle}

      <div className="sortable-content">
        {typeof children === "function" ? children(handle) : children}
      </div>
      {crossPreview && targeted && after && placeholder}
    </div>
  );
}
