"use client";

import { useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/** Maniglia da trascinare (mouse, dito o tastiera: spazio e frecce) */
export type DragHandle = React.ReactNode;

/**
 * Elenco riordinabile trascinando la maniglia ⋮⋮ (al posto delle frecce su/giù).
 * L'ordine nuovo si vede subito; `onReorder` riceve gli id nel nuovo ordine e lo salva.
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  disabled = false,
  className,
  as: Tag = "ul",
}: {
  items: T[];
  onReorder: (ids: string[]) => void | Promise<unknown>;
  /** il contenuto della voce; `handle` va messo dove si vuole la maniglia */
  renderItem: (item: T, handle: DragHandle) => React.ReactNode;
  disabled?: boolean;
  className?: string;
  as?: "ul" | "div";
}) {
  // ordine mostrato mentre si salva (torna quello del server quando cambia l'elenco)
  const [local, setLocal] = useState<string[] | null>(null);
  // si confronta l'ordine degli id (l'elenco può essere un array nuovo a ogni disegno)
  const signature = items.map((i) => i.id).join(",");
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setLocal(null);
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered = local ? local.map((id) => byId.get(id)).filter((i): i is T => !!i) : items;
  // gli elementi nuovi non ancora nell'ordine locale restano in fondo
  if (local) for (const i of items) if (!local.includes(i.id)) ordered.push(i);

  const sensors = useSensors(
    // basta un piccolo movimento: i clic sulla maniglia non partono per sbaglio
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = ordered.map((i) => i.id);
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    setLocal(next);
    onReorder(next);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ordered.map((i) => i.id)} strategy={verticalListSortingStrategy} disabled={disabled}>
        <Tag className={className}>
          {ordered.map((item) => (
            <SortableItem key={item.id} id={item.id} as={Tag === "ul" ? "li" : "div"} disabled={disabled}>
              {(handle) => renderItem(item, handle)}
            </SortableItem>
          ))}
        </Tag>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({ id, as: Tag, disabled, children }: { id: string; as: "li" | "div"; disabled: boolean; children: (handle: DragHandle) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const handle = disabled ? null : (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      className="grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground active:cursor-grabbing"
      aria-label="Trascina per spostare"
      title="Trascina per spostare"
    >
      <GripVertical className="size-4" />
    </button>
  );
  return (
    <Tag
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("list-none", isDragging && "relative z-10 opacity-80 shadow-2xl")}
    >
      {children(handle)}
    </Tag>
  );
}
