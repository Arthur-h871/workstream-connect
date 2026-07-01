import { memo, useEffect, useRef, useState } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Link2Off,
  Maximize2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useRouteContext } from "@tanstack/react-router";
import { TaskMentionDropdown } from "@/components/canvas/TaskMentionDropdown";
import { CanvasConnectionHandles } from "@/components/canvas/CanvasConnectionHandles";
import {
  appendTodoItem,
  createConnectionHandleId,
  deleteTodoBranch,
  getTodoDepth,
  indentTodoItem,
  outdentTodoItem,
  renameTodoItem,
  toggleTodoItemChecked,
  type TodoBlockContent,
  type TodoItem,
} from "@/lib/notes-model";
import {
  createTodoTaskFromTitle,
  searchTasksForTodo,
  type NoteTaskResult,
} from "backend/api/services/notes.service";

export type TodoNodeData = {
  content: TodoBlockContent;
  onDelete: (id: string) => void;
  onContentChange: (blockId: string, content: TodoBlockContent) => void;
  onTaskStatusChange: (
    taskId: string,
    taskType: "personal" | "org",
    status: "queued" | "in_progress" | "completed",
  ) => void;
  onOpenPopup: (id: string) => void;
  onResizeEnd: (id: string, width: number, height: number) => void;
  onRequestUnanchor: (blockId: string) => void;
};

function formatDueDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}

export const TodoListNode = memo(function TodoListNode({ id, data, selected }: NodeProps) {
  const typedData = data as unknown as TodoNodeData;
  const { profile } = useRouteContext({ from: "/_authenticated" });
  const [content, setContent] = useState<TodoBlockContent>(typedData.content);
  const [mentionQuery, setMentionQuery] = useState<string>("");
  const [mentionItemId, setMentionItemId] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<NoteTaskResult[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setContent(typedData.content);
  }, [typedData.content]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const header = headerRef.current;
    const body = bodyRef.current;
    if (!root || !header || !body) return;

    const currentHeight = root.getBoundingClientRect().height;
    const targetHeight = Math.max(
      header.getBoundingClientRect().height + body.scrollHeight,
      160,
    );

    if (targetHeight > currentHeight + 1) {
      typedData.onResizeEnd(id, root.getBoundingClientRect().width, targetHeight);
    }
  }, [content, id, mentionItemId, typedData]);

  useEffect(() => {
    if (!mentionItemId) return;
    setMentionLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchTasksForTodo(
          profile.id,
          profile.organization_id ?? "",
          mentionQuery,
        );
        setMentionResults(results);
      } catch {
        setMentionResults([]);
      } finally {
        setMentionLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [mentionItemId, mentionQuery, profile.id, profile.organization_id]);

  function scheduleSave(nextContent: TodoBlockContent) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      typedData.onContentChange(id, nextContent);
    }, 350);
  }

  function updateContent(nextContent: TodoBlockContent) {
    setContent(nextContent);
    scheduleSave(nextContent);
  }

  async function bindItemToTask(itemId: string, task: NoteTaskResult) {
    const nextContent = {
      ...content,
      items: content.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              text: task.title,
              task_id: task.id,
              task_type: task.type,
              due_date: task.due_date,
              checked: task.status === "completed",
              detached_from_task: false,
            }
          : item,
      ),
    };
    setMentionItemId(null);
    setMentionQuery("");
    updateContent(nextContent);
  }

  async function handleSubmitItem(itemId: string, rawText: string) {
    const text = rawText.trim();
    if (!text) return;

    const exact = mentionResults.find((result) => result.title.toLowerCase() === text.toLowerCase());
    if (exact) {
      await bindItemToTask(itemId, exact);
      return;
    }

    const created = await createTodoTaskFromTitle(profile.id, text);
    await bindItemToTask(itemId, created);
  }

  return (
    <div
      ref={rootRef}
      className={`flex h-full w-full flex-col rounded-lg border bg-surface shadow-sm ${
        selected ? "border-copper" : "border-border"
      }`}
    >
      <NodeResizer
        minWidth={280}
        minHeight={160}
        isVisible={selected}
        onResizeEnd={(_, params) => typedData.onResizeEnd(id, params.width, params.height)}
      />
      <CanvasConnectionHandles nodeId={id} />

      <div
        ref={headerRef}
        className="flex items-center justify-between border-b border-border px-3 py-1.5 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-1.5">
          <CheckSquare className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Lista
          </span>
          {content.anchor.textBlockId && (
            <button
              onClick={() => typedData.onRequestUnanchor(id)}
              className="nopan nodrag ml-2 flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-background hover:text-foreground"
            >
              <Link2Off className="h-3 w-3" />
              Soltar
            </button>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => typedData.onOpenPopup(id)}
            className="nopan nodrag flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
          <button
            onClick={() => typedData.onDelete(id)}
            className="nopan nodrag flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div ref={bodyRef} className="nopan nodrag relative flex-1 overflow-visible px-2 py-2">
        {mentionItemId && (
          <TaskMentionDropdown
            results={mentionResults}
            loading={mentionLoading}
            onSelect={(task) => bindItemToTask(mentionItemId, task)}
            onClose={() => setMentionItemId(null)}
          />
        )}

        {content.items
          .slice()
          .sort((left, right) => left.order - right.order)
          .map((item) => {
            const depth = getTodoDepth(content.items, item.id);
            const lockedByAncestor = item.checked && item.parent_item_id !== null;

            return (
              <div
                key={item.id}
                className="group relative flex items-center gap-2 rounded px-1 py-1 hover:bg-background"
                style={{ paddingLeft: `${depth * 20 + 4}px` }}
              >
                <Handle
                  id={createConnectionHandleId("todo_item", item.id, "left")}
                  type="target"
                  position={Position.Left}
                  style={{ top: "50%", left: depth * 20 - 4 }}
                  className="h-2.5 w-2.5 rounded-full border border-copper bg-background"
                />
                <Handle
                  id={createConnectionHandleId("todo_item", item.id, "left")}
                  type="source"
                  position={Position.Left}
                  style={{ top: "50%", left: depth * 20 - 4 }}
                  className="h-2.5 w-2.5 rounded-full border border-copper bg-background"
                />
                <button className="nopan nodrag text-muted-foreground hover:text-foreground">
                  <GripVertical className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    const nextItems = toggleTodoItemChecked(content.items, item.id);
                    const current = content.items.find((entry) => entry.id === item.id);
                    const next = nextItems.find((entry) => entry.id === item.id);
                    if (current?.task_id && current.task_type && next && current.checked !== next.checked) {
                      typedData.onTaskStatusChange(
                        current.task_id,
                        current.task_type,
                        next.checked ? "completed" : "in_progress",
                      );
                    }
                    updateContent({ ...content, items: nextItems });
                  }}
                  disabled={lockedByAncestor}
                  className="nopan nodrag flex-shrink-0 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {item.checked ? (
                    <CheckSquare className="h-4 w-4 text-copper" />
                  ) : (
                    <div className="h-4 w-4 rounded border border-current" />
                  )}
                </button>
                <button
                  onClick={() => updateContent({ ...content, items: outdentTodoItem(content.items, item.id) })}
                  className="nopan nodrag rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <button
                  onClick={() => updateContent({ ...content, items: indentTodoItem(content.items, item.id) })}
                  className="nopan nodrag rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
                <input
                  type="text"
                  value={item.text}
                  onFocus={() => {
                    setMentionItemId(item.id);
                    setMentionQuery(item.text);
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      if (mentionItemId === item.id) setMentionItemId(null);
                    }, 150);
                  }}
                  onKeyDown={async (event) => {
                    if (event.key === "Tab") {
                      event.preventDefault();
                      updateContent({
                        ...content,
                        items: event.shiftKey
                          ? outdentTodoItem(content.items, item.id)
                          : indentTodoItem(content.items, item.id),
                      });
                    }

                    if (event.key === "Enter") {
                      event.preventDefault();
                      await handleSubmitItem(item.id, item.text);
                      updateContent({ ...content, items: appendTodoItem(content.items, item.id) });
                    }
                  }}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setMentionItemId(item.id);
                    setMentionQuery(nextValue);
                    updateContent({
                      ...content,
                      items: renameTodoItem(content.items, item.id, nextValue),
                    });
                  }}
                  className={`nopan nodrag flex-1 bg-transparent text-sm focus:outline-none ${
                    item.checked ? "text-muted-foreground line-through" : "text-foreground"
                  }`}
                />
                <span className="min-w-10 text-right text-[11px] text-muted-foreground">
                  {formatDueDate(item.due_date)}
                </span>
                <button
                  onClick={() => updateContent({ ...content, items: deleteTodoBranch(content.items, item.id) })}
                  className="nopan nodrag hidden h-4 w-4 flex-shrink-0 items-center justify-center text-muted-foreground group-hover:flex hover:text-foreground"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                <Handle
                  id={createConnectionHandleId("todo_item", item.id, "right")}
                  type="target"
                  position={Position.Right}
                  style={{ top: "50%", right: 0 }}
                  className="h-2.5 w-2.5 rounded-full border border-copper bg-background"
                />
                <Handle
                  id={createConnectionHandleId("todo_item", item.id, "right")}
                  type="source"
                  position={Position.Right}
                  style={{ top: "50%", right: 0 }}
                  className="h-2.5 w-2.5 rounded-full border border-copper bg-background"
                />
              </div>
            );
          })}

        <button
          onClick={() => updateContent({ ...content, items: appendTodoItem(content.items, null) })}
          className="nopan nodrag mt-2 flex w-full items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          Adicionar item
        </button>
      </div>
    </div>
  );
});

export type { TodoItem };
