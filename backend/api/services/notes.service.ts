import { supabase } from "backend/api/supabase";
import type { Json } from "@/types/supabase";

export type NoteCanvas = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};

export type BlockType = "text" | "todo" | "task_ref";

export type NoteBlock = {
  id: string;
  canvas_id: string;
  user_id: string;
  type: BlockType;
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

type TaskMentionResult = {
  id: string;
  title: string;
  type: "personal" | "org";
};

function defaultContent(type: BlockType): Json {
  if (type === "text") return { text: "" };
  if (type === "todo") return { items: [] };
  // task_ref content ({task_id, task_type, title}) is set by the caller via updateBlock after creation
  return {};
}

export async function getOrCreateCanvas(userId: string): Promise<NoteCanvas> {
  const { data, error } = await supabase
    .from("note_canvases")
    // ignoreDuplicates prevents bumping updated_at on every page load
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to get or create canvas: ${error?.message ?? "no data returned"}`);
  }

  return data as NoteCanvas;
}

export async function getBlocks(canvasId: string): Promise<NoteBlock[]> {
  const { data, error } = await supabase
    .from("note_blocks")
    .select("*")
    .eq("canvas_id", canvasId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch blocks: ${error.message}`);
  return (data ?? []) as NoteBlock[];
}

export async function createBlock(
  canvasId: string,
  userId: string,
  type: BlockType,
  positionX: number,
  positionY: number,
): Promise<NoteBlock> {
  const { data, error } = await supabase
    .from("note_blocks")
    .insert({
      canvas_id: canvasId,
      user_id: userId,
      type,
      content: defaultContent(type),
      position_x: positionX,
      position_y: positionY,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create block: ${error?.message ?? "no data returned"}`);
  }
  return data as NoteBlock;
}

export async function updateBlock(
  blockId: string,
  fields: Partial<Pick<NoteBlock, "content" | "position_x" | "position_y" | "width" | "height">>,
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
  return (data ?? []) as NoteConnection[];
}

export async function createConnection(
  canvasId: string,
  sourceBlockId: string,
  targetBlockId: string,
): Promise<NoteConnection> {
  const { data, error } = await supabase
    .from("note_connections")
    .insert({ canvas_id: canvasId, source_block_id: sourceBlockId, target_block_id: targetBlockId })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create connection: ${error?.message ?? "no data returned"}`);
  }
  return data as NoteConnection;
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
    .select()
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
  const table = taskType === "personal" ? "personal_tasks" : "org_tasks"
  const { error } = await supabase.from(table).update({ status }).eq("id", taskId)
  if (error) throw new Error(`Failed to update task status: ${error.message}`)
}

export async function searchTasksForMention(
  userId: string,
  orgId: string,
  search: string,
): Promise<TaskMentionResult[]> {
  const pattern = `%${search}%`;

  const [personalResult, orgResult] = await Promise.all([
    supabase.from("personal_tasks").select("id, title").eq("user_id", userId).ilike("title", pattern).limit(10),
    supabase.from("org_tasks").select("id, title").eq("organization_id", orgId).ilike("title", pattern).limit(10),
  ]);

  if (personalResult.error) throw new Error(`Failed to search personal tasks: ${personalResult.error.message}`);
  if (orgResult.error) throw new Error(`Failed to search org tasks: ${orgResult.error.message}`);

  const personal: TaskMentionResult[] = (personalResult.data ?? []).map((t) => ({ id: t.id, title: t.title, type: "personal" as const }));
  const org: TaskMentionResult[] = (orgResult.data ?? []).map((t) => ({ id: t.id, title: t.title, type: "org" as const }));

  return [...personal, ...org].slice(0, 10);
}
