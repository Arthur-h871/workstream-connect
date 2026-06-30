import { createFileRoute } from "@tanstack/react-router";
import { Plus, GripVertical, ChevronDown, Trash2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  getPersonalTasks,
  createPersonalTask,
  updatePersonalTask,
  reorderPersonalTasks,
  deletePersonalTask,
  type PersonalTask,
} from "backend/api/services/tarefas.service";

export const Route = createFileRoute("/_authenticated/tarefas")({
  staticData: {
    shellTitle: "Minhas Tarefas",
  },
  head: () => ({
    meta: [
      { title: "Minhas Tarefas — Marco" },
      { name: "description", content: "Suas tarefas pessoais." },
    ],
  }),
  loader: async ({ context }) => {
    const tasks = await getPersonalTasks(context.profile.id);
    return { tasks, userId: context.profile.id };
  },
  component: Tarefas,
});

const STATUS_LABELS: Record<PersonalTask["status"], string> = {
  queued: "Fila",
  in_progress: "Em progresso",
  completed: "Concluída",
};

const STATUS_CLASSES: Record<PersonalTask["status"], string> = {
  queued: "bg-border text-muted-foreground",
  in_progress: "bg-copper-soft text-copper",
  completed: "bg-[#10B98119] text-[#10B981]",
};

function Tarefas() {
  const { tasks: initial, userId } = Route.useLoaderData();
  const [tasks, setTasks] = useState<PersonalTask[]>(initial);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    if (adding) addInputRef.current?.focus();
  }, [adding]);

  async function handleCreate() {
    const title = newTitle.trim();
    if (!title) {
      setAdding(false);
      return;
    }
    try {
      const task = await createPersonalTask(userId, title);
      if (task) setTasks((prev) => [...prev, task]);
      setNewTitle("");
    } catch {
      toast.error("Erro ao criar tarefa.");
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tasks.findIndex((t) => t.id === active.id);
    const newIndex = tasks.findIndex((t) => t.id === over.id);
    const reordered = arrayMove(tasks, oldIndex, newIndex);
    const previous = tasks;

    setTasks(reordered);
    try {
      await reorderPersonalTasks(reordered.map((t, i) => ({ id: t.id, priority: i })));
    } catch {
      setTasks(previous);
      toast.error("Erro ao salvar nova ordem.");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deletePersonalTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (expanded === id) setExpanded(null);
    } catch {
      toast.error("Erro ao excluir tarefa.");
    }
  }

  function updateLocal(id: string, fields: Partial<PersonalTask>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } : t)));
  }

  return (
    <div className="relative">
      <p className="mb-6 text-sm text-muted-foreground">Arraste para reordenar por prioridade.</p>

      {adding && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-copper bg-surface px-3 py-3">
          <GripVertical className="h-4 w-4 text-muted-foreground/30" />
          <input
            ref={addInputRef}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setAdding(false);
                setNewTitle("");
              }
            }}
            onBlur={() => {
              if (!newTitle.trim()) setAdding(false);
            }}
            placeholder="Nome da tarefa…"
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          <span className="text-xs text-muted-foreground">↵ criar · Esc cancelar</span>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {tasks.length === 0 && !adding ? (
              <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-12 text-center text-sm text-muted-foreground">
                Nenhuma tarefa criada
              </div>
            ) : (
              tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  expanded={expanded === task.id}
                  onToggle={() => setExpanded(expanded === task.id ? null : task.id)}
                  onUpdate={updateLocal}
                  onDelete={handleDelete}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>

      <button
        onClick={() => setAdding(true)}
        className="fixed bottom-8 right-8 flex h-12 w-12 items-center justify-center rounded-full bg-copper text-primary-foreground shadow-lg hover:opacity-90"
        aria-label="Adicionar tarefa"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}

function TaskRow({
  task,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
}: {
  task: PersonalTask;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, fields: Partial<PersonalTask>) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleTitleChange(value: string) {
    onUpdate(task.id, { title: value });
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(() => {
      updatePersonalTask(task.id, { title: value }).catch(() =>
        toast.error("Erro ao salvar título."),
      );
    }, 800);
  }

  function handleDescChange(value: string) {
    onUpdate(task.id, { description: value });
    if (descTimerRef.current) clearTimeout(descTimerRef.current);
    descTimerRef.current = setTimeout(() => {
      updatePersonalTask(task.id, { description: value }).catch(() =>
        toast.error("Erro ao salvar descrição."),
      );
    }, 800);
  }

  async function handleStatusChange(status: PersonalTask["status"]) {
    const previous = task.status;
    onUpdate(task.id, { status });
    try {
      await updatePersonalTask(task.id, { status });
    } catch {
      onUpdate(task.id, { status: previous });
      toast.error("Erro ao atualizar status.");
    }
  }

  async function handleDueDateChange(due_date: string) {
    const value = due_date || null;
    const previous = task.due_date;
    onUpdate(task.id, { due_date: value });
    try {
      await updatePersonalTask(task.id, { due_date: value });
    } catch {
      onUpdate(task.id, { due_date: previous });
      toast.error("Erro ao salvar prazo.");
    }
  }

  const done = task.status === "completed";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group overflow-hidden rounded-lg border border-border bg-surface"
    >
      <div className="flex items-center gap-2 px-3 py-3">
        <button
          className="cursor-grab touch-none text-muted-foreground/0 transition-opacity group-hover:text-muted-foreground"
          aria-label="Arrastar para reordenar"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button onClick={onToggle} className="flex flex-1 items-center gap-3 text-left">
          <span className={`text-sm ${done ? "text-muted-foreground line-through" : ""}`}>
            {task.title}
          </span>
        </button>

        {task.due_date && (
          <span className="rounded bg-copper-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-copper">
            {task.due_date}
          </span>
        )}

        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STATUS_CLASSES[task.status]}`}
        >
          {STATUS_LABELS[task.status]}
        </span>

        <button onClick={onToggle}>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-border px-5 py-4">
          <div>
            <p className="section-label mb-2">Título</p>
            <input
              value={task.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-copper focus:outline-none"
            />
          </div>

          <div>
            <p className="section-label mb-2">Descrição</p>
            <textarea
              rows={3}
              value={task.description ?? ""}
              onChange={(e) => handleDescChange(e.target.value)}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-copper focus:outline-none"
            />
          </div>

          <div className="flex items-end gap-4">
            <div className="flex-1">
              <p className="section-label mb-2">Status</p>
              <select
                value={task.status}
                onChange={(e) => handleStatusChange(e.target.value as PersonalTask["status"])}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-copper focus:outline-none"
              >
                <option value="queued">Fila</option>
                <option value="in_progress">Em progresso</option>
                <option value="completed">Concluída</option>
              </select>
            </div>

            <div className="flex-1">
              <p className="section-label mb-2">Prazo</p>
              <input
                type="date"
                value={task.due_date ?? ""}
                onChange={(e) => handleDueDateChange(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-copper focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => onDelete(task.id)}
              className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
            >
              <Trash2 className="h-3 w-3" /> Excluir tarefa
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
