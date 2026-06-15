import { memo, useState, useRef, useCallback, useEffect, ChangeEvent } from "react"
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react"
import { X } from "lucide-react"
import { useRouteContext } from "@tanstack/react-router"
import { searchTasksForMention } from "backend/api/services/notes.service"
import { TaskMentionDropdown } from "@/components/canvas/TaskMentionDropdown"

export type TextNodeData = {
  label: string
  onDelete: (id: string) => void
  onUpdate: (id: string, text: string) => void
}

type TaskResult = { id: string; title: string; type: "personal" | "org" }

export const TextNoteNode = memo(function TextNoteNode({ id, data, selected }: NodeProps) {
  // NodeProps generic constraint requires Record<string,unknown> index sig; cast instead
  const typedData = data as unknown as TextNodeData
  const { profile } = useRouteContext({ from: "/_authenticated" })
  const [text, setText] = useState(typedData.label)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onUpdateRef = useRef(typedData.onUpdate)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionResults, setMentionResults] = useState<TaskResult[]>([])
  const [mentionLoading, setMentionLoading] = useState(false)

  useEffect(() => {
    onUpdateRef.current = typedData.onUpdate
  })

  // Sync external label changes (e.g. after reload)
  useEffect(() => {
    setText(typedData.label)
  }, [typedData.label])

  // Clear pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  useEffect(() => {
    if (mentionQuery === null) { setMentionResults([]); return }
    setMentionLoading(true)
    const t = setTimeout(async () => {
      const results = await searchTasksForMention(profile.id, profile.organization_id ?? "", mentionQuery)
      setMentionResults(results)
      setMentionLoading(false)
    }, 200)
    return () => clearTimeout(t)
  }, [mentionQuery, profile.id, profile.organization_id])

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value
      setText(val)
      const cursorPos = e.target.selectionStart ?? val.length
      const textBeforeCursor = val.slice(0, cursorPos)
      const mentionMatch = textBeforeCursor.match(/\/\/(\w*)$/)
      if (mentionMatch) {
        setMentionQuery(mentionMatch[1])
      } else {
        setMentionQuery(null)
      }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        onUpdateRef.current(id, val)
      }, 600)
    },
    [id],
  )

  const handleMentionSelect = useCallback(
    (item: TaskResult) => {
      const token = `[[@task:${item.id}:${item.title}]]`
      const cursorPos = textareaRef.current?.selectionStart ?? text.length
      const before = text.slice(0, cursorPos).replace(/\/\/\w*$/, token)
      const after = text.slice(cursorPos)
      const newText = before + after
      setText(newText)
      setMentionQuery(null)
      onUpdateRef.current(id, newText)
    },
    [id, text],
  )

  return (
    <div className={`flex flex-col rounded-lg border bg-surface shadow-sm h-full w-full ${selected ? "border-copper" : "border-border"}`}>
      <NodeResizer minWidth={180} minHeight={120} isVisible={selected} />
      <Handle type="target" position={Position.Left} className="opacity-0 hover:opacity-100" />
      <Handle type="source" position={Position.Right} className="opacity-0 hover:opacity-100" />
      <div className="nodrag nopan flex items-center justify-between border-b border-border px-3 py-1.5 cursor-grab active:cursor-grabbing">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground select-none">
          Nota
        </span>
        <button
          onClick={() => typedData.onDelete(id)}
          className="nopan nodrag flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="relative flex-1">
        {text.length === 0 && (
          <span aria-hidden className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground select-none">
            Escreva aqui...
          </span>
        )}
        <textarea
          ref={textareaRef}
          className="nopan nodrag absolute inset-0 resize-none bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none"
          value={text}
          onChange={handleChange}
        />
        {mentionQuery !== null && (
          <TaskMentionDropdown
            results={mentionResults}
            loading={mentionLoading}
            onSelect={handleMentionSelect}
            onClose={() => setMentionQuery(null)}
          />
        )}
      </div>
    </div>
  )
})
