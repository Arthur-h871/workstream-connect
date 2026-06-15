import { memo, useState, useRef, useEffect } from "react"
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react"
import { CheckSquare, X, Plus, Trash2 } from "lucide-react"

export type TodoItem = {
  id: string
  text: string
  checked: boolean
  task_id: string | null
  task_type: "personal" | "org" | null
}

export type TodoNodeData = {
  items: TodoItem[]
  onDelete: (id: string) => void
  onItemsChange: (blockId: string, items: TodoItem[]) => void
  onTaskStatusChange: (
    taskId: string,
    taskType: "personal" | "org",
    status: "queued" | "in_progress" | "completed",
  ) => void
}

/** Canvas node displaying a checklist. Checking an item with a linked task marks it completed. */
export const TodoListNode = memo(function TodoListNode({ id, data, selected }: NodeProps) {
  const typedData = data as unknown as TodoNodeData
  const [items, setItems] = useState<TodoItem[]>(typedData.items)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onItemsChangeRef = useRef(typedData.onItemsChange)
  const onTaskStatusChangeRef = useRef(typedData.onTaskStatusChange)

  useEffect(() => {
    onItemsChangeRef.current = typedData.onItemsChange
    onTaskStatusChangeRef.current = typedData.onTaskStatusChange
  })

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  function scheduleSave(newItems: TodoItem[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      onItemsChangeRef.current(id, newItems)
    }, 800)
  }

  function handleToggle(itemId: string) {
    setItems((prev) => {
      const next = prev.map((item) => {
        if (item.id !== itemId) return item
        const newChecked = !item.checked
        if (item.task_id && item.task_type) {
          onTaskStatusChangeRef.current(
            item.task_id,
            item.task_type,
            newChecked ? "completed" : "in_progress",
          )
        }
        return { ...item, checked: newChecked }
      })
      scheduleSave(next)
      return next
    })
  }

  function handleTextChange(itemId: string, text: string) {
    setItems((prev) => {
      const next = prev.map((item) => (item.id === itemId ? { ...item, text } : item))
      scheduleSave(next)
      return next
    })
  }

  function handleAddItem() {
    const newItem: TodoItem = {
      id: crypto.randomUUID(),
      text: "",
      checked: false,
      task_id: null,
      task_type: null,
    }
    setItems((prev) => {
      const next = [...prev, newItem]
      scheduleSave(next)
      return next
    })
  }

  function handleDeleteItem(itemId: string) {
    setItems((prev) => {
      const next = prev.filter((item) => item.id !== itemId)
      scheduleSave(next)
      return next
    })
  }

  return (
    <div
      className={`flex flex-col rounded-lg border bg-surface shadow-sm h-full w-full ${selected ? "border-copper" : "border-border"}`}
    >
      <NodeResizer minWidth={220} minHeight={120} isVisible={selected} />
      <Handle type="target" position={Position.Left} className="opacity-0 hover:opacity-100" />
      <Handle type="source" position={Position.Right} className="opacity-0 hover:opacity-100" />

      <div className="nodrag nopan flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <CheckSquare className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground select-none">
            Lista
          </span>
        </div>
        <button
          onClick={() => typedData.onDelete(id)}
          className="nopan nodrag flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="nopan nodrag flex-1 overflow-y-auto px-2 py-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-background"
          >
            <button
              onClick={() => handleToggle(item.id)}
              className="nopan nodrag flex-shrink-0 text-muted-foreground hover:text-foreground"
            >
              {item.checked ? (
                <CheckSquare className="h-4 w-4 text-copper" />
              ) : (
                <div className="h-4 w-4 rounded border border-current" />
              )}
            </button>
            <input
              type="text"
              value={item.text}
              onChange={(e) => handleTextChange(item.id, e.target.value)}
              className={`nopan nodrag flex-1 bg-transparent text-sm focus:outline-none ${item.checked ? "line-through text-muted-foreground" : "text-foreground"}`}
            />
            <button
              onClick={() => handleDeleteItem(item.id)}
              className="nopan nodrag hidden h-4 w-4 flex-shrink-0 items-center justify-center text-muted-foreground group-hover:flex hover:text-foreground"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          onClick={handleAddItem}
          className="nopan nodrag mt-1 flex w-full items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          Adicionar item
        </button>
      </div>
    </div>
  )
})
