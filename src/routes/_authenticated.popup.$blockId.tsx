import { createFileRoute } from "@tanstack/react-router"
import { useState, useRef, useEffect } from "react"
import { X, FileText, CheckSquare, Link as LinkIcon, Plus, Trash2 } from "lucide-react"
import { getBlock, updateBlock, updateTaskStatus } from "backend/api/services/notes.service"
import type { TodoItem } from "@/components/canvas/TodoListNode"
import type { TaskStatus } from "@/components/canvas/TaskRefNode"

export const Route = createFileRoute("/_authenticated/popup/$blockId")({
  loader: async ({ params }) => {
    const block = await getBlock(params.blockId)
    if (!block) throw new Error("Block not found")
    return { block }
  },
  component: PopupEditor,
})

const BROADCAST_CHANNEL = "note-popups"

const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: "Na fila",
  in_progress: "Em andamento",
  completed: "Concluída",
}

function PopupEditor() {
  const { block } = Route.useLoaderData()
  const c = block.content as Record<string, unknown>
  const [text, setText] = useState<string>((c.text as string) ?? "")
  const [items, setItems] = useState<TodoItem[]>((c.items as TodoItem[]) ?? [])
  const [hasChanges, setHasChanges] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)

  const blockType = block.type
  const title =
    blockType === "task_ref"
      ? ((c.title as string) ?? "Tarefa")
      : blockType === "todo"
        ? "Lista"
        : "Nota"
  const TypeIcon =
    blockType === "text" ? FileText : blockType === "todo" ? CheckSquare : LinkIcon

  useEffect(() => {
    document.title = `${title} — Marco`
    channelRef.current = new BroadcastChannel(BROADCAST_CHANNEL)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      channelRef.current?.close()
    }
  }, [title])

  function scheduleTextSave(val: string) {
    setHasChanges(true)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      updateBlock(block.id, { content: { text: val } }).catch(console.error)
      channelRef.current?.postMessage({ blockId: block.id, type: "text", text: val })
      setHasChanges(false)
    }, 600)
  }

  function scheduleTodoSave(newItems: TodoItem[]) {
    setHasChanges(true)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      updateBlock(block.id, { content: { items: newItems } }).catch(console.error)
      channelRef.current?.postMessage({ blockId: block.id, type: "todo", items: newItems })
      setHasChanges(false)
    }, 800)
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-muted px-4 py-2.5">
        <TypeIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-sm font-medium text-foreground">{title}</span>
        <div
          title={hasChanges ? "Alterações não salvas" : "Salvo"}
          className={`h-2.5 w-2.5 flex-shrink-0 rounded-full border transition-colors ${
            hasChanges ? "border-copper bg-copper" : "border-muted-foreground/40 bg-transparent"
          }`}
        />
        <button
          onClick={() => window.close()}
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {blockType === "text" && (
          <div className="relative h-full min-h-[320px]">
            {text.length === 0 && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-5 top-4 select-none font-mono text-sm text-muted-foreground"
              >
                Escreva aqui...
              </span>
            )}
            <textarea
              autoFocus
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                scheduleTextSave(e.target.value)
              }}
              className="absolute inset-0 h-full w-full resize-none bg-transparent px-5 py-4 font-mono text-sm leading-relaxed text-foreground focus:outline-none"
            />
          </div>
        )}

        {blockType === "todo" && (
          <div className="flex flex-col gap-0.5 px-4 py-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/60"
              >
                <button
                  onClick={() => {
                    const next = items.map((i) =>
                      i.id === item.id ? { ...i, checked: !i.checked } : i,
                    )
                    setItems(next)
                    if (item.task_id && item.task_type) {
                      updateTaskStatus(
                        item.task_id,
                        item.task_type,
                        !item.checked ? "completed" : "in_progress",
                      ).catch(console.error)
                    }
                    scheduleTodoSave(next)
                  }}
                  className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                >
                  {item.checked ? (
                    <div className="flex h-4 w-4 items-center justify-center rounded border border-copper bg-copper">
                      <svg viewBox="0 0 12 12" fill="none" className="h-2.5 w-2.5 text-white">
                        <path
                          d="M2 6l3 3 5-5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  ) : (
                    <div className="h-4 w-4 rounded border border-border" />
                  )}
                </button>
                <input
                  type="text"
                  value={item.text}
                  onChange={(e) => {
                    const next = items.map((i) =>
                      i.id === item.id ? { ...i, text: e.target.value } : i,
                    )
                    setItems(next)
                    scheduleTodoSave(next)
                  }}
                  className={`flex-1 bg-transparent text-sm focus:outline-none ${
                    item.checked ? "text-muted-foreground line-through" : "text-foreground"
                  }`}
                />
                <button
                  onClick={() => {
                    const next = items.filter((i) => i.id !== item.id)
                    setItems(next)
                    scheduleTodoSave(next)
                  }}
                  className="hidden h-4 w-4 flex-shrink-0 items-center justify-center text-muted-foreground group-hover:flex hover:text-foreground"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                const next: TodoItem[] = [
                  ...items,
                  { id: crypto.randomUUID(), text: "", checked: false, task_id: null, task_type: null },
                ]
                setItems(next)
                scheduleTodoSave(next)
              }}
              className="mt-1 flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              Adicionar item
            </button>
          </div>
        )}

        {blockType === "task_ref" && (
          <div className="px-5 py-4">
            <p className="text-sm font-medium text-foreground">{(c.title as string) ?? ""}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {STATUS_LABEL[(c.status as TaskStatus) ?? "queued"]}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
