import { memo, useState, useCallback } from "react"
import { NodeResizer, type NodeProps } from "@xyflow/react"
import { Link, X, Circle, Clock, CheckCircle2, Maximize2 } from "lucide-react"
import { CanvasConnectionHandles } from "@/components/canvas/CanvasConnectionHandles"

export type TaskStatus = "queued" | "in_progress" | "completed"

export type TaskRefNodeData = {
  task_id: string
  task_type: "personal" | "org"
  title: string
  status: TaskStatus
  onDelete: (id: string) => void
  onStatusChange: (
    blockId: string,
    taskId: string,
    taskType: "personal" | "org",
    title: string,
    newStatus: TaskStatus,
  ) => void
  onOpenPopup: (id: string) => void
  onResizeEnd: (id: string, width: number, height: number) => void
}

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  queued: "in_progress",
  in_progress: "completed",
  completed: "queued",
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: "Na fila",
  in_progress: "Em andamento",
  completed: "Concluída",
}

const STATUS_COLOR: Record<TaskStatus, string> = {
  queued: "text-muted-foreground",
  in_progress: "text-teal",
  completed: "text-copper",
}

/** Canvas node that displays a task reference with an inline status toggle. */
export const TaskRefNode = memo(function TaskRefNode({ id, data, selected }: NodeProps) {
  const typedData = data as unknown as TaskRefNodeData
  const [status, setStatus] = useState<TaskStatus>(typedData.status)

  const handleStatusClick = useCallback(() => {
    const next = STATUS_CYCLE[status]
    setStatus(next)
    typedData.onStatusChange(id, typedData.task_id, typedData.task_type, typedData.title, next)
  }, [status, id, typedData])

  const StatusIcon =
    status === "queued" ? Circle : status === "in_progress" ? Clock : CheckCircle2

  return (
    <div
      className={`flex flex-col rounded-lg border bg-surface shadow-sm h-full w-full min-w-[200px] ${
        selected ? "border-copper" : "border-border"
      }`}
    >
      <NodeResizer
        minWidth={200} minHeight={100} isVisible={selected}
        onResizeEnd={(_, params) => typedData.onResizeEnd(id, params.width, params.height)}
      />
      <CanvasConnectionHandles nodeId={id} />

      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-1.5">
          <Link className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground select-none">
            Tarefa
          </span>
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

      <div className="flex flex-col gap-2 px-3 py-3">
        <p className="text-sm font-medium text-foreground truncate" title={typedData.title}>
          {typedData.title}
        </p>
        <button
          onClick={handleStatusClick}
          className={`nopan nodrag flex items-center gap-1.5 text-xs font-medium transition-colors ${STATUS_COLOR[status]}`}
        >
          <StatusIcon className="h-3.5 w-3.5" />
          {STATUS_LABEL[status]}
        </button>
      </div>
    </div>
  )
})
