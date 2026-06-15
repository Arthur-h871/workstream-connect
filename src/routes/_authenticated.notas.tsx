import { createFileRoute, useRouteContext } from "@tanstack/react-router"
import { useState, useEffect, useCallback } from "react"
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  ConnectionMode,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  getOrCreateCanvas,
  getBlocks,
  createBlock,
  updateBlock,
  deleteBlock,
  updateTaskStatus,
  getConnections,
  createConnection,
  deleteConnection,
  getDrawings,
  createDrawing,
  deleteDrawing,
  type NoteCanvas,
  type NoteBlock,
} from "backend/api/services/notes.service"
import { TextNoteNode } from "@/components/canvas/TextNoteNode"
import { TaskRefNode, type TaskStatus } from "@/components/canvas/TaskRefNode"
import { TodoListNode, type TodoItem } from "@/components/canvas/TodoListNode"
import { DrawingLayer, type DrawingPath } from "@/components/canvas/DrawingLayer"
import { CanvasToolbar } from "@/components/canvas/CanvasToolbar"

export const Route = createFileRoute("/_authenticated/notas")({
  component: NotasPage,
})

const nodeTypes = { text: TextNoteNode, task_ref: TaskRefNode, todo: TodoListNode }

export function NotasPage() {
  return (
    <ReactFlowProvider>
      <InnerCanvas />
    </ReactFlowProvider>
  )
}

function InnerCanvas() {
  const { profile } = useRouteContext({ from: "/_authenticated" })
  const { screenToFlowPosition } = useReactFlow()
  const [canvas, setCanvas] = useState<NoteCanvas | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [loading, setLoading] = useState(true)
  const [drawings, setDrawings] = useState<DrawingPath[]>([])
  const [isDrawingMode, setIsDrawingMode] = useState(false)
  const [drawColor, setDrawColor] = useState("#1a1a1a")
  const [drawWidth, setDrawWidth] = useState(2)

  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      setNodes((prev) => prev.filter((n) => n.id !== nodeId))
      await deleteBlock(nodeId).catch(console.error)
    },
    [setNodes],
  )

  const handleUpdateNode = useCallback(async (nodeId: string, text: string) => {
    await updateBlock(nodeId, { content: { text } }).catch(console.error)
  }, [])

  const handleStatusChange = useCallback(
    async (
      blockId: string,
      taskId: string,
      taskType: "personal" | "org",
      title: string,
      newStatus: TaskStatus,
    ) => {
      await Promise.all([
        updateTaskStatus(taskId, taskType, newStatus).catch(console.error),
        updateBlock(blockId, {
          content: { task_id: taskId, task_type: taskType, title, status: newStatus },
        }).catch(console.error),
      ])
    },
    [],
  )

  const handleItemsChange = useCallback(async (blockId: string, items: TodoItem[]) => {
    await updateBlock(blockId, { content: { items } }).catch(console.error)
  }, [])

  const handleTodoTaskStatus = useCallback(
    (taskId: string, taskType: "personal" | "org", status: "queued" | "in_progress" | "completed") => {
      updateTaskStatus(taskId, taskType, status).catch(console.error)
    },
    [],
  )

  const toNode = useCallback(
    (block: NoteBlock): Node => {
      if (block.type === "todo") {
        const c = block.content as Record<string, unknown>
        const items = (c.items as TodoItem[]) ?? []
        return {
          id: block.id,
          type: "todo",
          position: { x: block.position_x, y: block.position_y },
          data: {
            items,
            onDelete: handleDeleteNode,
            onItemsChange: handleItemsChange,
            onTaskStatusChange: handleTodoTaskStatus,
          },
          style: { width: block.width, height: block.height },
        }
      }
      if (block.type === "task_ref") {
        const c = block.content as Record<string, unknown>
        return {
          id: block.id,
          type: "task_ref",
          position: { x: block.position_x, y: block.position_y },
          data: {
            task_id: (c.task_id as string) ?? "",
            task_type: (c.task_type as "personal" | "org") ?? "personal",
            title: (c.title as string) ?? "",
            status: (c.status as TaskStatus) ?? "queued",
            onDelete: handleDeleteNode,
            onStatusChange: handleStatusChange,
          },
          style: { width: block.width, height: block.height },
        }
      }
      return {
        id: block.id,
        type: "text",
        position: { x: block.position_x, y: block.position_y },
        data: {
          label: ((block.content as Record<string, unknown>)?.text as string) ?? "",
          onDelete: handleDeleteNode,
          onUpdate: handleUpdateNode,
        },
        style: { width: block.width, height: block.height },
      }
    },
    [handleDeleteNode, handleUpdateNode, handleStatusChange, handleItemsChange, handleTodoTaskStatus],
  )

  useEffect(() => {
    async function load() {
      setLoading(true)
      const c = await getOrCreateCanvas(profile.id)
      setCanvas(c)
      const [blocks, connections, drawingData] = await Promise.all([
        getBlocks(c.id),
        getConnections(c.id),
        getDrawings(c.id),
      ])
      setNodes(blocks.map(toNode))
      setEdges(connections.map(conn => ({
        id: conn.id,
        source: conn.source_block_id,
        target: conn.target_block_id,
        type: "smoothstep",
        style: { stroke: "var(--copper)", strokeWidth: 2 },
        animated: false,
      })))
      setDrawings(drawingData.map(d => ({ id: d.id, pathData: d.path_data, color: d.color, strokeWidth: d.stroke_width })))
      setLoading(false)
    }
    load()
    // toNode is stable (handleDeleteNode + handleUpdateNode are stable useCallbacks)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  const handleAddNote = useCallback(async () => {
    if (!canvas) return
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    const block = await createBlock(canvas.id, profile.id, "text", center.x, center.y)
    setNodes((prev) => [...prev, toNode(block)])
  }, [canvas, profile.id, screenToFlowPosition, setNodes, toNode])

  const handleNodeDragStop = useCallback((node: Node) => {
    updateBlock(node.id, {
      position_x: node.position.x,
      position_y: node.position.y,
    }).catch(console.error)
  }, [])

  const handleConnect = useCallback(
    async (connection: Connection) => {
      if (!canvas || !connection.source || !connection.target) return
      const conn = await createConnection(canvas.id, connection.source, connection.target).catch(console.error)
      if (!conn) return
      setEdges(eds => addEdge({ ...connection, id: conn.id, type: "smoothstep", style: { stroke: "var(--copper)", strokeWidth: 2 } }, eds))
    },
    [canvas, setEdges],
  )

  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      deleteConnection(edge.id).catch(console.error)
      setEdges(eds => eds.filter(e => e.id !== edge.id))
    },
    [setEdges],
  )

  const handlePathComplete = useCallback(async (pathData: string) => {
    if (!canvas) return
    const saved = await createDrawing(canvas.id, pathData, drawColor, drawWidth).catch(console.error)
    if (!saved) return
    setDrawings(prev => [...prev, { id: saved.id, pathData: saved.path_data, color: saved.color, strokeWidth: saved.stroke_width }])
  }, [canvas, drawColor, drawWidth])

  const handlePathDelete = useCallback((pathId: string) => {
    setDrawings(prev => prev.filter(d => d.id !== pathId))
    deleteDrawing(pathId).catch(console.error)
  }, [])

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <h1 className="text-lg font-semibold">Notas</h1>
        <button
          onClick={handleAddNote}
          disabled={loading || !canvas}
          className="rounded-md bg-copper px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          + Nova Nota
        </button>
      </div>
      <div className="flex-1 relative">
        <CanvasToolbar
          isDrawing={isDrawingMode}
          color={drawColor}
          strokeWidth={drawWidth}
          onToggleDraw={() => setIsDrawingMode(v => !v)}
          onColorChange={setDrawColor}
          onWidthChange={setDrawWidth}
        />
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Carregando...
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={(_, node) => handleNodeDragStop(node)}
            onConnect={handleConnect}
            onEdgeClick={handleEdgeClick}
            connectionMode={ConnectionMode.Loose}
            defaultEdgeOptions={{ type: "smoothstep" }}
            nodeTypes={nodeTypes}
            nodesDraggable={!isDrawingMode}
            panOnDrag={!isDrawingMode}
            panOnScroll={!isDrawingMode}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        )}
        <DrawingLayer
          drawings={drawings}
          isDrawing={isDrawingMode}
          color={drawColor}
          strokeWidth={drawWidth}
          onPathComplete={handlePathComplete}
          onPathDelete={handlePathDelete}
        />
      </div>
    </div>
  )
}
