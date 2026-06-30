import { supabase } from "backend/api/supabase";
import type { Json } from "@/types/supabase";
import {
  createEmptyTextContent,
  createEmptyTodoContent,
  normalizeTextContent,
  type NoteBlockType,
  type NoteConnectionSide,
  type NoteConnectionTargetType,
  type TextBlockContent,
  type TodoBlockContent,
  type TodoItem,
} from "@/lib/notes-model";
import { createOrgTask, updateOrgTask } from "backend/api/services/org-tasks.service";
import { createPersonalTask, updatePersonalTask } from "backend/api/services/tarefas.service";

export type NoteCanvas = {
  id: string;
  user_id: string;
  parent_canvas_id: string | null;
  is_root: boolean;
  title: string;
  icon_type: "preset" | "image";
  icon_value: string | null;
  icon_asset_url: string | null;
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NoteBlock = {
  id: string;
  canvas_id: string;
  user_id: string;
  type: NoteBlockType;
  child_canvas_id: string | null;
  content: Json;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
};

export type NoteConnection = {
  id: string;
  canvas_id: string;
  source_block_id: string;
  target_block_id: string;
  source_target_type: NoteConnectionTargetType;
  source_target_id: string | null;
  source_side: NoteConnectionSide;
  source_position_ratio: number;
  target_target_type: NoteConnectionTargetType;
  target_target_id: string | null;
  target_side: NoteConnectionSide;
  target_position_ratio: number;
  created_at: string;
};

export type NoteDrawing = {
  id: string;
  canvas_id: string;
  path_data: string;
  color: string;
  stroke_width: number;
  created_at: string;
};

export type CanvasBreadcrumbItem = Pick<
  NoteCanvas,
  "id" | "title" | "icon_type" | "icon_value" | "icon_asset_url"
>;

export type NoteTaskResult = {
  id: string;
  title: string;
  type: "personal" | "org";
  due_date: string | null;
  status: "queued" | "in_progress" | "completed";
};

export type CreateConnectionInput = {
  canvasId: string;
  sourceBlockId: string;
  targetBlockId: string;
  sourceTargetType: NoteConnectionTargetType;
  sourceTargetId: string | null;
  sourceSide: NoteConnectionSide;
  sourcePositionRatio: number;
  targetTargetType: NoteConnectionTargetType;
  targetTargetId: string | null;
  targetSide: NoteConnectionSide;
  targetPositionRatio: number;
};

function ensureTextContent(content: unknown): TextBlockContent {
  const text =
    typeof content === "object" && content !== null && "text" in content
      ? String((content as Record<string, unknown>).text ?? "")
      : "";
  const linesInput =
    typeof content === "object" && content !== null && "lines" in content
      ? ((content as Record<string, unknown>).lines as TextBlockContent["lines"] | undefined)
      : undefined;

  return normalizeTextContent(text, linesInput ?? []);
}

function ensureTodoContent(content: unknown): TodoBlockContent {
  const next = createEmptyTodoContent();
  if (!content || typeof content !== "object") return next;

  const items = Array.isArray((content as Record<string, unknown>).items)
    ? ((content as Record<string, unknown>).items as TodoItem[])
    : [];

  const anchorInput = (content as Record<string, unknown>).anchor as
    | TodoBlockContent["anchor"]
    | undefined;

  next.items = items.map((item, index) => ({
    id: item.id ?? crypto.randomUUID(),
    text: item.text ?? "",
    checked: Boolean(item.checked),
    parent_item_id: item.parent_item_id ?? null,
    order: item.order ?? index,
    task_id: item.task_id ?? null,
    task_type: item.task_type ?? null,
    due_date: item.due_date ?? null,
    detached_from_task: Boolean(item.detached_from_task),
  }));
  next.anchor = {
    textBlockId: anchorInput?.textBlockId ?? null,
    lineId: anchorInput?.lineId ?? null,
  };
  return next;
}

function defaultCanvasTitle(parentCanvasId: string | null): string {
  return parentCanvasId ? "Novo canvas" : "Raiz";
}

function defaultBlockContent(type: NoteBlockType): Json {
  if (type === "text") return createEmptyTextContent() as unknown as Json;
  if (type === "todo") return createEmptyTodoContent() as unknown as Json;
  if (type === "child_canvas") {
    return {
      title: "Novo canvas",
      icon_type: "preset",
      icon_value: "folder",
      icon_asset_url: null,
    };
  }
  return {};
}

function mapCanvas(row: Record<string, unknown>): NoteCanvas {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    parent_canvas_id: (row.parent_canvas_id as string | null) ?? null,
    is_root: Boolean(row.is_root),
    title: (row.title as string) ?? "Canvas",
    icon_type: ((row.icon_type as "preset" | "image" | null) ?? "preset"),
    icon_value: (row.icon_value as string | null) ?? null,
    icon_asset_url: (row.icon_asset_url as string | null) ?? null,
    last_opened_at: (row.last_opened_at as string | null) ?? null,
    created_at: (row.created_at as string) ?? "",
    updated_at: (row.updated_at as string) ?? "",
  };
}

function mapBlock(row: Record<string, unknown>): NoteBlock {
  const type = (row.type as NoteBlockType | null) ?? "text";
  const content = row.content;
  return {
    id: row.id as string,
    canvas_id: row.canvas_id as string,
    user_id: row.user_id as string,
    type,
    child_canvas_id: (row.child_canvas_id as string | null) ?? null,
    content:
      type === "text"
        ? (ensureTextContent(content) as unknown as Json)
        : type === "todo"
          ? (ensureTodoContent(content) as unknown as Json)
          : ((content as Json) ?? defaultBlockContent(type)),
    position_x: Number(row.position_x ?? 0),
    position_y: Number(row.position_y ?? 0),
    width: Number(row.width ?? 280),
    height: Number(row.height ?? 180),
    created_at: (row.created_at as string) ?? "",
    updated_at: (row.updated_at as string) ?? "",
  };
}

async function fetchCanvas(canvasId: string): Promise<NoteCanvas | null> {
  const { data, error } = await supabase.from("note_canvases").select("*").eq("id", canvasId).maybeSingle();
  if (error) throw new Error(`Failed to fetch canvas: ${error.message}`);
  return data ? mapCanvas(data as Record<string, unknown>) : null;
}

async function fetchCanvases(userId: string): Promise<NoteCanvas[]> {
  const { data, error } = await supabase
    .from("note_canvases")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to fetch canvases: ${error.message}`);
  return (data ?? []).map((row) => mapCanvas(row as Record<string, unknown>));
}

export async function getOrCreateRootCanvas(userId: string): Promise<NoteCanvas> {
  const { data: existing, error: selectError } = await supabase
    .from("note_canvases")
    .select("*")
    .eq("user_id", userId)
    .eq("is_root", true)
    .maybeSingle();

  if (selectError) throw new Error(`Failed to get root canvas: ${selectError.message}`);
  if (existing) return mapCanvas(existing as Record<string, unknown>);

  const { data, error } = await supabase
    .from("note_canvases")
    .insert({
      user_id: userId,
      parent_canvas_id: null,
      is_root: true,
      title: defaultCanvasTitle(null),
      icon_type: "preset",
      icon_value: "home",
      last_opened_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create root canvas: ${error?.message ?? "no data returned"}`);
  }
  return mapCanvas(data as Record<string, unknown>);
}

export async function getLastOpenedCanvas(userId: string): Promise<NoteCanvas> {
  await getOrCreateRootCanvas(userId);

  const { data, error } = await supabase
    .from("note_canvases")
    .select("*")
    .eq("user_id", userId)
    .order("last_opened_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(`Failed to get last opened canvas: ${error?.message ?? "no data returned"}`);
  }

  return mapCanvas(data as Record<string, unknown>);
}

export async function setLastOpenedCanvas(canvasId: string): Promise<void> {
  const { error } = await supabase
    .from("note_canvases")
    .update({ last_opened_at: new Date().toISOString() })
    .eq("id", canvasId);
  if (error) throw new Error(`Failed to set last opened canvas: ${error.message}`);
}

export async function getCanvasBreadcrumb(
  userId: string,
  canvasId: string,
): Promise<CanvasBreadcrumbItem[]> {
  const canvases = await fetchCanvases(userId);
  const byId = new Map(canvases.map((canvas) => [canvas.id, canvas]));
  const trail: CanvasBreadcrumbItem[] = [];
  let current = byId.get(canvasId) ?? null;

  while (current) {
    trail.unshift({
      id: current.id,
      title: current.title,
      icon_type: current.icon_type,
      icon_value: current.icon_value,
      icon_asset_url: current.icon_asset_url,
    });
    current = current.parent_canvas_id ? byId.get(current.parent_canvas_id) ?? null : null;
  }

  return trail;
}

export async function updateCanvas(
  canvasId: string,
  fields: Partial<Pick<NoteCanvas, "title" | "icon_type" | "icon_value" | "icon_asset_url">>,
): Promise<void> {
  if (Object.keys(fields).length === 0) return;
  const { error } = await supabase.from("note_canvases").update(fields).eq("id", canvasId);
  if (error) throw new Error(`Failed to update canvas: ${error.message}`);
}

export async function createChildCanvas(
  parentCanvasId: string,
  userId: string,
  positionX: number,
  positionY: number,
): Promise<{ canvas: NoteCanvas; block: NoteBlock }> {
  const { data: canvasData, error: canvasError } = await supabase
    .from("note_canvases")
    .insert({
      user_id: userId,
      parent_canvas_id: parentCanvasId,
      is_root: false,
      title: defaultCanvasTitle(parentCanvasId),
      icon_type: "preset",
      icon_value: "folder",
    })
    .select("*")
    .single();

  if (canvasError || !canvasData) {
    throw new Error(`Failed to create child canvas: ${canvasError?.message ?? "no data returned"}`);
  }

  const canvas = mapCanvas(canvasData as Record<string, unknown>);
  const { data: blockData, error: blockError } = await supabase
    .from("note_blocks")
    .insert({
      canvas_id: parentCanvasId,
      user_id: userId,
      type: "child_canvas",
      child_canvas_id: canvas.id,
      content: {
        title: canvas.title,
        icon_type: canvas.icon_type,
        icon_value: canvas.icon_value,
        icon_asset_url: canvas.icon_asset_url,
      },
      position_x: positionX,
      position_y: positionY,
      width: 220,
      height: 124,
    })
    .select("*")
    .single();

  if (blockError || !blockData) {
    throw new Error(`Failed to create child canvas block: ${blockError?.message ?? "no data returned"}`);
  }

  return { canvas, block: mapBlock(blockData as Record<string, unknown>) };
}

export async function deleteCanvasCascade(canvasId: string): Promise<void> {
  const { error } = await supabase.from("note_canvases").delete().eq("id", canvasId);
  if (error) throw new Error(`Failed to delete canvas: ${error.message}`);
}

export async function uploadCanvasIconAsset(
  userId: string,
  canvasId: string,
  file: File,
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `${userId}/${canvasId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("note-assets")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw new Error(`Failed to upload icon: ${uploadError.message}`);

  const {
    data: { publicUrl },
  } = supabase.storage.from("note-assets").getPublicUrl(path);

  return publicUrl;
}

export async function getBlock(blockId: string): Promise<NoteBlock | null> {
  const { data, error } = await supabase.from("note_blocks").select("*").eq("id", blockId).maybeSingle();
  if (error) throw new Error(`Failed to fetch block: ${error.message}`);
  return data ? mapBlock(data as Record<string, unknown>) : null;
}

export async function getBlocks(canvasId: string): Promise<NoteBlock[]> {
  const { data, error } = await supabase
    .from("note_blocks")
    .select("*")
    .eq("canvas_id", canvasId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch blocks: ${error.message}`);
  return (data ?? []).map((row) => mapBlock(row as Record<string, unknown>));
}

export async function createBlock(
  canvasId: string,
  userId: string,
  type: NoteBlockType,
  positionX: number,
  positionY: number,
): Promise<NoteBlock> {
  const { data, error } = await supabase
    .from("note_blocks")
    .insert({
      canvas_id: canvasId,
      user_id: userId,
      type,
      child_canvas_id: null,
      content: defaultBlockContent(type),
      position_x: positionX,
      position_y: positionY,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create block: ${error?.message ?? "no data returned"}`);
  }
  return mapBlock(data as Record<string, unknown>);
}

export async function updateBlock(
  blockId: string,
  fields: Partial<
    Pick<NoteBlock, "content" | "position_x" | "position_y" | "width" | "height" | "child_canvas_id">
  >,
): Promise<void> {
  if (Object.keys(fields).length === 0) return;
  const { error } = await supabase.from("note_blocks").update(fields).eq("id", blockId);
  if (error) throw new Error(`Failed to update block: ${error.message}`);
}

export async function deleteBlock(blockId: string): Promise<void> {
  const { error } = await supabase.from("note_blocks").delete().eq("id", blockId);
  if (error) throw new Error(`Failed to delete block: ${error.message}`);
}

export async function getConnections(canvasId: string): Promise<NoteConnection[]> {
  const { data, error } = await supabase
    .from("note_connections")
    .select("*")
    .eq("canvas_id", canvasId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch connections: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    canvas_id: row.canvas_id,
    source_block_id: row.source_block_id,
    target_block_id: row.target_block_id,
    source_target_type: (row.source_target_type as NoteConnectionTargetType | null) ?? "block",
    source_target_id: (row.source_target_id as string | null) ?? row.source_block_id,
    source_side: (row.source_side as NoteConnectionSide | null) ?? "right",
    source_position_ratio: Number(row.source_position_ratio ?? 0.5),
    target_target_type: (row.target_target_type as NoteConnectionTargetType | null) ?? "block",
    target_target_id: (row.target_target_id as string | null) ?? row.target_block_id,
    target_side: (row.target_side as NoteConnectionSide | null) ?? "left",
    target_position_ratio: Number(row.target_position_ratio ?? 0.5),
    created_at: row.created_at,
  }));
}

export async function createConnection(input: CreateConnectionInput): Promise<NoteConnection> {
  const { data, error } = await supabase
    .from("note_connections")
    .insert({
      canvas_id: input.canvasId,
      source_block_id: input.sourceBlockId,
      target_block_id: input.targetBlockId,
      source_target_type: input.sourceTargetType,
      source_target_id: input.sourceTargetId ?? input.sourceBlockId,
      source_side: input.sourceSide,
      source_position_ratio: input.sourcePositionRatio,
      target_target_type: input.targetTargetType,
      target_target_id: input.targetTargetId ?? input.targetBlockId,
      target_side: input.targetSide,
      target_position_ratio: input.targetPositionRatio,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create connection: ${error?.message ?? "no data returned"}`);
  }

  return (await getConnections(input.canvasId)).find((connection) => connection.id === data.id)!;
}

export async function deleteConnection(connectionId: string): Promise<void> {
  const { error } = await supabase.from("note_connections").delete().eq("id", connectionId);
  if (error) throw new Error(`Failed to delete connection: ${error.message}`);
}

export async function getDrawings(canvasId: string): Promise<NoteDrawing[]> {
  const { data, error } = await supabase
    .from("note_drawings")
    .select("*")
    .eq("canvas_id", canvasId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch drawings: ${error.message}`);
  return (data ?? []) as NoteDrawing[];
}

export async function createDrawing(
  canvasId: string,
  pathData: string,
  color: string,
  strokeWidth: number,
): Promise<NoteDrawing> {
  const { data, error } = await supabase
    .from("note_drawings")
    .insert({ canvas_id: canvasId, path_data: pathData, color, stroke_width: strokeWidth })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create drawing: ${error?.message ?? "no data returned"}`);
  }
  return data as NoteDrawing;
}

export async function deleteDrawing(drawingId: string): Promise<void> {
  const { error } = await supabase.from("note_drawings").delete().eq("id", drawingId);
  if (error) throw new Error(`Failed to delete drawing: ${error.message}`);
}

export async function updateTaskStatus(
  taskId: string,
  taskType: "personal" | "org",
  status: "queued" | "in_progress" | "completed",
): Promise<void> {
  if (taskType === "personal") {
    await updatePersonalTask(taskId, { status });
    return;
  }
  await updateOrgTask(taskId, { status });
}

export async function searchTasksForTodo(
  userId: string,
  orgId: string,
  search: string,
): Promise<NoteTaskResult[]> {
  const pattern = `%${search}%`;

  const [personalResult, orgResult] = await Promise.all([
    supabase
      .from("personal_tasks")
      .select("id, title, due_date, status")
      .eq("user_id", userId)
      .ilike("title", pattern)
      .limit(10),
    orgId
      ? supabase
          .from("org_tasks")
          .select("id, title, due_date, status")
          .eq("organization_id", orgId)
          .ilike("title", pattern)
          .limit(10)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (personalResult.error) {
    throw new Error(`Failed to search personal tasks: ${personalResult.error.message}`);
  }
  if (orgResult.error) throw new Error(`Failed to search org tasks: ${orgResult.error.message}`);

  const personal: NoteTaskResult[] = (personalResult.data ?? []).map((task) => ({
    id: task.id,
    title: task.title,
    due_date: task.due_date,
    status: task.status,
    type: "personal",
  }));

  const org: NoteTaskResult[] = (orgResult.data ?? []).map((task) => ({
    id: task.id,
    title: task.title,
    due_date: task.due_date,
    status: task.status,
    type: "org",
  }));

  return [...personal, ...org].slice(0, 10);
}

export async function searchTasksForMention(
  userId: string,
  orgId: string,
  search: string,
): Promise<NoteTaskResult[]> {
  return searchTasksForTodo(userId, orgId, search);
}

export async function createTodoTaskFromTitle(
  userId: string,
  title: string,
): Promise<NoteTaskResult> {
  const task = await createPersonalTask(userId, title);
  if (!task) throw new Error("Failed to create personal task from todo title");
  return {
    id: task.id,
    title: task.title,
    due_date: task.due_date,
    status: task.status,
    type: "personal",
  };
}

export async function hydrateTodoItems(items: TodoItem[]): Promise<TodoItem[]> {
  const personalIds = items.filter((item) => item.task_type === "personal" && item.task_id).map((item) => item.task_id as string);
  const orgIds = items.filter((item) => item.task_type === "org" && item.task_id).map((item) => item.task_id as string);

  const [personalResult, orgResult] = await Promise.all([
    personalIds.length > 0
      ? supabase.from("personal_tasks").select("id, due_date, status, title").in("id", personalIds)
      : Promise.resolve({ data: [], error: null }),
    orgIds.length > 0
      ? supabase.from("org_tasks").select("id, due_date, status, title").in("id", orgIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (personalResult.error) throw new Error(`Failed to hydrate personal tasks: ${personalResult.error.message}`);
  if (orgResult.error) throw new Error(`Failed to hydrate org tasks: ${orgResult.error.message}`);

  const personalById = new Map((personalResult.data ?? []).map((task) => [task.id, task]));
  const orgById = new Map((orgResult.data ?? []).map((task) => [task.id, task]));

  return items.map((item) => {
    if (!item.task_id || !item.task_type) return item;
    const source = item.task_type === "personal" ? personalById.get(item.task_id) : orgById.get(item.task_id);
    if (!source) {
      return {
        ...item,
        task_id: null,
        task_type: null,
        due_date: null,
        detached_from_task: true,
      };
    }

    return {
      ...item,
      text: item.detached_from_task ? item.text : source.title,
      checked: source.status === "completed",
      due_date: source.due_date,
    };
  });
}

export async function syncTodoBlock(block: NoteBlock): Promise<NoteBlock> {
  if (block.type !== "todo") return block;
  const content = ensureTodoContent(block.content);
  content.items = await hydrateTodoItems(content.items);
  return { ...block, content: content as unknown as Json };
}

export async function maybeDetachTodoOnRename(
  blockId: string,
  items: TodoItem[],
): Promise<void> {
  await updateBlock(blockId, { content: { ...createEmptyTodoContent(), items } as unknown as Json });
}

export async function clearNotesData(userId: string): Promise<void> {
  const canvases = await fetchCanvases(userId);
  if (canvases.length === 0) return;
  const ids = canvases.map((canvas) => canvas.id);
  const { error } = await supabase.from("note_canvases").delete().in("id", ids);
  if (error) throw new Error(`Failed to clear note data: ${error.message}`);
}

export async function getCanvasById(canvasId: string): Promise<NoteCanvas | null> {
  return fetchCanvas(canvasId);
}
