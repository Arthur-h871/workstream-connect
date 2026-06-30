import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  addEdge,
  Background,
  ConnectionMode,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  createBlock,
  createChildCanvas,
  createConnection,
  createDrawing,
  deleteBlock,
  deleteCanvasCascade,
  deleteConnection,
  deleteDrawing,
  getBlocks,
  getCanvasById,
  getCanvasBreadcrumb,
  getConnections,
  getDrawings,
  getLastOpenedCanvas,
  getOrCreateRootCanvas,
  setLastOpenedCanvas,
  syncTodoBlock,
  updateBlock,
  updateCanvas,
  updateTaskStatus,
  uploadCanvasIconAsset,
  type CanvasBreadcrumbItem,
  type NoteBlock,
  type NoteCanvas,
} from "backend/api/services/notes.service";
import { useProfile } from "@/lib/authenticated-profile-context";
import { CanvasToolbar } from "@/components/canvas/CanvasToolbar";
import { DrawingLayer, type DrawingPath } from "@/components/canvas/DrawingLayer";
import { TaskRefNode, type TaskStatus } from "@/components/canvas/TaskRefNode";
import { TextNoteNode, ANCHOR_PLACEHOLDER_HEIGHT } from "@/components/canvas/TextNoteNode";
import { TodoListNode } from "@/components/canvas/TodoListNode";
import { ChildCanvasNode } from "@/components/canvas/ChildCanvasNode";
import {
  createConnectionHandleId,
  detachTodoFromLines,
  isTodoAnchored,
  normalizeTextContent,
  parseConnectionHandleId,
  type TextBlockContent,
  type TodoBlockContent,
  type TodoItem,
} from "@/lib/notes-model";

const nodeTypes = {
  text: TextNoteNode,
  task_ref: TaskRefNode,
  todo: TodoListNode,
  child_canvas: ChildCanvasNode,
};

const TEXT_HEADER_HEIGHT = 34;
const TEXT_LINE_HEIGHT = 34;
const ANCHORED_TODO_OFFSET_X = 20;
const ANCHORED_TODO_OFFSET_Y = 4;

export function NotesCanvasPage() {
  return (
    <ReactFlowProvider>
      <InnerCanvas />
    </ReactFlowProvider>
  );
}

function InnerCanvas() {
  const { profile } = useProfile();
  const { screenToFlowPosition } = useReactFlow();
  const [canvas, setCanvas] = useState<NoteCanvas | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<CanvasBreadcrumbItem[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [drawings, setDrawings] = useState<DrawingPath[]>([]);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isErasingMode, setIsErasingMode] = useState(false);
  const [drawColor, setDrawColor] = useState("#1a1a1a");
  const [drawWidth, setDrawWidth] = useState(2);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const syncAnchoredTodoNodes = useCallback((inputNodes: Node[]) => {
    const byId = new Map(inputNodes.map((node) => [node.id, node]));
    return inputNodes.map((node) => {
      if (node.type !== "todo") return node;
      const content = (node.data as { content: TodoBlockContent }).content;
      if (!isTodoAnchored(content)) {
        return { ...node, draggable: true };
      }

      const textNode = byId.get(content.anchor.textBlockId ?? "");
      if (!textNode) return { ...node, draggable: true };

      const textContent = (textNode.data as { content: TextBlockContent }).content;
      const lineIndex = textContent.lines.findIndex((line) => line.id === content.anchor.lineId);
      if (lineIndex === -1) return { ...node, draggable: true };

      const anchorsBefore = textContent.lines
        .slice(0, lineIndex)
        .filter((line) => line.anchorTodoBlockId).length;

      return {
        ...node,
        position: {
          x: textNode.position.x + ANCHORED_TODO_OFFSET_X,
          y:
            textNode.position.y +
            TEXT_HEADER_HEIGHT +
            lineIndex * TEXT_LINE_HEIGHT +
            anchorsBefore * ANCHOR_PLACEHOLDER_HEIGHT +
            ANCHORED_TODO_OFFSET_Y,
        },
        style: {
          ...(node.style ?? {}),
          width: Math.max((Number(textNode.style?.width) || 320) - 40, 240),
        },
        draggable: false,
      };
    });
  }, []);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("note-popups");
      channel.onmessage = (event: MessageEvent) => {
        const message = event.data as
          | { blockId: string; type: "text"; content: TextBlockContent }
          | { blockId: string; type: "todo"; content: TodoBlockContent };

        setNodes((prev) =>
          syncAnchoredTodoNodes(
            prev.map((node) =>
              node.id === message.blockId
                ? { ...node, data: { ...node.data, content: message.content } }
                : node,
            ),
          ),
        );
      };
    } catch {
      // BroadcastChannel can be unavailable in some private browsing modes.
    }

    return () => channel?.close();
  }, [setNodes, syncAnchoredTodoNodes]);

  const viewportCenter = useCallback(() => {
    const viewportRect = viewportRef.current?.getBoundingClientRect();
    return screenToFlowPosition({
      x: (viewportRect?.left ?? 0) + (viewportRect?.width ?? window.innerWidth) / 2,
      y: (viewportRect?.top ?? 0) + (viewportRect?.height ?? window.innerHeight) / 2,
    });
  }, [screenToFlowPosition]);

  const toNode = useCallback(
    (block: NoteBlock): Node => {
      if (block.type === "todo") {
        const content = block.content as unknown as TodoBlockContent;
        return {
          id: block.id,
          type: "todo",
          position: { x: block.position_x, y: block.position_y },
          data: {
            content,
            onDelete: handleDeleteNode,
            onContentChange: handleUpdateTodoContent,
            onTaskStatusChange: handleTodoTaskStatus,
            onOpenPopup: handleOpenPopup,
            onResizeEnd: handleResizeEnd,
            onRequestUnanchor: handleRequestUnanchorTodo,
          },
          style: { width: block.width, height: block.height },
        };
      }

      if (block.type === "task_ref") {
        const content = block.content as Record<string, unknown>;
        return {
          id: block.id,
          type: "task_ref",
          position: { x: block.position_x, y: block.position_y },
          data: {
            task_id: (content.task_id as string) ?? "",
            task_type: (content.task_type as "personal" | "org") ?? "personal",
            title: (content.title as string) ?? "",
            status: (content.status as TaskStatus) ?? "queued",
            onDelete: handleDeleteNode,
            onStatusChange: handleStatusChange,
            onOpenPopup: handleOpenPopup,
            onResizeEnd: handleResizeEnd,
          },
          style: { width: block.width, height: block.height },
        };
      }

      if (block.type === "child_canvas") {
        const content = block.content as Record<string, unknown>;
        return {
          id: block.id,
          type: "child_canvas",
          position: { x: block.position_x, y: block.position_y },
          data: {
            canvasId: block.child_canvas_id ?? "",
            title: (content.title as string) ?? "Novo canvas",
            iconType: ((content.icon_type as "preset" | "image" | null) ?? "preset"),
            iconValue: (content.icon_value as string | null) ?? "folder",
            iconAssetUrl: (content.icon_asset_url as string | null) ?? null,
            onDelete: handleDeleteChildCanvas,
            onOpenCanvas: handleOpenCanvas,
            onRename: handleRenameChildCanvas,
            onPresetIconChange: handlePresetIconChange,
            onUploadIcon: handleUploadChildCanvasIcon,
            onOpenPopup: handleOpenPopup,
            onResizeEnd: handleResizeEnd,
          },
          style: { width: block.width, height: block.height },
        };
      }

      return {
        id: block.id,
        type: "text",
        position: { x: block.position_x, y: block.position_y },
        data: {
          content: normalizeTextContent((block.content as TextBlockContent).text ?? "", (block.content as TextBlockContent).lines ?? []),
          onDelete: handleDeleteNode,
          onUpdate: handleUpdateTextContent,
          onOpenPopup: handleOpenPopup,
          onResizeEnd: handleResizeEnd,
        },
        style: { width: block.width, height: block.height },
      };
    },
    [],
  );

  async function loadCanvas(canvasId?: string) {
    setLoading(true);
    setLoadError(false);

    try {
      await getOrCreateRootCanvas(profile.id);
      const nextCanvas = canvasId
        ? (await getCanvasById(canvasId)) ?? (await getLastOpenedCanvas(profile.id))
        : await getLastOpenedCanvas(profile.id);

      await setLastOpenedCanvas(nextCanvas.id);
      setCanvas(nextCanvas);
      setBreadcrumb(await getCanvasBreadcrumb(profile.id, nextCanvas.id));

      const [rawBlocks, connections, drawingData] = await Promise.all([
        getBlocks(nextCanvas.id),
        getConnections(nextCanvas.id),
        getDrawings(nextCanvas.id),
      ]);

      const blocks = await Promise.all(rawBlocks.map((block) => syncTodoBlock(block)));
      const mappedNodes = syncAnchoredTodoNodes(blocks.map(toNode));
      setNodes(mappedNodes);
      setEdges(
        connections.map((connection) => ({
          id: connection.id,
          source: connection.source_block_id,
          target: connection.target_block_id,
          sourceHandle: createConnectionHandleId(
            connection.source_target_type,
            connection.source_target_id ?? connection.source_block_id,
            connection.source_side,
          ),
          targetHandle: createConnectionHandleId(
            connection.target_target_type,
            connection.target_target_id ?? connection.target_block_id,
            connection.target_side,
          ),
          type: "smoothstep",
          style: { stroke: "var(--copper)", strokeWidth: 2 },
          animated: false,
        })),
      );
      setDrawings(
        drawingData.map((drawing) => ({
          id: drawing.id,
          pathData: drawing.path_data,
          color: drawing.color,
          strokeWidth: drawing.stroke_width,
        })),
      );
    } catch (error) {
      console.error("Failed to load canvas:", error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCanvas().catch(console.error);
  }, [profile.id]);

  const handleDeleteNode = useCallback(async (nodeId: string) => {
    try {
      const node = nodes.find((entry) => entry.id === nodeId);
      if (node?.type === "text") {
        const content = (node.data as { content: TextBlockContent }).content;
        for (const line of content.lines) {
          if (!line.anchorTodoBlockId) continue;
          await handleRequestUnanchorTodo(line.anchorTodoBlockId);
        }
      }

      if (node?.type === "todo") {
        await handleRequestUnanchorTodo(nodeId, false);
      }

      await deleteBlock(nodeId);
      setNodes((prev) => prev.filter((entry) => entry.id !== nodeId));
      setEdges((prev) => prev.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    } catch {
      toast.error("Erro ao excluir quadro.");
    }
  }, [nodes]);

  const handleDeleteChildCanvas = useCallback(async (blockId: string, childCanvasId: string) => {
    const confirmed = window.confirm(
      "Excluir este canvas vai apagar tudo dentro dele. Deseja continuar?",
    );
    if (!confirmed) return;

    try {
      await deleteCanvasCascade(childCanvasId);
      setNodes((prev) => prev.filter((entry) => entry.id !== blockId));
      setEdges((prev) => prev.filter((edge) => edge.source !== blockId && edge.target !== blockId));
    } catch {
      toast.error("Erro ao excluir canvas.");
    }
  }, []);

  const handleUpdateTextContent = useCallback(
    async (blockId: string, content: TextBlockContent, detachedTodoIds: string[]) => {
      await updateBlock(blockId, { content: content as never }).catch(console.error);
      if (detachedTodoIds.length > 0) {
        for (const todoId of detachedTodoIds) {
          await handleRequestUnanchorTodo(todoId);
        }
      }
      setNodes((prev) =>
        syncAnchoredTodoNodes(
          prev.map((node) =>
            node.id === blockId ? { ...node, data: { ...node.data, content } } : node,
          ),
        ),
      );
    },
    [syncAnchoredTodoNodes],
  );

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
      ]);
    },
    [],
  );

  const handleUpdateTodoContent = useCallback(
    async (blockId: string, content: TodoBlockContent) => {
      await updateBlock(blockId, { content: content as never }).catch(console.error);
      setNodes((prev) =>
        syncAnchoredTodoNodes(
          prev.map((node) =>
            node.id === blockId ? { ...node, data: { ...node.data, content } } : node,
          ),
        ),
      );
    },
    [syncAnchoredTodoNodes],
  );

  const handleTodoTaskStatus = useCallback(
    (taskId: string, taskType: "personal" | "org", status: "queued" | "in_progress" | "completed") => {
      updateTaskStatus(taskId, taskType, status).catch(console.error);
    },
    [],
  );

  const handleResizeEnd = useCallback((nodeId: string, width: number, height: number) => {
    updateBlock(nodeId, { width, height }).catch(console.error);
  }, []);

  const handleOpenPopup = useCallback((id: string) => {
    window.open(
      `/popup/${id}`,
      `note-popup-${id}`,
      "width=640,height=560,resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no",
    );
  }, []);

  const handleOpenCanvas = useCallback(async (canvasId: string) => {
    await loadCanvas(canvasId);
  }, [profile.id]);

  const handleRenameChildCanvas = useCallback(
    async (blockId: string, canvasId: string, title: string) => {
      await updateCanvas(canvasId, { title }).catch(console.error);
      await updateBlock(blockId, {
        content: { ...(nodes.find((node) => node.id === blockId)?.data as Record<string, unknown>), title } as never,
      }).catch(console.error);
      setNodes((prev) =>
        prev.map((node) =>
          node.id === blockId
            ? {
                ...node,
                data: { ...node.data, title },
              }
            : node,
        ),
      );
      if (canvas?.id === canvasId) {
        setBreadcrumb(await getCanvasBreadcrumb(profile.id, canvasId));
      }
    },
    [nodes, canvas?.id, profile.id],
  );

  const handlePresetIconChange = useCallback(async (blockId: string, canvasId: string, iconValue: string) => {
    await updateCanvas(canvasId, {
      icon_type: "preset",
      icon_value: iconValue,
      icon_asset_url: null,
    }).catch(console.error);
    await updateBlock(blockId, {
      content: {
        ...(nodes.find((node) => node.id === blockId)?.data as Record<string, unknown>),
        icon_type: "preset",
        icon_value: iconValue,
        icon_asset_url: null,
      } as never,
    }).catch(console.error);
    setNodes((prev) =>
      prev.map((node) =>
        node.id === blockId
          ? {
              ...node,
              data: {
                ...node.data,
                iconType: "preset",
                iconValue,
                iconAssetUrl: null,
              },
            }
          : node,
      ),
    );
  }, [nodes]);

  const handleUploadChildCanvasIcon = useCallback(
    async (blockId: string, canvasId: string, file: File) => {
      try {
        const publicUrl = await uploadCanvasIconAsset(profile.id, canvasId, file);
        await updateCanvas(canvasId, {
          icon_type: "image",
          icon_asset_url: publicUrl,
        });
        await updateBlock(blockId, {
          content: {
            ...(nodes.find((node) => node.id === blockId)?.data as Record<string, unknown>),
            icon_type: "image",
            icon_asset_url: publicUrl,
          } as never,
        });
        setNodes((prev) =>
          prev.map((node) =>
            node.id === blockId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    iconType: "image",
                    iconAssetUrl: publicUrl,
                  },
                }
              : node,
          ),
        );
      } catch {
        toast.error("Erro ao enviar imagem do canvas.");
      }
    },
    [nodes, profile.id],
  );

  const handleRequestUnanchorTodo = useCallback(async (todoBlockId: string, persistTodoPosition = true) => {
    const currentNodes = nodes;
    const todoNode = currentNodes.find((node) => node.id === todoBlockId);
    if (!todoNode || todoNode.type !== "todo") return;
    const todoContent = (todoNode.data as { content: TodoBlockContent }).content;
    if (!todoContent.anchor.textBlockId || !todoContent.anchor.lineId) return;

    const textNode = currentNodes.find((node) => node.id === todoContent.anchor.textBlockId);
    if (!textNode || textNode.type !== "text") return;
    const textContent = (textNode.data as { content: TextBlockContent }).content;
    const nextTextContent = {
      ...textContent,
      lines: detachTodoFromLines(textContent.lines, todoBlockId),
    };
    const center = {
      x: textNode.position.x + (Number(textNode.style?.width) || 320) + 24,
      y: textNode.position.y + 24,
    };
    const nextTodoContent: TodoBlockContent = {
      ...todoContent,
      anchor: { textBlockId: null, lineId: null },
    };

    await Promise.all([
      updateBlock(textNode.id, { content: nextTextContent as never }).catch(console.error),
      updateBlock(todoBlockId, {
        content: nextTodoContent as never,
        ...(persistTodoPosition ? { position_x: center.x, position_y: center.y } : {}),
      }).catch(console.error),
    ]);

    setNodes((prev) =>
      syncAnchoredTodoNodes(
        prev.map((node) => {
          if (node.id === textNode.id) {
            return { ...node, data: { ...node.data, content: nextTextContent } };
          }
          if (node.id === todoBlockId) {
            return {
              ...node,
              position: persistTodoPosition ? center : node.position,
              data: { ...node.data, content: nextTodoContent },
            };
          }
          return node;
        }),
      ),
    );
  }, [nodes, syncAnchoredTodoNodes]);

  const handleAddNote = useCallback(async () => {
    if (!canvas) return;
    const center = viewportCenter();
    const block = await createBlock(canvas.id, profile.id, "text", center.x, center.y);
    setNodes((prev) => [...prev, toNode(block)]);
  }, [canvas, profile.id, toNode, viewportCenter]);

  const handleAddTodo = useCallback(async () => {
    if (!canvas) return;
    const center = viewportCenter();
    const block = await createBlock(canvas.id, profile.id, "todo", center.x, center.y);
    setNodes((prev) => [...prev, toNode(block)]);
  }, [canvas, profile.id, toNode, viewportCenter]);

  const handleAddChildCanvas = useCallback(async () => {
    if (!canvas) return;
    const center = viewportCenter();
    const created = await createChildCanvas(canvas.id, profile.id, center.x, center.y);
    setNodes((prev) => [...prev, toNode(created.block)]);
  }, [canvas, profile.id, toNode, viewportCenter]);

  const maybeAnchorTodoToText = useCallback(
    async (todoNode: Node) => {
      if (todoNode.type !== "todo") return false;
      const textNodes = nodes.filter((node) => node.type === "text");
      const droppedTextNode = textNodes.find((node) => {
        const width = Number(node.style?.width) || 320;
        const height = Number(node.style?.height) || 240;
        return (
          todoNode.position.x >= node.position.x &&
          todoNode.position.x <= node.position.x + width &&
          todoNode.position.y >= node.position.y &&
          todoNode.position.y <= node.position.y + height
        );
      });

      if (!droppedTextNode) return false;

      const textContent = (droppedTextNode.data as { content: TextBlockContent }).content;
      if (textContent.lines.length === 0) return false;

      const relativeY = todoNode.position.y - droppedTextNode.position.y - TEXT_HEADER_HEIGHT;
      const lineIndex = Math.max(
        0,
        Math.min(textContent.lines.length - 1, Math.floor(relativeY / TEXT_LINE_HEIGHT)),
      );
      const line = textContent.lines[lineIndex];
      if (line.anchorTodoBlockId && line.anchorTodoBlockId !== todoNode.id) {
        toast.error("Essa linha já possui uma lista ancorada.");
        return false;
      }

      const nextTextContent: TextBlockContent = {
        ...textContent,
        lines: textContent.lines.map((entry) =>
          entry.id === line.id ? { ...entry, anchorTodoBlockId: todoNode.id } : entry,
        ),
      };
      const todoContent = (todoNode.data as { content: TodoBlockContent }).content;
      const nextTodoContent: TodoBlockContent = {
        ...todoContent,
        anchor: { textBlockId: droppedTextNode.id, lineId: line.id },
      };

      await Promise.all([
        updateBlock(droppedTextNode.id, { content: nextTextContent as never }).catch(console.error),
        updateBlock(todoNode.id, { content: nextTodoContent as never }).catch(console.error),
      ]);

      setNodes((prev) =>
        syncAnchoredTodoNodes(
          prev.map((node) => {
            if (node.id === droppedTextNode.id) {
              return { ...node, data: { ...node.data, content: nextTextContent } };
            }
            if (node.id === todoNode.id) {
              return { ...node, data: { ...node.data, content: nextTodoContent } };
            }
            return node;
          }),
        ),
      );
      return true;
    },
    [nodes, syncAnchoredTodoNodes],
  );

  const handleNodeDragStop = useCallback(
    async (node: Node) => {
      const anchored = await maybeAnchorTodoToText(node);
      if (anchored) return;

      setNodes((prev) => syncAnchoredTodoNodes(prev));
      updateBlock(node.id, {
        position_x: node.position.x,
        position_y: node.position.y,
      }).catch(console.error);
    },
    [maybeAnchorTodoToText, syncAnchoredTodoNodes],
  );

  const handleConnect = useCallback(
    async (connection: Connection) => {
      if (!canvas || !connection.source || !connection.target) return;
      const sourceMeta = parseConnectionHandleId(connection.sourceHandle);
      const targetMeta = parseConnectionHandleId(connection.targetHandle);
      const savedConnection = await createConnection({
        canvasId: canvas.id,
        sourceBlockId: connection.source,
        targetBlockId: connection.target,
        sourceTargetType: sourceMeta.targetType,
        sourceTargetId: sourceMeta.targetId || connection.source,
        sourceSide: sourceMeta.side,
        sourcePositionRatio: 0.5,
        targetTargetType: targetMeta.targetType,
        targetTargetId: targetMeta.targetId || connection.target,
        targetSide: targetMeta.side,
        targetPositionRatio: 0.5,
      }).catch(console.error);
      if (!savedConnection) return;

      setEdges((prev) =>
        addEdge(
          {
            ...connection,
            id: savedConnection.id,
            type: "smoothstep",
            style: { stroke: "var(--copper)", strokeWidth: 2 },
          },
          prev,
        ),
      );
    },
    [canvas, setEdges],
  );

  const handleEdgeClick = useCallback(async (_event: React.MouseEvent, edge: Edge) => {
    try {
      await deleteConnection(edge.id);
      setEdges((prev) => prev.filter((currentEdge) => currentEdge.id !== edge.id));
    } catch {
      toast.error("Erro ao remover conexão.");
    }
  }, []);

  const handlePathComplete = useCallback(
    async (pathData: string) => {
      if (!canvas) return;
      const savedDrawing = await createDrawing(canvas.id, pathData, drawColor, drawWidth).catch(
        () => {
          toast.error("Erro ao salvar desenho.");
          return undefined;
        },
      );
      if (!savedDrawing) return;

      setDrawings((prev) => [
        ...prev,
        {
          id: savedDrawing.id,
          pathData: savedDrawing.path_data,
          color: savedDrawing.color,
          strokeWidth: savedDrawing.stroke_width,
        },
      ]);
    },
    [canvas, drawColor, drawWidth],
  );

  const handlePathDelete = useCallback(async (pathId: string) => {
    try {
      await deleteDrawing(pathId);
      setDrawings((prev) => prev.filter((drawing) => drawing.id !== pathId));
    } catch {
      toast.error("Erro ao apagar desenho.");
    }
  }, []);

  const breadcrumbView = useMemo(
    () => (
      <div className="pointer-events-auto absolute left-4 top-24 z-20 flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-surface/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
        {breadcrumb.map((item, index) => (
          <button
            key={item.id}
            onClick={() => handleOpenCanvas(item.id)}
            className={`rounded px-1.5 py-0.5 ${index === breadcrumb.length - 1 ? "text-foreground" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}
          >
            {item.title}
          </button>
        ))}
      </div>
    ),
    [breadcrumb, handleOpenCanvas],
  );

  return (
    <div ref={viewportRef} className="relative h-full bg-background text-foreground">
      <CanvasToolbar
        canCreateNote={!loading && Boolean(canvas)}
        canUseCanvasTools={!loading && !loadError && Boolean(canvas)}
        isDrawing={isDrawingMode}
        isErasing={isErasingMode}
        color={drawColor}
        strokeWidth={drawWidth}
        onCreateNote={handleAddNote}
        onCreateTodo={handleAddTodo}
        onCreateChildCanvas={handleAddChildCanvas}
        onUsePointer={() => {
          setIsDrawingMode(false);
          setIsErasingMode(false);
        }}
        onToggleDraw={() => {
          setIsDrawingMode((current) => !current);
          setIsErasingMode(false);
        }}
        onToggleErase={() => {
          setIsErasingMode((current) => !current);
          setIsDrawingMode(false);
        }}
        onColorChange={setDrawColor}
        onWidthChange={setDrawWidth}
      />
      {breadcrumb.length > 0 && breadcrumbView}

      {loading ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Carregando canvas...
        </div>
      ) : loadError ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm">
          <p className="text-destructive">Erro ao carregar o canvas.</p>
          <button
            onClick={() => loadCanvas().catch(console.error)}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={(_event, node) => handleNodeDragStop(node)}
          onConnect={handleConnect}
          onEdgeClick={handleEdgeClick}
          connectionMode={ConnectionMode.Loose}
          defaultEdgeOptions={{ type: "smoothstep" }}
          nodeTypes={nodeTypes}
          nodesDraggable={!isDrawingMode && !isErasingMode}
          panOnDrag={!isDrawingMode && !isErasingMode}
          panOnScroll={!isDrawingMode && !isErasingMode}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      )}

      <DrawingLayer
        drawings={drawings}
        isDrawing={isDrawingMode}
        isErasing={isErasingMode}
        color={drawColor}
        strokeWidth={drawWidth}
        onPathComplete={handlePathComplete}
        onPathDelete={handlePathDelete}
      />
    </div>
  );
}
