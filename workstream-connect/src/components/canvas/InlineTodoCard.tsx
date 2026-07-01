import { useEffect, useRef, useState } from "react";
import { Check, Link2Off, Maximize2, Plus, Trash2 } from "lucide-react";
import { useRouteContext } from "@tanstack/react-router";
import { TaskMentionDropdown } from "@/components/canvas/TaskMentionDropdown";
import {
  appendTodoItem,
  deleteTodoBranch,
  getTodoDepth,
  indentTodoItem,
  outdentTodoItem,
  renameTodoItem,
  toggleTodoItemChecked,
  type TodoBlockContent,
} from "@/lib/notes-model";
import {
  createTodoTaskFromTitle,
  searchTasksForTodo,
  type NoteTaskResult,
} from "backend/api/services/notes.service";

type InlineTodoCardProps = {
  blockId: string;
  content: TodoBlockContent;
  onContentChange: (blockId: string, content: TodoBlockContent) => void;
  onTaskStatusChange: (
    taskId: string,
    taskType: "personal" | "org",
    status: "queued" | "in_progress" | "completed",
  ) => void;
  onRequestUnanchor: (blockId: string) => void;
  onOpenPopup: (blockId: string) => void;
};

function formatDueDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}

export function InlineTodoCard({
  blockId,
  content: externalContent,
  onContentChange,
  onTaskStatusChange,
  onRequestUnanchor,
  onOpenPopup,
}: InlineTodoCardProps) {
  const { profile } = useRouteContext({ from: "/_authenticated" });
  const [content, setContent] = useState<TodoBlockContent>(externalContent);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionItemId, setMentionItemId] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<NoteTaskResult[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setContent(externalContent);
  }, [externalContent]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

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
      onContentChange(blockId, nextContent);
    }, 250);
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
      data-anchored-todo
      className="nopan nodrag my-2 rounded-xl border border-border bg-background/90 shadow-sm"
      contentEditable={false}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Lista ancorada
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onRequestUnanchor(blockId)}
            className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-surface hover:text-foreground"
          >
            <span className="inline-flex items-center gap-1">
              <Link2Off className="h-3 w-3" />
              Soltar
            </span>
          </button>
          <button
            onClick={() => onOpenPopup(blockId)}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-surface hover:text-foreground"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="relative space-y-1 px-2 py-2">
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
                className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-surface"
                style={{ paddingLeft: `${depth * 18 + 8}px` }}
              >
                <button
                  onClick={() => {
                    const nextItems = toggleTodoItemChecked(content.items, item.id);
                    const current = content.items.find((entry) => entry.id === item.id);
                    const next = nextItems.find((entry) => entry.id === item.id);
                    if (current?.task_id && current.task_type && next && current.checked !== next.checked) {
                      onTaskStatusChange(
                        current.task_id,
                        current.task_type,
                        next.checked ? "completed" : "in_progress",
                      );
                    }
                    updateContent({ ...content, items: nextItems });
                  }}
                  disabled={lockedByAncestor}
                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-border text-[10px] text-copper disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {item.checked ? <Check className="h-3 w-3" /> : null}
                </button>
                <button
                  onClick={() => updateContent({ ...content, items: outdentTodoItem(content.items, item.id) })}
                  className="rounded px-1 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  {"<"}
                </button>
                <button
                  onClick={() => updateContent({ ...content, items: indentTodoItem(content.items, item.id) })}
                  className="rounded px-1 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  {">"}
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
                      setMentionItemId((current) => (current === item.id ? null : current));
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
                  className={`flex-1 bg-transparent text-sm focus:outline-none ${
                    item.checked ? "text-muted-foreground line-through" : "text-foreground"
                  }`}
                />
                <span className="min-w-10 text-right text-[11px] text-muted-foreground">
                  {formatDueDate(item.due_date)}
                </span>
                <button
                  onClick={() => updateContent({ ...content, items: deleteTodoBranch(content.items, item.id) })}
                  className="hidden h-5 w-5 items-center justify-center rounded text-muted-foreground group-hover:flex hover:bg-background hover:text-foreground"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}

        <button
          onClick={() => updateContent({ ...content, items: appendTodoItem(content.items, null) })}
          className="mt-2 flex w-full items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-surface hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          Adicionar item
        </button>
      </div>
    </div>
  );
}
