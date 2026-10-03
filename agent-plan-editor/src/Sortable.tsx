import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
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
import type { ReactNode } from "react";
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
    </DndContext>
  );
}
export { arrayMove };
export function SortableRow({
  id,
  disabled,
  label,
  children,
}: {
  id: string;
  disabled: boolean;
  label: string;
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
  } = useSortable({ id, disabled });
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
  return (
    <div
      ref={setNodeRef}
      className={`sortable-row ${isDragging ? "dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {typeof children !== "function" && handle}

      <div className="sortable-content">
        {typeof children === "function" ? children(handle) : children}
      </div>
    </div>
  );
}
